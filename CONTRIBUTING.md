# Contributing

## Develop

```bash
bun install
bun run check      # typecheck + tests
bun run fixtures  # regenerate rendered goldens (gitignored)
```

The installable plugin lives under `plugins/architecture-map/`. Tests and
`tests/sample-repo/` stay outside the plugin so strangers never download them.

## Layout rules

- Runtime TypeScript may import only `./` siblings and `node:` builtins.
- Do not name Fireweave, this monorepo, or vendor products in plugin prose or
  hop types — mechanisms only (`message bus`, not `nats`).
- Keep `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json` in lockstep
  (name, version, description, license). The hygiene tests enforce this.
- Bump both plugin manifests, `skills/architecture-map/SKILL.md` metadata
  `version`, the root `package.json` version, and `CHANGELOG.md` together.

## Release

1. `bun run check`
2. Commit on `main`
3. Tag `architecture-map-v<version>` and push the tag
4. Marketplace consumers pin the tag or the commit SHA
