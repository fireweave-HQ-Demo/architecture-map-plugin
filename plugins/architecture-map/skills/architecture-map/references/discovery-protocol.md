# Discovery protocol

Run the inventory first. Then open files. Docs are not a source of nodes.

## Band 1 — infra

`inventory.compose[]` with `band: "infra"`: services that only pull an image
(databases, brokers, caches, proxies, operator UIs). Every one of them is on
the map — `used: true` when the path touches it, `used: false` otherwise.
Diagrams use the compose **service id**; host ports in `ports:` are for
laptops and never appear in labels.

When the repository has no compose file the inventory says so in
`findings`. Ask what the runtime dependencies are; do not invent a database.

## Band 2 — processes

`inventory.compose[]` with `band: "process"`: services built from this repo
(`build:`) or running a stock image with `working_dir` inside a code unit
(`unit` names it). Every one stays on the map. Add a process that is **not**
in compose (a CLI, a one-off worker) only when it is on the traced path, and
name the unit it runs from in `label`.

## Band 3 — architecture blocks

One column per participating code unit or feature:

| Need | Look at |
| --- | --- |
| Which units exist | `inventory.units[]` (`id`, `path`, `layout`, `dirs`) |
| Feature folders | `inventory.features[]` (`unit`, `name`, `layers`, `dirs`, `files`) |
| Entry points (HTTP) | `features[].files.routes`; otherwise the unit's route / controller directory |
| Business logic | `features[].files.handlers` (use-cases, services, commands) |
| Persistence | `features[].files.persistence` |
| Messaging | `features[].files.messaging` |
| Scheduled / long-running | `features[].files.jobs` |
| File-based routing apps | `layout: "routes"` units: `src/routes/**`, `pages/**`, `app/**` |

Column `kind` is the unit's `layout` (`layered` / `routes` / `library` /
`unknown`). Unknown layout → one column, one layer labelled by its directory;
do not fake layers.

Column ids mirror disk: `<unit>/<feature>` for a feature folder,
`<unit>/<dir>` for anything else. Layer ids extend the column id
(`api/orders/infrastructure`). `membershipOf` in `plan.ts` resolves exactly
these shapes, so a plan node that does not follow them reads as `absent`.

## Tracing a flow

1. Find the entry: route file, page/store, CLI command, consumer, cron.
2. Read the handler. Business logic is the use-case, not the route.
3. Follow ports to adapters. The **hop type** is the adapter's mechanism
   (`database`, `message bus`, `cache`, `workflow`, …), never the vendor.
   Put the vendor and the specifics in `label` ("INSERT into orders via
   Postgres", "orders.created on RabbitMQ").
4. Cross-feature calls: through the other feature's public entry
   (`index.ts`, barrel, module export). That hop is `import`.
5. If you did not open a file this turn, do not draw the hop. Write it into
   `unknown[]`.
6. Clauses come from the opened `source`: `work` (required), `in`, `out`,
   `fail`, `because`, `not`. Omit what the file does not say. ≤ 280 chars.
   Plain language — identifiers live in `label` / `source`.

## Plan mode

Inventory first. Then classify every planned id with `membershipOf`:

- `existing` and membership `absent` → illegal; either it is `proposed`, or
  the id does not match disk. Ask which.
- `proposed` and membership present → illegal; it is not new.
- An `existing` hop cannot touch a `proposed` node.
- Every `conflict` hop needs a `conflict` finding that says what it collides
  with. Read the repository's own stated rules (contributing guide,
  architecture notes, lint config) for house rules; cite the file in the
  finding's `detail`.

Missing entry actor, feature name, trigger, runtime, or new service id →
**ask and stop** (`verdict: "blocked"`).

## PR mode

1. Inventory the working tree (head).
2. Trace **after** by opening files on disk.
3. Trace **before** with `git show <base>:<path>` for every hop source you
   found — and for files the diff deletes (`git diff --name-status
   <base>...<head>`). Do not invent a path from the PR description.
4. `merge-pr` classifies. Renumber is automatic. `changed` hops get
   `beforeWork` from the base file text.
5. Missing base, head, or which flow → **ask and stop** (empty hops, no
   `verdict`).

## Do not open for boxes

Architecture docs, wikis, ADRs, generated diagrams, commit messages, PR
descriptions, and your own memory of the project. Link them after the HTML
path if they help — never as membership.
