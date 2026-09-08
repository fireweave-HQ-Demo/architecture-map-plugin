# architecture-map

Accurate, interactive architecture maps of any repository, drawn from what is
on disk — never from docs, memory, or a PR description.

One skill, four commands, one document shape, one locked HTML shell.
On Claude Code the commands are namespaced: `/architecture-map:arch-init`
and so on.

## Skill

**`architecture-map`** — the procedure the agent follows. Use when the
user asks for an architecture map, a flow or sequence of a feature, a
review of a plan against the codebase, or what a PR changes on a path.
It fills a JSON `MapDocument`; `shell.html` renders it. Every node comes
from inventory or a file opened this turn; every hop names the file that
proves it. Missing facts become numbered questions — never a guessed
diagram. Not for authoring designs or writing docs.

## Commands

**`/arch-init`** (`repo`) — the whole surface: every compose service,
code unit and feature as boxes with their files. Drafted mechanically
from inventory; nothing invented; no hops. Run this first, or after the
layout changed. Optional `--name <title>`, `--compose <file>` (pick a
stack when several exist), `--out-dir` (default `.architecture-map/`).
The rendered page opens compact even on a 50-unit monorepo: unit
cards are collapsed by default, a top toolbar carries a search input
(`⌘K`) plus a **List ↔ Map** toggle (map is a treemap sized by file
count), and any conflict finding rides above the fold.

**`/arch-flow <name>`** (`flow`) — how this path runs today. Trace from
the entry (route, page, CLI, consumer, cron) through the code, ≤ 12
hops, each backed by a file you opened, with a plain-language brief per
step. Name the flow. Longer paths split at a real seam (queue, process
boundary) into two maps.

**`/arch-plan [plan]`** (`plan`) — does this unimplemented plan fit what
is on disk? Paste a plan or give a file path. Every planned node is
`existing` / `proposed` / `conflict`; the map carries a verdict
(`pass` / `pass-with-new-work` / `fail` / `blocked`) and findings.
Unknown entry actor, feature, or trigger → questions and stop. Grades a
plan; it does not write a replacement design.

**`/arch-pr [n] <flow>`** (`pr`) — what this PR changes on **one** path.
The same flow at the base ref and at the head, merged into `unchanged` /
`added` / `removed` / `changed`, with **On this PR** / **Before this PR**
views. One HTML, never two files. Default head is the working tree;
default base is `origin/main`.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1 on the PATH (the runtime is TypeScript run by Bun; no install step, no network).
- `git` for PR mode.

## Install

**Claude Code** — slash commands are the supported path:

```
/plugin marketplace add fireweave-HQ-Demo/architecture-map-plugin
/plugin install architecture-map@architecture-map
/reload-plugins
```

**Cursor** — Settings → Plugins (or Customize) → add
`https://github.com/fireweave-HQ-Demo/architecture-map-plugin`, then
install `architecture-map` and reload if needed. Agent/CLI may use the
same `/plugin …` lines as Claude Code; Settings is the reliable IDE
install. For local hacking, put this directory under
`~/.cursor/plugins/local/`.

**Any other agent** — copy `plugins/architecture-map/skills/architecture-map/`
into the agent's skills directory; `SKILL.md` and `runtime/` are
self-contained.

## What it writes

Everything lands in `<repo>/.architecture-map/`. `init` adds that path to
`.gitignore` when it is not already ignored:

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
    runtime/                     cli · schema · inventory · repo · plan · pr · render · ignore · gitignore · shell
    runtime/fixtures/            golden maps for every mode
```

## License

MIT — see the repository root.
