---
name: arch-flow
description: Trace one feature or flow through the code — entry to infra, at most 12 hops, every hop backed by a file you opened — and render it as an interactive HTML map.
argument-hint: "<flow or feature name>"
---

# arch-flow — how does this path run today?

Read and follow `skills/architecture-map/SKILL.md` in this plugin (mode `flow`).
`RUNTIME` below is that skill's `runtime/` directory
(`${CLAUDE_PLUGIN_ROOT}/skills/architecture-map/runtime` on Claude Code).

Argument: `$ARGUMENTS` — the flow or feature to trace ("create order",
"login", "nightly billing"). Missing → run the ask protocol for
`feature-name`, `entry-actor` and `trigger`, and stop.

## Steps

1. Inventory (reuse `.architecture-map/inventory.json` if it is from this
   session; otherwise `bun RUNTIME/cli.ts inventory --root . --out .architecture-map/inventory.json`).
2. Find the entry point (route, page/store, CLI command, consumer, cron) and
   open it. Follow the code: handler → use-case → adapters → infra. Open
   every file you will cite. Docs are not sources.
3. Write `.architecture-map/flow-<slug>.map.json` per
   `references/map-contract.md`: all inventory infra and processes (idle ones
   `used: false`), the columns on the path, hops 1..n (≤ 12), `grounding`,
   `unknown`. `work` in plain language; `in` / `out` / `fail` / `because` /
   `not` only when the file says so. No `status` on flow hops.
4. Validate, then render:

   ```bash
   bun RUNTIME/cli.ts validate --in .architecture-map/flow-<slug>.map.json --inventory .architecture-map/inventory.json
   bun RUNTIME/cli.ts render --in .architecture-map/flow-<slug>.map.json --out .architecture-map/flow-<slug>.html --repo-root "$(pwd)"
   ```

5. Reply with: one-sentence intent, the HTML path, and the numbered hop
   titles. Nothing else — the inspector on the page carries each step's brief.

If the path is longer than 12 hops, split at a real seam (after the request
returns, at a queue, at a process boundary) and render two maps.
