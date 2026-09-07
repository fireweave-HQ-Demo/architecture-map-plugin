# Visual grammar

The HTML shell owns colour, type, layout and interaction. This file owns
**what goes in which band** and what the reader will see, so the JSON you
write lands where you expect.

## Bands (top → bottom, always)

**Infra.** Every compose service the inventory marked `band: "infra"`. Idle =
ash, still present. Nothing is omitted to make a flow look tidy.

**Processes.** Every compose `band: "process"` service, so the platform shape
is stable from map to map. CLIs and workers appear only when on the traced
path.

**Architecture blocks.** One column per participating unit or feature:

| `kind` | When | Layers |
| --- | --- | --- |
| `layered` | directory has domain / application / infrastructure (any two) | those directories |
| `routes` | file-based routing (`src/routes`, `pages`, `app`) | route + client/store directories on the path |
| `library` | shared code with no runtime entry | its top-level directories, or `files` |
| `unknown` | none of the above | one layer per directory; never fake a triangle |

A new app tomorrow is classified by its folders, never by its name.

## Status (plan mode)

| `status` | Drawing | Meaning |
| --- | --- | --- |
| `existing` | solid indigo | on disk; the plan reuses it |
| `proposed` | dashed blue | not on disk; the plan would add it |
| `conflict` | red | contradicts disk or the repository's own rules |

Idle inventory infra stays ash. Proposed services may be appended to the
infra band. Never mark an inventory id `proposed`.

## Status (PR mode)

One HTML. Two views: **On this PR** (default) and **Before this PR**.

| `status` | Drawing | Meaning |
| --- | --- | --- |
| `unchanged` | solid indigo | same seam and same clauses on both refs |
| `added` | dashed blue | only on the head |
| `removed` | red, struck through | only on the base |
| `changed` | violet | same `from → to`; type, source, `work` or `label` differ. `work` is head, `beforeWork` is base |

The hop list is the path for the current view; the other side sits in its
own labelled section ("Removed by this PR — these steps no longer run" /
"Not on the old path — this PR adds them"). A summary bar counts added,
removed and changed steps. Filter chips focus one status.

## Colour (locked shell)

Neutral product UI. Live path is indigo; status uses ordinary semantic
colours; hop **type** is text, never colour-coded.

| Token | Hex | Role |
| --- | --- | --- |
| `--accent` | `#4F46E5` | live path, used boxes, Play path, overlay |
| `--card` | `#FFFFFF` | cards |
| `--page` | `#F4F6FB` | canvas |
| `--ink` | `#0F172A` | titles, body, `UNKNOWN` hops |
| `--smoke` | `#64748B` | helper text |
| `--line` | `#E2E8F0` | borders |
| `--ok` | `#059669` | pass / existing chips |
| `--info` | `#2563EB` | proposed / added |
| `--changed` | `#7C3AED` | PR changed |
| `--conflict` | `#DC2626` | conflict / fail / removed |
| `--ash` | `#94A3B8` | idle |

## What the reader can do

- Click a hop, a box, a layer or a finding. The path strip and **Play path**
  step through hops (numbered midpoints on the overlay).
- Arrow keys move between hops (skipping hops hidden by view or filter).
  Esc clears. `#hop=N` and `#node=<id>` deep-link.
- **Inspector** (right of the hop list, sticky) is the step brief: `work` in
  large type — or, for a `changed` PR hop, `before` then `on this PR` — then
  `arrives with` (`in`), `then` (`out`), `if this fails` (`fail`), `why`
  (`because`), `not this` (`not`), and a quiet file link (`source`; opens in
  the editor when the map was rendered with `--repo-root`). A clause the
  file did not support is simply absent. Empty state: "Select a step."
- Node inspector: node id, state, files, hops in / out.
- Legend lists only the touch types present on this map.
- Plan HTML: verdict banner and findings above the bands; status filter
  chips (`all` · `existing` · `proposed` · `conflict`).
- Blocked plan / PR: questions dominate; the platform section is collapsed;
  idle infra stays in the document.
- `repo` HTML: no path; the surface heading says so and the inspector asks
  you to click a box.
- `prefers-reduced-motion` disables Play auto-advance and the overlay dash.

## Density

- ≤ 12 hops. Split; do not truncate.
- Layer `files` ≤ 6, the ones on this path (repo mode: representative).
- The hop row shows a three-line `work` clamp and a two-line `because`
  preview; the inspector carries the rest. Do not stuff essays into `label`.
- Chat stays short; the HTML is the deliverable.
