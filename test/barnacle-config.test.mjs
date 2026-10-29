// Arc Forge config on top of upstream Barnacle: disabled rules stay inert,
// enabled rules close, members/maintainers/bots stay exempt, repo overrides merge.
import { describe, expect, it } from "vitest";
import { mergeConfig, run } from "../barnacle/run.mjs";
import { managedLabelSpecs } from "../vendor/openclaw/scripts/github/barnacle-auto-response.mjs";

function notFound() {
  const error = new Error("not found");
  error.status = 404;
  return error;
}

function mockGithub({ maintainers = [], override, senderRole = "read" } = {}) {
  const calls = { addLabels: [], createComment: [], lock: [], removeLabel: [], update: [] };
  const github = {
    paginate: async () => [],
    rest: {
      issues: {
        addLabels: async (p) => calls.addLabels.push(p),
        createComment: async (p) => calls.createComment.push(p),
        createLabel: async () => undefined,
        getLabel: async ({ name }) => ({ data: { color: managedLabelSpecs[name]?.color ?? "C5DEF5", description: managedLabelSpecs[name]?.description ?? "" } }),
        lock: async (p) => calls.lock.push(p),
        removeLabel: async (p) => calls.removeLabel.push(p),
        update: async (p) => calls.update.push(p),
        updateLabel: async () => undefined,
      },
      pulls: { listFiles: async () => [] },
      repos: {
        getCollaboratorPermissionLevel: async ({ username }) =>
          username === "IAMSamuelRodda"
            ? { data: { permission: senderRole, role_name: senderRole } }
            : { data: { permission: "read", role_name: "read" } },
        getContent: async () => {
          if (!override) throw notFound();
          return { data: { content: Buffer.from(JSON.stringify(override)).toString("base64") } };
        },
      },
      teams: {
        getMembershipForUserInOrg: async ({ username }) => {
          if (maintainers.includes(username.toLowerCase())) return { data: { state: "active" } };
          throw notFound();
        },
      },
    },
  };
  return { calls, github };
}

function issueContext({ labels = [], action = "labeled", label, association = "NONE", login = "outsider", comment, title = "Something broke", body = "" } = {}) {
  return {
    repo: { owner: "arcforgelabs", repo: "arc-forge-deck" },
    payload: {
      action,
      label: label ? { name: label } : undefined,
      sender: { login: "IAMSamuelRodda", type: "User" },
      repository: { default_branch: "main" },
      issue: { number: 7, title, body, author_association: association, user: { login }, labels: labels.map((name) => ({ name })) },
      comment,
    },
  };
}

const core = { info: () => undefined, warning: () => undefined };

async function barnacle(context, options) {
  const { calls, github } = mockGithub(options);
  await run({ github, context, core });
  return calls;
}

