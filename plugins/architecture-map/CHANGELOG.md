# Changelog

## 1.1.0

Repository-shape and tooling changes; the runtime, contract and rendered
output are unchanged from `1.0.1`.

- **`tools/sync-manifests.ts`** projects the Cursor `plugin.json` and
  `marketplace.json` from the Claude Code manifests, so the two hosts can
  never drift out of sync. `bun run sync` writes; `bun run sync:check`
  fails on drift and is part of `bun run check` and CI.
- `tests/sample-repo/` moved to `tests/fixtures/sample-repo/` so the
  directory name names the role it plays.

## 1.0.1

- `init` appends `.architecture-map/` to the repository `.gitignore` when
  that path is not already ignored, so generated maps stay untracked.

## 1.0.0

First public release.

- Four modes on one document contract (`schemaVersion: 1`): `repo`, `flow`,
  `plan`, `pr`.
- `init` drafts the repository surface mechanically from compose stacks,
  workspace manifests and feature folders; picks the dev/local stack when
  several exist (`--compose` overrides).
- Generic vocabularies: mechanism-named hop types, layout-named column kinds.
- Plan checks against the inventory (`existing` / `proposed` / `conflict`).
- PR merge of two hop traces into `unchanged` / `added` / `removed` /
  `changed` with `beforeWork`.
- Locked interactive HTML shell: path strip, Play path, inspector step
  brief, status filters, PR views, deep links, reduced-motion support.
- Commands: `arch-init`, `arch-flow`, `arch-plan`, `arch-pr`.
- Packaging: CI on every push, shared walk-ignore list, Bun `engines`,
  contributing guide, Cursor install parity with Claude Code.
