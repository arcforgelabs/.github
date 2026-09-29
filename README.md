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
`arc-forge-clawsweeper` deploy-provenance App.

**Turning a rule on or off:**
- For every repo, edit `barnacle/config.json`.
- For one repo, add `.github/barnacle.json` to it, for example
  `{"rules":[{"label":"r: support","enabled":false}]}`. `{"enabled": false}` switches Barnacle off
  for that repo.

## Updating from upstream

```bash
scripts/sync-upstream.sh <openclaw-sha>   # re-vendor, re-apply patches/
npm test                                  # upstream's Barnacle tests plus ours
```

CI runs `scripts/sync-upstream.sh` with no arguments. It fails if `vendor/` drifts from the pinned
SHA plus `patches/`. After merging, bump `BARNACLE_SHA` in the callers.
