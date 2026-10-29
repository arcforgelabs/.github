// The reusable workflow's job gate runs before any Barnacle code. It skips
// team-authored items, as upstream does, except for the r: not-in-vision label
// event, which run.mjs handles (and which checks the labeller's access).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../.github/workflows/barnacle.yml", import.meta.url), "utf8"));
const gate = workflow.jobs["auto-response"].if.replace(/\s+/g, " ");

describe("Barnacle job gate", () => {
  it("lets the r: not-in-vision label event through for team-authored items", () => {
    expect(gate).toContain(
      `( !contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.issue.author_association || github.event.pull_request.author_association) || (github.event.action == 'labeled' && github.event.label.name == 'r: not-in-vision') ) &&`,
    );
  });

  it("names the same label as the org close rule", () => {
    const config = JSON.parse(readFileSync(new URL("../barnacle/config.json", import.meta.url), "utf8"));
    const rule = config.rules.find((item) => item.closeMaintainerAuthored);
    expect(rule.label).toBe("r: not-in-vision");
  });
});
