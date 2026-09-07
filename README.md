# architecture-map plugin marketplace

This repository publishes the **architecture-map** plugin for Claude Code,
Cursor, and any agent that reads `SKILL.md` skills.

- Plugin: [`plugins/architecture-map/`](plugins/architecture-map/README.md)
- Claude Code marketplace manifest: `.claude-plugin/marketplace.json`
- Cursor marketplace manifest: `.cursor-plugin/marketplace.json`

## Install from this marketplace

Claude Code:

```
/plugin marketplace add fireweave-HQ-Demo/architecture-map-plugin
/plugin install architecture-map@architecture-map
```

Cursor: add this repository as a plugin marketplace (Settings → Plugins), or
install `plugins/architecture-map` as a local plugin.

The plugin needs [Bun](https://bun.sh) ≥ 1.1 on the machine that runs the agent.

## Develop

```
bun install          # dev dependencies only (typescript, happy-dom)
bun run check        # typecheck + tests
bun run fixtures     # render every golden map to runtime/fixtures/rendered/
```

Tests live in `tests/` and run against `tests/sample-repo`, a small
e-commerce monorepo that the golden maps were traced from. The browser suite
boots the rendered HTML in happy-dom and drives it like a user would.

## Release

1. Bump `version` in both `plugins/architecture-map/.claude-plugin/plugin.json`
   and `plugins/architecture-map/.cursor-plugin/plugin.json` (the hygiene test
   keeps them equal) and add a `CHANGELOG.md` entry.
2. `bun run check`.
3. Tag `architecture-map-v<version>` and push. Marketplace consumers pin the
   tag or the commit.

## License

MIT — see [LICENSE](LICENSE).
