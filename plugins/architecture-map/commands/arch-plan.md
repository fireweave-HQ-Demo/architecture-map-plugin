---
name: arch-plan
description: Review an unimplemented plan against what is actually on disk — every planned node marked existing / proposed / conflict, a verdict, and findings — rendered as an interactive HTML map. Asks instead of guessing.
argument-hint: "[path to plan file, or paste the plan]"
---

# arch-plan — does this plan fit the codebase?

Read and follow `skills/architecture-map/SKILL.md` in this plugin (mode `plan`).
`RUNTIME` below is that skill's `runtime/` directory
(`${CLAUDE_PLUGIN_ROOT}/skills/architecture-map/runtime` on Claude Code).

Argument: `$ARGUMENTS` — a path to the plan, or the plan text itself. If
neither is present and no plan was pasted in this conversation, ask for
`plan-artifact` and stop.

## Steps

1. Inventory: `bun RUNTIME/cli.ts inventory --root . --out .architecture-map/inventory.json`.
2. Ask protocol (`references/ask-protocol.md`). Unknown entry actor, feature
   name, trigger, async mechanism, new service ids, or target unit →
   numbered questions, `verdict: "blocked"`, **stop**. Render the blocked
   shape only if the user asked for HTML.
3. Trace the **existing** part of the plan from files you open. Classify
   every planned node with the rules in `references/discovery-protocol.md`
   (`existing` / `proposed` / `conflict`). Read the repository's own stated
   rules (contributing guide, architecture notes, lint config) for house
   rules and cite the file in each finding.
4. Write `.architecture-map/plan-<slug>.map.json`: statuses on every used
   node and every hop, `findings[]` (conflicts first, each naming what it
   collides with), `questions: []`, and `verdict`:
   `pass` · `pass-with-new-work` · `fail` (needs ≥ 1 conflict finding).
5. Validate **with the inventory** so the mechanical checks run, then render:

   ```bash
   bun RUNTIME/cli.ts validate --in .architecture-map/plan-<slug>.map.json --inventory .architecture-map/inventory.json
   bun RUNTIME/cli.ts render --in .architecture-map/plan-<slug>.map.json --out .architecture-map/plan-<slug>.html --repo-root "$(pwd)" --inventory .architecture-map/inventory.json
   ```

6. Reply with: the **verdict**, the HTML path, findings (conflicts first),
   and hop titles tagged `existing` / `proposed` / `conflict`. Say the page
   filters by status and that clicking a finding jumps to its node or hop.

This command grades a plan. It does not write a replacement design.
