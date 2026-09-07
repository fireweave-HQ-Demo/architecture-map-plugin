---
name: architecture-map
description: >-
  Draw an accurate, interactive architecture map of the current repository:
  the whole surface (init), one traced flow, an unimplemented plan graded
  against disk, or a pull request as before/after of the same path. Use when
  the user asks for an architecture map, a flow/sequence of a feature, a
  review of a plan against the codebase, or what a PR changes on a path.
  Every box and file on the map exists on disk; the skill asks numbered
  questions instead of guessing. Not for authoring designs or writing docs.
metadata:
  author: Architecture Map contributors
  version: 1.0.1
---

# Architecture map

Draw **what actually runs**. Pretty fiction is a fail. Guessing is a fail.

You fill a JSON document; a locked HTML shell renders it. You never author
HTML or CSS for the diagram. Every node comes from the inventory or a file you
opened this turn; every hop names the file that proves it.

## Where things are

`RUNTIME` is the `runtime/` directory next to this file
(on Claude Code: `${CLAUDE_PLUGIN_ROOT}/skills/architecture-map/runtime`).
It needs [Bun](https://bun.sh) ≥ 1.1 on the PATH. If `bun` is missing, say so
and stop — do not hand-write HTML instead.

| Path | Role |
| --- | --- |
| `RUNTIME/cli.ts` | `init` · `inventory` · `validate` · `render` · `merge-pr` · `fixtures` |
| `RUNTIME/schema.ts` | The map contract: closed vocabularies, caps, per-mode rules |
| `RUNTIME/inventory.ts` | Mechanical read of compose stacks, code units, feature folders |
| `RUNTIME/ignore.ts` | Directory names skipped while walking a repository |
| `RUNTIME/gitignore.ts` | Appends `.architecture-map/` to the repo `.gitignore` on `init` |
| `RUNTIME/repo.ts` | Drafts the `repo` map from the inventory (what `init` writes) |
| `RUNTIME/plan.ts` | `membershipOf` + `mechanicalPlanIssues`: statuses disk can contradict |
| `RUNTIME/pr.ts` | `mergePrHops(before, after)` → unchanged / added / removed / changed |
| `RUNTIME/render.ts` · `shell.html` | JSON → interactive HTML. The shell is locked. |
| `RUNTIME/fixtures/*.map.json` | Golden maps for every mode, traced from `tests/sample-repo` |
| `references/map-contract.md` | Field-by-field contract with the plain-language rules |
| `references/discovery-protocol.md` | Where to look for each band and each edge |
| `references/ask-protocol.md` | What must be known per mode, and how to stop |
| `references/visual-grammar.md` | Bands, statuses, what the shell draws |
| `references/examples.md` | Golden prompts → fixtures |

Output lives in `<repo>/.architecture-map/` unless the user names another
place: `inventory.json`, `repo.map.json` + `repo.html`,
`flow-<slug>.map.json` + `.html`, `plan-<slug>…`, `pr-<n>-<slug>…`.
`init` appends `.architecture-map/` to the repository `.gitignore` when
that path is not already ignored.

## Modes

| Mode | Question it answers | Oracle | Hops |
| --- | --- | --- | --- |
| `repo` | What runs and where does code live? | Inventory only | none — surface |
| `flow` | How does this path run today? | Files opened this turn | 1–12 |
| `plan` | Does this unimplemented plan fit what is on disk? | Inventory + plan text | tagged `existing` / `proposed` / `conflict` |
| `pr` | What does this PR change on one path? | Code at `compare.base` (`git show`) and `compare.head` (disk) | tagged `unchanged` / `added` / `removed` / `changed` |

Do not mix modes in one document. A map of today **and** a grade of a plan is
two HTML files (flow first). A PR is **one** HTML with **On this PR** /
**Before this PR** views — never two files. Plan statuses never appear on PR
hops and PR statuses never appear on plan hops.

## Run sequence

1. **Inventory.** From the repo root:
   `bun RUNTIME/cli.ts inventory --root . --out .architecture-map/inventory.json`.
   Read it. Infra and process boxes come from `compose[]` (`band`), columns
   from `units[]` and `features[]`. When the repository carries several
   compose stacks the dev/local one is selected and the others are listed in
   `findings` — ask which one if the user's question is about another stack,
   then pass `--compose <file>`.
2. **Classify** the mode. Unclear → ask `mode` (see ask protocol) and stop.
3. **Ask protocol** ([`references/ask-protocol.md`](references/ask-protocol.md)).
   If anything required for the mode is unknown, output a numbered question
   list and **end the turn**. Do not render. Do not fill in "probably".
   For `plan` and `pr` you may render the blocked shape (empty hops,
   `questions[]` filled) when the user asked for HTML anyway.
4. **Trace from code this turn.** Open the entry point, then follow imports
   and calls: route → handler/use-case → adapters → infra. Docs, READMEs,
   wikis and diagrams are **not** sources of nodes; link them afterwards if
   they help. If you did not open the file, the hop does not exist — write
   what you could not confirm into `unknown[]`.
5. **Mode overlay.**
   - `repo`: `bun RUNTIME/cli.ts init --root . [--name <title>]` writes the
     inventory, a drafted `repo.map.json` and `repo.html`. Read the draft;
     you may improve `title`/`intent` wording, add `findings` you grounded by
     opening files, and add `unknown[]` entries — then `render` again. Do not
     add boxes the inventory did not list.
   - `flow`: fill hops 1..n (≤ 12; split at a real seam if longer).
   - `plan`: every used node and every hop gets `status`
     (`existing` = inventory has it and you opened it; `proposed` =
     `membershipOf` is absent and you named its legal home; `conflict` =
     contradicts disk or the repository's own stated rules). Then `verdict`:
     `pass` / `pass-with-new-work` / `fail` / `blocked`. `fail` needs at least
     one `conflict` finding. Validate with `--inventory` so
     `mechanicalPlanIssues` runs.
   - `pr`: trace **after** from disk; trace **before** with
     `git show <base>:<path>` for each hop source you identified (you run
     git; the runtime does not). Write both hop lists to JSON and run
     `bun RUNTIME/cli.ts merge-pr --before before.json --after after.json`.
     Matching is exact `from+to+type+source`, else the same `from→to` seam.
     `work` is the head text; `changed` hops need `beforeWork` from the base
     file. Removed hops keep the base path you actually opened. Set
     `compare.base`, `compare.head`, optional `compare.pr`. No `verdict`.
6. **Fill the document** per [`references/map-contract.md`](references/map-contract.md).
   Hop clauses, grounded in the opened `source`: required `work` (what this
   step does, in plain language a new teammate can read without opening the
   file); optional `in` / `out` / `fail` / `because` / `not` only when the
   file says so. Function, schema and symbol names belong in `label` and
   `source`, not in `work`. Cap 280 characters each. Never an empty string —
   omit the field. Never invent a status.
7. **Validate.** `bun RUNTIME/cli.ts validate --in <map.json> --inventory .architecture-map/inventory.json`.
   Fix every issue it prints; do not weaken the document to pass.
8. **Render.** `bun RUNTIME/cli.ts render --in <map.json> --out <file.html> --repo-root <abs repo path>`.
   `--repo-root` makes the inspector's file links open in the editor.
9. **Self-check** before you speak (refuse to emit until all hold):
   - Every infra / process id is a compose service id from the inventory
     (plan: or a `proposed` / `conflict` node with a finding).
   - Every column id mirrors disk: `<unit>/<feature>` or `<unit>/<dir>`;
     layer ids extend their column id. `proposed` columns are new paths.
   - No host ports in labels (`localhost:5432`); name the service.
   - ≤ 12 hops, numbered 1..n contiguously; every hop `source` exists on
     disk (PR `removed`: at the base ref).
   - Plan with open questions → `blocked`. PR with open questions → empty
     hops, `questions[]`, no `verdict`.
   - `work` is plain language; identifiers stay in `label` / `source`.
10. **Chat.** Short. The HTML is the deliverable.
    - `repo`: one sentence on what the surface shows, the HTML path, the
      findings worth reading. Say the page is interactive (click a box for
      its files).
    - `flow`: one-sentence intent, HTML path, numbered hop titles. No
      tutorial — the inspector carries each step's full brief.
    - `plan`: **verdict**, HTML path, findings (conflicts first), hop titles
      tagged with their status. Blocked → numbered questions only.
    - `pr`: HTML path, the added / removed / changed hop titles. Say the
      page has **On this PR** and **Before this PR**. Blocked → questions only.

## Forbidden

- Authoring HTML/CSS, editing `shell.html`, or pasting the JSON into chat.
- Taking nodes from docs, wikis, diagrams, commit messages or PR descriptions.
- Guessing an entry actor, a feature name, a runtime, or a new infra service.
- Writing `in` / `work` / `out` / `fail` / `because` / `not` / `beforeWork`
  that the opened file does not support.
- Dropping unused infra so each flow looks like a different product —
  idle boxes stay on the map, greyed.
- Emitting a non-blocked plan or PR while `questions` is non-empty.
- Calling the task done with validator issues outstanding.
