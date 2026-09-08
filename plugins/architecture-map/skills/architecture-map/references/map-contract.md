# Map contract

`runtime/schema.ts` is the source of truth; this is the same contract in
prose. `validate` enforces all of it. Fix the document, never the validator.

## Document

| Field | Type | Rule |
| --- | --- | --- |
| `schemaVersion` | `1` | required |
| `title` | string | short; what the reader is looking at |
| `intent` | string | one or two sentences on what the map answers |
| `query.mode` | `repo` · `flow` · `plan` · `pr` | required |
| `query.name` | string | the flow / feature / plan / PR name |
| `generatedAt` | ISO 8601 | when the trace was taken |
| `infra[]` | node | every compose `band: "infra"` service |
| `processes[]` | node | every compose `band: "process"` service, plus on-path CLIs/workers |
| `columns[]` | column | one per participating unit or feature |
| `hops[]` | hop | the path; `repo` → `[]`, `flow` → 1..12 |
| `grounding[]` | `{id, path}` | files that establish the surface (compose, manifests, entry points) |
| `unknown[]` | string | what you could not confirm this turn; empty array is fine |
| `verdict` | plan only | `pass` · `pass-with-new-work` · `fail` · `blocked` |
| `questions[]` | plan, pr | `{id, ask, because}`; empty unless blocked |
| `findings[]` | plan, pr, repo | `{id, severity, title, detail, nodeId?, hop?}`; severity `conflict` · `proposed` · `info` |
| `compare` | pr only | `{base, head, pr?}` git refs; required unless blocked |
| `repoStats` | repo only, optional | `{units, features, layers, files, infra, processes}` — non-negative integers the shell reads for the stats-chip row; the drafter computes it |

`repo` and `flow` maps reject `verdict`, `questions` and `compare`. `repo`
maps may carry `findings` (all `info`) and `repoStats` (populated by the
drafter). Non-repo modes reject `repoStats`.

## Node (`infra[]`, `processes[]`)

`{ id, used, label?, status? }`

- `id` is the compose service id (or a proposed id in plan mode).
- `used: false` boxes stay on the map, drawn idle. Do not drop them.
- `label` adds the specifics ("postgres (postgres:16-alpine)", "api — apps/api").
- `status` (plan only, required when `used`): `existing` · `proposed` · `conflict`.

## Column

`{ id, kind, used, label?, layers[], status?, fileCount? }`

- `id` mirrors disk: `<unit>/<feature>` or `<unit>/<dir>`.
- `kind`: `layered` (domain / application / infrastructure style) ·
  `routes` (file-based routing) · `library` (shared code) · `unknown`.
- `layers[]`: `{ id, label, used, files[], status? }`; `id` extends the
  column id; `files` ≤ 6 repo-relative paths that exist (plan `proposed`:
  paths that would exist).
- `fileCount` (optional, non-negative integer) — total non-test file
  count for this unit. The drafter populates it so the repo treemap
  can size tiles without re-walking the tree; the field is missing on
  hand-written maps and the shell falls back to a flat treemap in that
  case.

Ids are unique across infra, processes, columns and layers.

## Hop

`{ n, from, to, type, label, source, work, in?, out?, fail?, because?, not?, status?, beforeWork? }`

| Field | Rule |
| --- | --- |
| `n` | 1-based, contiguous |
| `from`, `to` | ids of nodes / columns / layers on this map |
| `type` | one of the touch types below |
| `label` | short title; the specifics live here ("POST /orders", "orders.created on RabbitMQ") |
| `source` | repo-relative file that proves this hop; must exist on disk (PR `removed`: at the base ref) |
| `work` | **required.** What this step does, in plain language a new teammate can read without opening the file. ≤ 280 chars |
| `in` | what arrives at this step, when the file says. ≤ 280 |
| `out` | what the next step receives, when the file says. ≤ 280 |
| `fail` | a failure this file names (throws, returns error, rejects). ≤ 280 |
| `because` | why this hop exists, from the file. ≤ 280 |
| `not` | why not the adjacent alternative, from the file. ≤ 280 |
| `status` | plan: `existing` · `proposed` · `conflict`; pr: `unchanged` · `added` · `removed` · `changed`; flow / repo: **absent** |
| `beforeWork` | pr `changed` only: what the step did on the base ref |

Omit a clause when the file is silent. An empty string is illegal.

### Plain language

`work`, `because`, `not`, `in`, `out`, `fail` are sentences a new teammate
understands without the code open. Function names, schema names, class
names and file names belong in `label` and `source`. "Checks the caller may
create orders in this organisation" — not "runs `assertCanCreate()` against
`OrgPolicy`".

### Touch types (closed)

`HTTP` · `gRPC` · `GraphQL` · `WebSocket` · `SSE` · `webhook` ·
`message bus` · `cron` · `workflow` · `database` · `cache` · `object store` ·
`secrets` · `authz` · `import` · `spawn` · `UNKNOWN`

Name the mechanism, never the vendor. `label` carries the vendor.

## Mode rules the validator enforces

**repo** — `hops` empty. No verdict / questions / compare.

**flow** — 1..12 hops, no `status` on hops. No verdict / questions / compare.

**plan** — `verdict` required; `questions[]` and `findings[]` required
(arrays). `blocked`: hops empty, questions non-empty. Otherwise: questions
empty; every used node and every hop has a plan status; `fail` needs ≥ 1
`conflict` finding; `pass` cannot carry `conflict` or `proposed` findings.
With `--inventory`: `existing` must exist on disk, `proposed` must not, an
`existing` hop cannot touch a `proposed` node, every `conflict` hop needs a
`conflict` finding, and labels never contain `localhost:<port>`.

**pr** — no `verdict`. `questions[]` and `findings[]` required. Blocked:
hops empty, questions non-empty. Otherwise: questions empty, `compare.base`
and `compare.head` set, every hop has a PR status, `beforeWork` present on
`changed` hops and only there.

## Caps

12 hops per map · 6 files per layer · 280 characters per clause.
Split a longer flow at a real seam (after the request returns, at a queue,
at a process boundary) and say so in `intent`.
