# architecture-map

Accurate, interactive architecture maps of any repository, drawn from what is
on disk — never from docs, memory, or a PR description.

Four commands, one document shape, one locked HTML shell:

| Command | Mode | You get |
| --- | --- | --- |
| `/arch-init` | `repo` | The whole surface: every compose service, code unit and feature, as boxes with their files. Mechanically drafted — nothing invented. |
| `/arch-flow <name>` | `flow` | One path through the code, ≤ 12 hops, each backed by the file that proves it, with a plain-language brief per step. |
| `/arch-plan` | `plan` | An unimplemented plan graded against disk: `existing` / `proposed` / `conflict`, a verdict, findings. Asks instead of guessing. |
| `/arch-pr <n> <flow>` | `pr` | The same path at the base and head refs, merged into `unchanged` / `added` / `removed` / `changed`, with **On this PR** / **Before this PR** views. |

On Claude Code the commands are namespaced: `/architecture-map:arch-init` and so on.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1 on the PATH (the runtime is TypeScript run by Bun; no install step, no network).
- `git` for PR mode.

## Install

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

Or Settings → Plugins → add this repository, then install `architecture-map`.
For local hacking, point a local plugin at `plugins/architecture-map`.

**Any other agent** — copy `plugins/architecture-map/skills/architecture-map/`
into the agent's skills directory; `SKILL.md` and `runtime/` are
self-contained.

## What it writes

Everything lands in `<repo>/.architecture-map/` (add it to `.gitignore` if
you do not want generated files committed):

```
.architecture-map/
  inventory.json          what the runtime read from compose + manifests
  repo.map.json           the surface (init)
  repo.html
  flow-<slug>.map.json    one traced path
  flow-<slug>.html
  plan-<slug>.map.json    a graded plan
  plan-<slug>.html
  pr-<n>-<slug>.map.json  a PR overlay (+ the before/after hop traces)
  pr-<n>-<slug>.html
```

Open any `.html` in a browser. It is a single self-contained file.

## The runtime, by hand

```
bun skills/architecture-map/runtime/cli.ts init      --root . [--name <title>] [--compose <file>]...
bun skills/architecture-map/runtime/cli.ts inventory --root . [--out inventory.json] [--compose <file>]...
bun skills/architecture-map/runtime/cli.ts validate  --in map.json [--inventory inventory.json]
bun skills/architecture-map/runtime/cli.ts render    --in map.json --out map.html [--repo-root <dir>]
bun skills/architecture-map/runtime/cli.ts merge-pr  --before before.json --after after.json
bun skills/architecture-map/runtime/cli.ts fixtures  [--out-dir <dir>]
```

Exit codes: `0` ok, `1` the map or inventory is invalid, `2` usage.

## How it stays honest

- **Closed vocabularies.** Hop types name mechanisms (`HTTP`, `database`,
  `message bus`, …), never vendors. Column kinds describe layout, never a
  framework.
- **Every id mirrors disk.** `api/orders/infrastructure` is the
  `infrastructure/` directory of the `orders` feature in the `api` unit. The
  plan checker resolves exactly that, so a made-up node reads as `absent`.
- **Every hop has a source file** that must exist (at the base ref for
  removed PR hops).
- **Plain language.** `work` is a sentence a new teammate understands;
  identifiers stay in `label` and `source`. Empty strings are rejected.
- **Ask, don't guess.** Missing facts produce numbered questions and a
  `blocked` document, never a plausible diagram.
- **The shell is locked.** Agents fill JSON; the HTML/CSS never changes per
  map. The renderer refuses a tampered shell.

## Layout

```
plugins/architecture-map/
  .claude-plugin/plugin.json
  .cursor-plugin/plugin.json
  commands/arch-init.md · arch-flow.md · arch-plan.md · arch-pr.md
  skills/architecture-map/
    SKILL.md                     the procedure the agent follows
    references/                  contract, discovery, ask protocol, visual grammar, examples
    runtime/                     cli · schema · inventory · repo · plan · pr · render · ignore · shell
    runtime/fixtures/            golden maps for every mode
```

## License

MIT — see the repository root.
