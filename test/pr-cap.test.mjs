// Upstream PR cap with Arc Forge config: label over the limit, exempt
// maintainers and automation branches, honour the override label.
import { describe, expect, it } from "vitest";
import { applyPrCap } from "../barnacle/pr-cap.mjs";
import { runPrCap } from "../barnacle/run.mjs";

function notFound() {
  const error = new Error("not found");
  error.status = 404;
  return error;
}

function setup({ labels = [], openPrs = 21, maintainers = [], head = "feature/x", association = "NONE" } = {}) {
  const calls = { addLabels: [], removeLabel: [] };
  const github = {
    paginate: async () => labels.map((name) => ({ name })),
    rest: {
      issues: {
        listLabelsOnIssue: () => undefined,
        addLabels: async (p) => calls.addLabels.push(p),
        removeLabel: async (p) => calls.removeLabel.push(p),
        getLabel: async () => ({ data: {} }),
        createLabel: async () => undefined,
      },
      teams: {
        getMembershipForUserInOrg: async ({ username }) => {
          if (maintainers.includes(username)) return { data: { state: "active" } };
          throw notFound();
        },
      },
      repos: {
        getCollaboratorPermissionLevel: async () => ({ data: { role_name: "read" } }),
        getContent: async () => { throw notFound(); },
      },
      search: { issuesAndPullRequests: async () => ({ data: { total_count: openPrs } }) },
    },
  };
  const context = {
    repo: { owner: "arcforgelabs", repo: "dictate" },
    payload: {
      pull_request: {
        number: 9,
        author_association: association,
        user: { login: "outsider" },
        head: { ref: head },
        labels: labels.map((name) => ({ name })),
      },
    },
  };
  const input = { github, context, core: { warning: () => undefined, info: () => undefined } };
  return {
    calls,
    run: () => applyPrCap(input, { activePrLimit: 20, maintainerTeam: "maintainer" }),
    runConfigured: () => runPrCap(input),
  };
}

describe("PR cap", () => {
  it.each([
    ["clownfish/retired-fix", true],
    ["clawsweeper/current-fix", false],
  ])("applies the configured retirement policy to %s", async (head, capped) => {
    const { calls, runConfigured } = setup({ head });
    await runConfigured();
    expect(calls.addLabels.map((c) => c.labels)).toEqual(capped ? [["r: too-many-prs"]] : []);
  });

  it.each(["feature/ordinary", "clownfish/retired-fix"])("labels an over-limit author on %s without configured prefixes", async (head) => {
    const { calls, run } = setup({ head });
    await run();
    expect(calls.addLabels.map((c) => c.labels)).toEqual([["r: too-many-prs"]]);
  });

  it("leaves authors at the limit alone", async () => {
    const { calls, run } = setup({ openPrs: 20 });
    await run();
    expect(calls.addLabels).toEqual([]);
  });

  it("exempts maintainers and ClawSweeper branches", async () => {
    for (const options of [{ maintainers: ["outsider"] }, { head: "clawsweeper/fix-1" }, { association: "OWNER" }]) {
      const { calls, run } = setup({ ...options, labels: ["r: too-many-prs"] });
      await run();
      expect(calls.addLabels).toEqual([]);
      expect(calls.removeLabel.map((c) => c.name)).toEqual(["r: too-many-prs"]);
    }
  });

  it("removes the cap label when the override is present", async () => {
    const { calls, run } = setup({ labels: ["r: too-many-prs", "r: too-many-prs-override"] });
    await run();
    expect(calls.addLabels).toEqual([]);
    expect(calls.removeLabel.map((c) => c.name)).toEqual(["r: too-many-prs"]);
  });
});
