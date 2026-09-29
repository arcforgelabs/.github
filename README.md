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

`.github/workflows/clawsweeper-activity.yml` sends new issues and ready PRs to the `clawsweeper` agent
on the Arc Haven gateway (`POST team.arcforge.au/hooks/agent`). It uses upstream ClawSweeper's
notifier (`repair:notify-github-activity`) unchanged, from `arcforgelabs/clawsweeper` at a pinned
SHA.

Upstream runs the notifier inside its public ClawSweeper repo. Ours runs in each calling repo, so
activity from private repos never reaches public Actions logs. The agent hands each item to its own
session, `agent:clawsweeper:gh-<repo>-<n>`, and returns immediately, so each job lasts only a couple
of minutes.

- **Secrets (org):** `CLAWSWEEPER_OPENCLAW_HOOK_URL` and `CLAWSWEEPER_OPENCLAW_HOOK_TOKEN`. The
  token is in Bitwarden as "Arc Haven gateway hooks token (clawsweeper)".
- **Gateway:** the `hooks` block allows only `allowedAgentIds: ["clawsweeper"]`.
- **Cloudflare Access:** bypass applies only to `team.arcforge.au/hooks/agent`.
- **Caller:** `templates/clawsweeper-activity-caller.yml`.

## Updating from upstream

```bash
scripts/sync-upstream.sh <openclaw-sha>   # re-vendor, re-apply patches/
npm test                                  # upstream's Barnacle tests plus ours
```

CI runs `scripts/sync-upstream.sh` with no arguments. It fails if `vendor/` drifts from the pinned
SHA plus `patches/`. After merging, bump `BARNACLE_SHA` in the callers.
