---
name: arch-pr
description: Show what a pull request changes on one path — the same flow traced at the base ref and at the head, merged into unchanged / added / removed / changed hops — as one interactive HTML with "On this PR" and "Before this PR" views.
argument-hint: "[PR number | branch | HEAD] <flow name> [--base <ref>]"
---

# arch-pr — before and after on one path

Read and follow `skills/architecture-map/SKILL.md` in this plugin (mode `pr`).
`RUNTIME` below is that skill's `runtime/` directory
(`${CLAUDE_PLUGIN_ROOT}/skills/architecture-map/runtime` on Claude Code).

Arguments: `$ARGUMENTS` — head (PR number, branch, or `HEAD`; default the
working tree), the flow to overlay, optional `--base <ref>` (default
`origin/main`, else `main`). Missing flow, or a diff that spans several
features with no flow named → ask `pr-flow` (and `pr-head` / `pr-base` if
ambiguous) and stop. Blocked PR maps have empty hops and **no** verdict.

## Steps

1. Resolve refs. State the base and head you are using.
   `git diff --name-status <base>...<head>` tells you which files moved.
2. Inventory the working tree (head):
   `bun RUNTIME/cli.ts inventory --root . --out .architecture-map/inventory.json`.
3. Trace **after** from disk (open every file). Write the hop list to
   `.architecture-map/pr-<n>-after.json` (a `{"hops":[...]}` array without
   `n` / `status`).
4. Trace **before**: for each after-hop source and each deleted file, read
   `git show <base>:<path>`. Write `.architecture-map/pr-<n>-before.json`.
   Do not take hops from the PR description.
5. Merge:

   ```bash
   bun RUNTIME/cli.ts merge-pr --before .architecture-map/pr-<n>-before.json --after .architecture-map/pr-<n>-after.json
   ```

   Put the result in `hops` of `.architecture-map/pr-<n>-<slug>.map.json`.
   Fill `beforeWork` on every `changed` hop from the base file. Set
   `compare: { base, head, pr }`, `questions: []`, `findings[]`. No `verdict`.
6. Validate and render:

   ```bash
   bun RUNTIME/cli.ts validate --in .architecture-map/pr-<n>-<slug>.map.json --inventory .architecture-map/inventory.json
   bun RUNTIME/cli.ts render --in .architecture-map/pr-<n>-<slug>.map.json --out .architecture-map/pr-<n>-<slug>.html --repo-root "$(pwd)"
   ```

7. Reply with: the HTML path and the **added / removed / changed** hop
   titles. Say the page has **On this PR** and **Before this PR** views and
   a summary bar. Do not paste the step briefs.

One PR → one HTML. Never two files, never plan statuses on PR hops.
