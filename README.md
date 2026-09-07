# architecture-map plugin marketplace

This repository publishes the **architecture-map** plugin for Claude Code,
Cursor, and any agent that reads `SKILL.md` skills.

- Plugin: [`plugins/architecture-map/`](plugins/architecture-map/README.md)
- Claude Code marketplace manifest: `.claude-plugin/marketplace.json`
- Cursor marketplace manifest: `.cursor-plugin/marketplace.json`

## Install from this marketplace

**Claude Code**

```
/plugin marketplace add fireweave-HQ-Demo/architecture-map-plugin
/plugin install architecture-map@architecture-map
```

**Cursor**

```
/plugin marketplace add fireweave-HQ-Demo/architecture-map-plugin
/plugin install architecture-map@architecture-map
```

Or: Settings → Plugins → add
`https://github.com/fireweave-HQ-Demo/architecture-map-plugin`, then install
`architecture-map`. For local hacking, point a local plugin at
`plugins/architecture-map`.

The plugin needs [Bun](https://bun.sh) ≥ 1.1 on the machine that runs the agent.

## Skills

The plugin ships **one skill** and **four commands**. The skill is the
procedure; the commands pick a mode.

**`architecture-map`** (skill) — draw what actually runs. Use when the
user asks for an architecture map, a flow of a feature, a review of a
plan against disk, or what a PR changes on a path. Agents fill JSON; a
locked HTML shell renders it. Asks numbered questions instead of
guessing. Not for authoring designs or writing docs.

**`/arch-init`** — repository surface (`repo` mode). Every compose
service, code unit and feature as boxes with their files. Mechanically
drafted from inventory; no hops. Optional `--name`, `--compose <file>`,
`--out-dir`.

**`/arch-flow <name>`** — one path today (`flow` mode). Entry to infra,
≤ 12 hops, each backed by a file the agent opened, with a
plain-language brief per step.

**`/arch-plan [plan]`** — unimplemented plan vs disk (`plan` mode).
Nodes tagged `existing` / `proposed` / `conflict`, plus a verdict and
findings. Missing facts → `blocked` and questions. Does not write a
replacement design.

**`/arch-pr [n] <flow>`** — one path before/after a PR (`pr` mode).
Merged hops: `unchanged` / `added` / `removed` / `changed`. One HTML
with **On this PR** / **Before this PR** views.

On Claude Code the commands are namespaced:
`/architecture-map:arch-init` and so on. Output lands in
`<repo>/.architecture-map/`. See
[`plugins/architecture-map/README.md`](plugins/architecture-map/README.md)
for the file layout and honesty rules.

## Develop

See [CONTRIBUTING.md](CONTRIBUTING.md).

```
bun install          # dev dependencies only (typescript, happy-dom)
bun run check        # typecheck + tests (also runs in CI on every push)
bun run fixtures     # render every golden map to runtime/fixtures/rendered/
```

Tests live in `tests/` and run against `tests/sample-repo`, a small
e-commerce monorepo that the golden maps were traced from. The browser suite
boots the rendered HTML in happy-dom and drives it like a user would.

## Release

1. Bump `version` in both `plugins/architecture-map/.claude-plugin/plugin.json`
   and `plugins/architecture-map/.cursor-plugin/plugin.json` (the hygiene test
   keeps them equal), the skill `metadata.version`, root `package.json`, and
   add a `CHANGELOG.md` entry.
2. `bun run check`.
3. Tag `architecture-map-v<version>` and push. Marketplace consumers pin the
   tag or the commit.

## License

MIT — see [LICENSE](LICENSE).
