# arcforgelabs/.github

Org-wide GitHub automation for Arc Forge Labs. We port OpenClaw's automation faithfully: upstream
code is vendored unchanged except for small, documented patches that turn OpenClaw-specific
values into config.

## Barnacle

Barnacle is OpenClaw's deterministic triage bot (`openclaw/openclaw`
`scripts/github/barnacle-auto-response.mjs`). It does five jobs:

- A **close-reason label** (`r: support`, `r: no-ci-pr` and the rest) posts a canned reply, closes
  the item, and sometimes locks it.
- `r: spam`, `invalid` and `dirty` close.
- **Candidate labels** (`triage: *`) go on outside PRs. They close only when a maintainer applies one
  by hand or adds `trigger-response`.
- A **20-open-PR cap** applies `r: too-many-prs`. `r: too-many-prs-override` cancels it.
- It warns about **maintainer spam-pings**.

These are exempt, as upstream: `OWNER`, `MEMBER` and `COLLABORATOR` authors, the `maintainer` team,
admin/maintain/write repo roles, the `maintainer` label, bots, and `clawsweeper/` or `clownfish/`
branches. `bad-barnacle` switches Barnacle off for one item.

| Path | What it is |
|---|---|
| `vendor/openclaw/` | Upstream files at the SHA in `vendor/openclaw/UPSTREAM`. They include upstream's own Barnacle tests, plus `auto-response.yml` and `labeler.yml` for reference. |
| `patches/barnacle-config.patch` | The only change to upstream logic. It adds `configureBarnacle(config)`. Omitted keys keep upstream's values, and upstream's tests still pass. |
| `barnacle/config.json` | Arc Forge values: messages, rule switches, PR limit and team slug. OpenClaw-product rules (`r: skill`, `r: testflight`, `r: bluebubbles`, `r: moltbook`, `r: third-party-extension` and two candidates) are kept with `enabled: false`. |
| `barnacle/run.mjs` | Entry point. It merges the caller repo's optional `.github/barnacle.json` (merged by rule label) and runs Barnacle. |
| `barnacle/pr-cap.mjs` | Upstream's "Apply too-many-prs label" step from `labeler.yml`. Only the limit, team and prefixes come from config. |
| `.github/workflows/barnacle.yml` | The reusable workflow. It runs on GitHub-hosted runners with the `arc-forge-barnacle` App token and checks out only this repo at the pinned commit. |
| `templates/barnacle-caller.yml` | The thin caller each repo copies to `.github/workflows/barnacle.yml`, with `BARNACLE_SHA` replaced by a commit of this repo. |

**Identity:** the private GitHub App `arc-forge-barnacle` (ID 5116230), installed on all org
repositories. It has issues and pull requests write, and members, metadata, contents and actions
read. It has no webhook. Its key is the org secret `BARNACLE_APP_PRIVATE_KEY`, and the Bitwarden
item is "Arc Forge Barnacle GitHub App". It's separate from the ClawSweeper review App and from the
`arc-forge-clawsweeper` deploy-provenance App. The App's bot account is `arc-forge-barnacle[bot]`,
**user ID 335282622**. That is the value to swap in wherever upstream hardcodes Barnacle's actor IDs
(257215752 and 264559031), for example in `stale.yml`.

**Keep org membership public.** GitHub only reports `author_association: MEMBER` in event payloads
for members whose membership is public. Upstream's job-level skip depends on that, so for a private
member every event starts a billed job before the script exempts them through the `maintainer`
team.

**Turning a rule on or off:**
- For every repo, edit `barnacle/config.json`.
- For one repo, add `.github/barnacle.json` to it, for example
  `{"rules":[{"label":"r: support","enabled":false}]}`. `{"enabled": false}` switches Barnacle off
  for that repo.

## Labeler and maintainer command reactions

Copy `templates/labeler-caller.yml` and `templates/maintainer-command-reactions-caller.yml`
into a repository's workflows, replacing `AUTOMATION_SHA` with the reviewed commit of this repo.
Labeler reuses the Barnacle App secret and variable. Reactions use the caller's `GITHUB_TOKEN`.

Labeler applies upstream's size thresholds (<50 / <200 / <500 / <1000 / XL), maintainer-team
membership, and beta-blocker title rules. Upstream excludes `docs/`, `pnpm-lock.yaml`, `yarn.lock`
and `bun.lockb` from size; other lockfiles still count. Optional area rules live in the caller's
`.github/labeler.yml`; a missing map skips only area labels. Manual dispatch backfills size,
maintainer and beta-blocker labels on open PRs (upstream does not backfill area labels).

