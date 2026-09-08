---
name: arch-init
description: Initialise the architecture map of this repository — every compose service, code unit and feature as one interactive HTML page, with no guessed paths.
argument-hint: "[--name <title>] [--compose <file>] [--out-dir <dir>]"
---

# arch-init — the repository surface

Read and follow `skills/architecture-map/SKILL.md` in this plugin (mode `repo`).
`RUNTIME` below is that skill's `runtime/` directory
(`${CLAUDE_PLUGIN_ROOT}/skills/architecture-map/runtime` on Claude Code).

Arguments: `$ARGUMENTS` — optional `--name <title>`, one or more
`--compose <file>` to pick a stack, `--out-dir <dir>` (default
`.architecture-map/` in the repo root).

## Steps

1. Confirm `bun --version` works. If not, tell the user to install Bun and stop.
2. From the repository root run:

   ```bash
   bun RUNTIME/cli.ts init --root . $ARGUMENTS
   ```

   It writes `inventory.json`, `repo.map.json` and `repo.html`, appends
   `.architecture-map/` to `.gitignore` when that path is not already
   ignored, and prints a one-line surface count.
3. Read `repo.map.json` and `inventory.json`. If `findings` say other compose
   stacks exist and the user's question is about one of them, ask which,
   then re-run with `--compose <file>`.
4. Optional polish, only from files you open: a better `intent`, extra
   `findings` (severity `info`) with the file named in `detail`, `unknown[]`
   entries for what you could not confirm. Never add boxes the inventory did
   not list. Then:

   ```bash
   bun RUNTIME/cli.ts validate --in .architecture-map/repo.map.json --inventory .architecture-map/inventory.json
   bun RUNTIME/cli.ts render --in .architecture-map/repo.map.json --out .architecture-map/repo.html --repo-root "$(pwd)"
   ```

5. Reply with: one sentence on what the surface shows, the HTML path, the
   findings worth reading, and that the page is interactive — unit cards
   collapse until clicked, `⌘K` focuses a search input, the **Map** toggle
   swaps to a treemap sized by file count, and any deep link of the form
   `.../repo.html#node=<unit>/<column>` opens the ancestor cards so the
   target is in view. Run `/arch-flow <name>` to trace a path through it.

Do not draw hops here. The surface has none.
