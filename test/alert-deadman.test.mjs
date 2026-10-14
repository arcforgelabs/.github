// Dead-man check: stale heartbeat opens one urgent issue, fresh closes it,
// and urgent issues off the workboard are assigned to Samuel after 15 minutes.
import { describe, expect, it } from "vitest";
import { checkDeadman, HEARTBEAT_MARKER, inContactHours } from "../alert-deadman/check.mjs";

const NOW = Date.parse("2026-10-14T02:00:00Z"); // 12:30 in Adelaide
const ago = (min) => new Date(NOW - min * 60000).toISOString();

function fakeGithub({ heartbeatAge, issues = [] }) {
  const state = { issues: [...issues], calls: [] };
  if (heartbeatAge !== undefined) state.issues.push({ number: 1, labels: [{ name: "alert-heartbeat" }], assignees: [], created_at: ago(9999) });
  const rest = {
    issues: {
      listForRepo: async ({ labels }) => state.issues.filter((i) => i.state !== "closed" && i.labels.some((l) => l.name === labels)),
      listComments: async () => (heartbeatAge === undefined ? [] : [{ body: `Last Watchdog\n\n${HEARTBEAT_MARKER}`, updated_at: ago(heartbeatAge) }]),
      create: async (p) => { state.calls.push(["create", p]); state.issues.push({ number: 99, labels: p.labels.map((name) => ({ name })), assignees: [], created_at: new Date(NOW).toISOString() }); },
      createComment: async (p) => state.calls.push(["comment", p]),
      update: async (p) => { state.calls.push(["update", p]); state.issues.find((i) => i.number === p.issue_number).state = p.state; },
      addAssignees: async (p) => state.calls.push(["assign", p]),
    },
  };
  return { state, github: { rest, paginate: async (fn, params) => fn(params) } };
}

const run = (github, now = NOW) => checkDeadman({ github, owner: "arcforgelabs", repo: "alerts", now, log: () => {} });

describe("alert dead-man check", () => {
  it("does nothing while the heartbeat is fresh", async () => {
    const { github, state } = fakeGithub({ heartbeatAge: 4 });
    expect(await run(github)).toEqual({ stale: false, assigned: 0 });
    expect(state.calls).toEqual([]);
  });

  it("opens one urgent issue when the heartbeat is stale, not a second one", async () => {
    const { github, state } = fakeGithub({ heartbeatAge: 45 });
    await run(github);
    await run(github);
    const creates = state.calls.filter(([kind]) => kind === "create");
    expect(creates).toHaveLength(1);
    expect(creates[0][1].labels).toEqual(expect.arrayContaining(["alert", "urgent", "alert-deadman"]));
  });

  it("treats a missing heartbeat as stale", async () => {
    const { github } = fakeGithub({});
    expect((await run(github)).stale).toBe(true);
  });

  it("closes the stale issue when the heartbeat is fresh again", async () => {
    const { github, state } = fakeGithub({ heartbeatAge: 2, issues: [{ number: 7, labels: [{ name: "alert-deadman" }, { name: "urgent" }, { name: "on-workboard" }], assignees: [], created_at: ago(60) }] });
    await run(github);
    expect(state.calls.find(([kind]) => kind === "update")[1]).toMatchObject({ issue_number: 7, state: "closed" });
  });

  it("assigns Samuel to urgent issues off the workboard after 15 minutes only", async () => {
    const { github, state } = fakeGithub({
      heartbeatAge: 3,
      issues: [
        { number: 10, labels: [{ name: "urgent" }], assignees: [], created_at: ago(20) },
        { number: 11, labels: [{ name: "urgent" }], assignees: [], created_at: ago(5) },
        { number: 12, labels: [{ name: "urgent" }, { name: "on-workboard" }], assignees: [], created_at: ago(60) },
        { number: 13, labels: [{ name: "urgent" }], assignees: [{ login: "IAMSamuelRodda" }], created_at: ago(60) },
      ],
    });
    expect((await run(github)).assigned).toBe(1);
    expect(state.calls.find(([kind]) => kind === "assign")[1]).toMatchObject({ issue_number: 10, assignees: ["IAMSamuelRodda"] });
  });

  it("waits for 08:00 Adelaide before assigning, but still opens the stale issue at night", async () => {
    const night = Date.parse("2026-10-14T13:00:00Z"); // 23:30 in Adelaide
    const { github, state } = fakeGithub({
      heartbeatAge: 45,
      issues: [{ number: 10, labels: [{ name: "urgent" }], assignees: [], created_at: new Date(night - 3600000).toISOString() }],
    });
    expect(await run(github, night)).toEqual({ stale: true, assigned: 0 });
    expect(state.calls.some(([kind]) => kind === "create")).toBe(true);
    expect(state.calls.some(([kind]) => kind === "assign")).toBe(false);
    const morning = Date.parse("2026-10-14T21:31:00Z"); // 08:01
    // Both the old urgent issue and the stale-heartbeat issue are off the workboard.
    expect((await run(github, morning)).assigned).toBe(2);
  });

  it("knows Adelaide contact hours across daylight saving", () => {
    expect(inContactHours(Date.parse("2026-10-13T21:30:00Z"))).toBe(true); // 08:00 ACDT
    expect(inContactHours(Date.parse("2026-10-13T21:29:00Z"))).toBe(false); // 07:59
    expect(inContactHours(Date.parse("2026-10-14T10:30:00Z"))).toBe(false); // 21:00
    expect(inContactHours(Date.parse("2026-07-14T22:30:00Z"))).toBe(true); // 08:00 ACST
  });
});
