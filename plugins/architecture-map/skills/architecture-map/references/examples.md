# Examples

Golden maps under `runtime/fixtures/` were traced by hand from
`tests/fixtures/sample-repo` (a small shop: a `web` app, an `api` with `orders` and
`billing` features, a `shared` package, and a compose stack with Postgres,
RabbitMQ, Redis and Adminer). They are the bar for every mode. Open them
before your first map in a new repository; render them with
`bun runtime/cli.ts fixtures` to see the shell.

| Prompt | Mode | Fixture | What to notice |
| --- | --- | --- | --- |
| `/arch-init` | repo | `repo-sample.map.json` | The draft `init` writes, plus two findings an agent added after opening the files they name. No hops. Redis is on the map and flagged as unreferenced, not dropped. `repoStats` and per-column `fileCount` feed the stats chip row and the treemap tiles. |
| `/arch-init` on a monorepo | repo | `tests/fixtures/repo-large.map.json` (test-only) | 22 units, 44 columns, 135 files, 14 processes. Renders as collapsed unit cards behind a search input and a **List ↔ Map** toggle — the same shell that draws the 5-unit sample scales to a hundred without becoming a wall. |
| `/arch-flow create order` | flow | `flow-create-order.map.json` | Ten hops from the browser form to the invoice row. Types are mechanisms (`HTTP`, `authz`, `database`, `message bus`); vendors live in labels. `work` is plain language; `fail` only where the file names one. |
| `/arch-plan` with no plan body | plan | `plan-blocked-missing-entry.map.json` | `verdict: blocked`, empty hops, three questions. Infra present and idle. |
| `/arch-plan` + "cache orders in Redis and add a nightly reports process" | plan | `plan-fail-orders-cache-cron.map.json` | `reports` is `proposed`, `api/orders/cache` is a proposed layer, one `conflict` hop with a `conflict` finding (double-billing), `verdict: fail`. |
| `/arch-pr` with no flow named | pr | `pr-blocked-missing-flow.map.json` | Empty hops, questions, **no** verdict, `compare` absent. |
| `/arch-pr 42 create order` | pr | `pr-create-order-outbox.map.json` | Eleven hops: one `changed` (with `beforeWork`), one `added` (outbox relay), one `removed` (direct publisher). `compare.base` / `compare.head` set. |

## Scoring yourself

A map fails when any of these is true:

- A node that is not in the inventory and not a file you opened.
- A hop whose `source` you did not open this turn.
- Vendor names as `type`; identifiers in `work`.
- A plan that guesses instead of asking (`hops` non-empty while facts were missing).
- A PR whose hops came from the PR description rather than `git show`.
- Plan statuses on PR hops, or PR statuses on plan hops.
- A flow chat longer than intent + HTML path + hop titles.
- Free-authored HTML (the shell fingerprint is missing).
- `validate` reports issues and you shipped anyway.