describe("Arc Forge Barnacle config", () => {
  it("closes with the Arc Forge message when a maintainer applies an enabled rule label", async () => {
    const calls = await barnacle(issueContext({ labels: ["r: support"], label: "r: support" }));
    expect(calls.createComment).toHaveLength(1);
    expect(calls.createComment[0].body).toContain("Arc Forge support");
    expect(calls.createComment[0].body).not.toMatch(/discord|clawhub|openclaw/i);
    expect(calls.update).toEqual([expect.objectContaining({ issue_number: 7, state: "closed" })]);
  });

  it("keeps OpenClaw-product rules defined but inert", async () => {
    const calls = await barnacle(issueContext({ labels: ["r: skill"], label: "r: skill" }));
    expect(calls.createComment).toEqual([]);
    expect(calls.update).toEqual([]);
    expect(managedLabelSpecs["r: skill"].description).not.toMatch(/clawhub/i);
  });

  it("does not answer disabled comment keyword triggers", async () => {
    const calls = await barnacle(
      issueContext({ action: "created", comment: { body: "any testflight or moltbook build?", user: { login: "outsider", type: "User" } } }),
    );
    expect(calls.createComment).toEqual([]);
  });

  it("keyword-labels only security, on a label event as upstream does", async () => {
    const calls = await barnacle(issueContext({ labels: ["bug"], label: "bug", title: "TestFlight moltbook security hole" }));
    expect(calls.addLabels.map((c) => c.labels).flat()).toEqual(["security"]);
  });

  it("exempts maintainer-team authors and org members", async () => {
    const maintainer = await barnacle(issueContext({ labels: ["r: support"], label: "r: support", login: "kaylarodda" }), { maintainers: ["kaylarodda"] });
    const member = await barnacle(issueContext({ labels: ["r: support"], label: "r: support", association: "MEMBER", login: "someone" }));
    expect([...maintainer.update, ...member.update]).toEqual([]);
  });

  it("lets a repo override one rule without copying the rest", async () => {
    const calls = await barnacle(issueContext({ labels: ["r: support"], label: "r: support" }), {
      override: { rules: [{ label: "r: support", enabled: false }] },
    });
    expect(calls.update).toEqual([]);
  });

  // A repo override's stateReason reaches GitHub as state_reason (arcforgelabs/dictate#138).
  const notPlannedOverride = { rules: [{ label: "r: not-in-vision", close: true, stateReason: "not_planned", message: "Out of vision." }] };

  it("passes a repo override rule's stateReason through as state_reason", async () => {
    const calls = await barnacle(issueContext({ labels: ["r: not-in-vision"], label: "r: not-in-vision" }), { override: notPlannedOverride });
    expect(calls.createComment.map((c) => c.body)).toEqual(["Out of vision."]);
    expect(calls.update).toEqual([
      { owner: "arcforgelabs", repo: "arc-forge-deck", issue_number: 7, state: "closed", state_reason: "not_planned" },
    ]);
  });

  it("sends the same close for an outside pull request", async () => {
    const context = issueContext({ labels: ["r: not-in-vision"], label: "r: not-in-vision" });
    const { issue } = context.payload;
    context.payload = { ...context.payload, issue: undefined, pull_request: { ...issue, head: { ref: "feature" } } };
    const calls = await barnacle(context, { override: notPlannedOverride });
    expect(calls.update).toEqual([
      { owner: "arcforgelabs", repo: "arc-forge-deck", issue_number: 7, state: "closed", state_reason: "not_planned" },
    ]);
  });

  it("merges repo overrides by label", () => {
    const merged = mergeConfig(
      { activePrLimit: 20, rules: [{ label: "a", close: true }, { label: "b", close: true }] },
      { activePrLimit: 5, rules: [{ label: "b", enabled: false }] },
    );
    expect(merged.activePrLimit).toBe(5);
    expect(merged.rules).toEqual([{ label: "a", close: true }, { label: "b", close: true, enabled: false }]);
  });

  describe("r: not-in-vision", () => {
    const visionLabel = (extra = {}) =>
      issueContext({ labels: ["r: not-in-vision"], label: "r: not-in-vision", ...extra });

    it("closes the team's own item when someone with write access applies it", async () => {
      const calls = await barnacle(visionLabel({ association: "OWNER", login: "IAMSamuelRodda" }), { senderRole: "admin" });
      expect(calls.createComment).toHaveLength(1);
      expect(calls.createComment[0].body).toContain("VISION.md");
      expect(calls.update).toEqual([expect.objectContaining({ issue_number: 7, state: "closed", state_reason: "not_planned" })]);
    });

    it("closes an outside item once, not twice", async () => {
      const calls = await barnacle(visionLabel(), { senderRole: "write" });
      expect(calls.createComment).toHaveLength(1);
      expect(calls.update).toHaveLength(1);
    });

    it("does nothing when the label was applied without write access", async () => {
      const calls = await barnacle(visionLabel({ association: "MEMBER" }), { senderRole: "read" });
      expect(calls.createComment).toEqual([]);
      expect(calls.update).toEqual([]);
    });

    it("does nothing when a bot applied the label", async () => {
      const context = visionLabel({ association: "OWNER" });
      context.payload.sender = { login: "clawsweeper[bot]", type: "Bot" };
      const calls = await barnacle(context, { senderRole: "admin" });
      expect(calls.update).toEqual([]);
    });

    it("leaves other close rules exempt for the team, as upstream", async () => {
      const calls = await barnacle(
        issueContext({ labels: ["r: support"], label: "r: support", association: "OWNER" }),
        { senderRole: "admin" },
      );
      expect(calls.update).toEqual([]);
    });

    it("closes pull requests without an issue state reason", async () => {
      const context = visionLabel();
      context.payload.pull_request = { ...context.payload.issue, number: 9 };
      delete context.payload.issue;
      const calls = await barnacle(context, { senderRole: "maintain" });
      expect(calls.update).toEqual([{ owner: "arcforgelabs", repo: "arc-forge-deck", issue_number: 9, state: "closed" }]);
    });
  });
});