The reusable Labeler preserves the vendored scripts. Adaptations are the workflow-call interface,
Arc App identity, a checkout of this automation repo at `job.workflow_sha`, the vendored helper
path, optional area-map loading from the caller's trusted base SHA, repository-qualified
concurrency, timeouts, and backfill input transport. One upstream bug is fixed: backfill keeps page size constant
so a limit such as 75 with 50 per page does not process the same PRs twice. The PR-cap step is excluded because Barnacle
already owns it. No pull-request code is checked out or executed. Reaction logic and role checks
are unchanged; only the reusable trigger, concurrency namespace and timeout differ.

Command reactions acknowledge `/autoclose`, `/clawsweeper autoclose`, `/clawsweeper automerge`,
`/merge`, `/land`, and `/landpr` from users with write/maintain/admin permission. Only autoclose
commands acknowledge issue comments; the rest require a PR. They do not execute commands or
prove another worker has accepted them. `MAINTAINER_COMMAND_REACTIONS` can override the list.

## Compute decision (2026-09-29)

Use GitHub Actions for repository automation and CI, and Linode for disposable Crabbox test
machines. No Hetzner, Blacksmith or OpenBao dependency is needed. Start with direct Linode CLI
leases without a coordinator or hydrated self-hosted Actions runner. Provider writes remain on
the approved gateway egress. Test-box cleanup and secretless execution must be verified before
rollout; the bot suite's later Stale/security/Mantis stages retain their dry-run and proof gates.

## ClawSweeper activity

Retired 2026-10-12. ClawSweeper intake no longer runs as a GitHub Actions job:
each issue, PR and comment event started a hosted job that billed at least one
minute, about a third of the org's private allowance. An `arcforgelabs`
organization webhook now delivers the same events to the ClawSweeper Worker,
which applies the same filter: pull requests and maintainer
`@clawsweeper review` commands on pull requests enter the durable review queue;
opened issues and review commands on issues go to the `clawsweeper` agent on Arc
Haven. Enrolled repositories are listed in `ARCFORGE_ACTIVITY_REPOSITORIES` in
`dashboard/wrangler.arcforge.toml` in `arcforgelabs/clawsweeper`; the filter is
`dashboard/arcforge-activity.ts` there, and failed deliveries can be redelivered
from the organization webhook's settings.

## Alert dead-man check

`.github/workflows/alert-deadman.yml` runs every 10 minutes on GitHub-hosted runners. It is the
alert pipeline's dead-man's switch ([platform#7](https://github.com/arcforgelabs/platform/issues/7)),
so it runs here, off Arc Forge's hosts, and this public repo spends no private Actions minutes.
Logic: `alert-deadman/check.mjs`. Tests: `test/alert-deadman.test.mjs`.

- It reads the heartbeat comment that alert-receiver on `prod-forge-gateway` edits on every
  Alertmanager Watchdog, in the private `arcforgelabs/alerts` repo.
- Older than 20 minutes: it opens one urgent `alert-deadman` issue there, and closes it when the
  heartbeat is fresh again.
- Any urgent issue in `arcforgelabs/alerts` that is not on Arc's workboard after 15 minutes is
  assigned to Samuel. That is the last resort when the gateway or Haven is down. Like Arc's
  heartbeat, it contacts him only from 08:00 to 21:00 Adelaide time. An urgent item made at night
  waits until 08:00. A future "call me at any time" protocol will cover life-or-death and
  business-ending events.
- **Identity:** the alert-receiver GitHub App. Org variable `ALERT_APP_ID`, secret
  `ALERT_APP_PRIVATE_KEY`. The workflow asks only for issues write on `arcforgelabs/alerts`.
- The log prints counts and ages only, because this repo is public.
- GitHub disables a public repo's scheduled workflows after 60 days without activity. alert-receiver
  raises an urgent issue when this workflow has not run for an hour.

Design and runbook: `docs/automation/alert-triage.md` in arcforgelabs/infrastructure.

## Updating from upstream

```bash
scripts/sync-upstream.sh <openclaw-sha>   # re-vendor, re-apply patches/
npm test                                  # upstream's Barnacle tests plus ours
```

CI runs `scripts/sync-upstream.sh` with no arguments. It fails if `vendor/` drifts from the pinned
SHA plus `patches/`. After merging, bump `BARNACLE_SHA` in the callers.
