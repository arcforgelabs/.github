# arcforgelabs/.github

Org-wide GitHub automation for Arc Forge. Product repositories own their Barnacle and labeler
workflows. This repository retains shared maintainer command reactions and its own PR checks.

## Shared ownership — 7 November 2026

Samuel chose the current upstream ownership model.
This repository owns Arc Forge GitHub automation, not all repository setup.

| Responsibility | Source |
| --- | --- |
| Common agent workflows | [openclaw/agent-skills](https://github.com/openclaw/agent-skills). Install once; keep repository entrypoints small. |
| Arc Forge instruction policy | [Tools organization kit](https://github.com/arcforgelabs/tools/tree/main/components/org-consistency). Consumers use a reference to the shared policy. |
| Personal instructions | Samuel’s private personal source. Keep it separate from organization policy and public repositories. |
| Reusable release behavior | [openclaw/release-workflows](https://github.com/openclaw/release-workflows). Select a reviewed workflow and the product-specific inputs. |
| Organization branch baseline | [Platform GitHub stack](https://github.com/arcforgelabs/platform/tree/main/tofu/github). Product repositories retain their required checks. |
| GitHub bot workflows | This repository. Existing reviewed callers and permissions remain unchanged. |

New repository setup starts with the [Platform decision record](https://github.com/arcforgelabs/platform/tree/main/docs/github-alignment).
Do not copy a product’s required checks or release grants into an unrelated repository.
No source change here activates a branch rule or publishes a release.

## Maintainer command reactions

Copy `templates/maintainer-command-reactions-caller.yml` into a repository's workflows,
replacing `AUTOMATION_SHA` with the reviewed commit of this repo. Reactions use the caller's
`GITHUB_TOKEN`. The upstream reaction logic and role checks are unchanged; only the reusable
trigger, repository-qualified concurrency and timeout differ.

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

## Validation

Run `npm ci --no-audit --no-fund` and `npm test`. CI runs the same maintainer command reaction
behavior tests. The PR context workflow separately checks pull request descriptions.
