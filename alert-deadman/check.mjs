// Dead-man check for the Arc Forge alert pipeline (arcforgelabs/platform#7).
//
// Runs on GitHub-hosted runners from .github/workflows/alert-deadman.yml, so it
// depends on none of our hosts. alert-receiver on prod-forge-gateway edits one
// comment on the heartbeat issue in arcforgelabs/alerts every time Alertmanager's
// Watchdog arrives (about every 5 minutes). This check:
//   1. opens an urgent "heartbeat is stale" issue when that comment is older
//      than STALE_MINUTES, and closes it when the heartbeat is fresh again;
//   2. assigns Samuel to every urgent issue that is not on Arc's workboard after
//      FALLBACK_MINUTES. That is the last resort when the gateway or Haven is
//      down: GitHub's own notification reaches him.
// This repo is public, so the log prints counts and ages only, never titles.

export const HEARTBEAT_LABEL = "alert-heartbeat";
export const HEARTBEAT_MARKER = "<!-- alert-pipeline-heartbeat -->";
export const DEADMAN_LABEL = "alert-deadman";

const minutes = (ms) => Math.floor(ms / 60000);

export async function checkDeadman({ github, owner, repo, now = Date.now(), staleMinutes = 20, fallbackMinutes = 15, assignee = "IAMSamuelRodda", log = console.log }) {
  const issues = github.rest.issues;
  const listOpen = (labels) => github.paginate(issues.listForRepo, { owner, repo, state: "open", labels, per_page: 100 });

  // 1. Heartbeat age.
  let ageMs = Infinity;
  const [heartbeat] = await listOpen(HEARTBEAT_LABEL);
  if (heartbeat) {
    const comments = await github.paginate(issues.listComments, { owner, repo, issue_number: heartbeat.number, per_page: 100 });
    const beats = comments.filter((c) => (c.body ?? "").includes(HEARTBEAT_MARKER));
    if (beats.length) ageMs = now - Math.max(...beats.map((c) => Date.parse(c.updated_at)));
  }
  const stale = ageMs > staleMinutes * 60000;
  log(`heartbeat age: ${Number.isFinite(ageMs) ? `${minutes(ageMs)} min` : "no heartbeat found"}; limit ${staleMinutes} min`);

  const [deadman] = await listOpen(DEADMAN_LABEL);
  if (stale && !deadman) {
    const age = Number.isFinite(ageMs) ? `${minutes(ageMs)} minutes ago` : "never (no heartbeat comment found)";
    await issues.create({
      owner, repo,
      title: "[critical] Alert pipeline heartbeat is stale",
      labels: ["alert", "urgent", "severity:critical", DEADMAN_LABEL],
      body: [
        `The last Watchdog heartbeat reached alert-receiver ${age}. Alerts may not be reaching anyone.`,
        "",
        "Check, in order: Alertmanager on prod-monitoring, alert-receiver on prod-forge-gateway, the tailnet grant to port 9097.",
        "Runbook: https://github.com/arcforgelabs/infrastructure/blob/master/docs/automation/alert-triage.md#dead-mans-switch",
        "",
        "Opened by alert-deadman.yml in arcforgelabs/.github. It closes this issue when the heartbeat is fresh again.",
      ].join("\n"),
    });
    log("opened the stale-heartbeat issue");
  } else if (!stale && deadman) {
    await issues.createComment({ owner, repo, issue_number: deadman.number, body: `The heartbeat is fresh again (${minutes(ageMs)} minutes old). Closed by alert-deadman.yml.` });
    await issues.update({ owner, repo, issue_number: deadman.number, state: "closed", state_reason: "completed" });
    log("closed the stale-heartbeat issue");
  }

  // 2. Urgent issues that never reached the workboard.
  let assigned = 0;
  for (const issue of await listOpen("urgent")) {
    const names = new Set((issue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)));
    if (names.has("on-workboard") || (issue.assignees ?? []).length) continue;
    if (now - Date.parse(issue.created_at) < fallbackMinutes * 60000) continue;
    await issues.addAssignees({ owner, repo, issue_number: issue.number, assignees: [assignee] });
    await issues.createComment({ owner, repo, issue_number: issue.number, body: `Urgent and not on Arc's workboard after ${fallbackMinutes} minutes, so alert-receiver or Haven may be down. Assigned to @${assignee} by alert-deadman.yml.` });
    assigned += 1;
  }
  log(`urgent issues assigned as a last resort: ${assigned}`);
  return { stale, assigned };
}
