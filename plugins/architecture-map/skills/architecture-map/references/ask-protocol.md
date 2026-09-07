# Ask protocol

If any row below is unknown for the chosen mode, output a numbered question
list and **end the turn**. Do not run `render`. Do not fill "probably".

Ask **only** the unresolved rows. One question per row, in the user's words.

| id | Must know | Modes | Ask when |
| --- | --- | --- | --- |
| `mode` | repo / flow / plan / pr | all | "architecture" or "map" with no path, no plan, no PR |
| `stack` | Which compose stack when several exist and the question is about one | repo, flow, plan | inventory `findings` lists other stacks and the user named an environment |
| `entry-actor` | Who starts the path: browser UI, CLI, another service, a scheduler, a webhook sender | flow, plan, pr | unstated |
| `feature-name` | Existing feature folder / unit, or the **new** name | flow, plan, pr | unstated or ambiguous ("the API"); PR touching many features |
| `trigger` | HTTP method + path, topic/queue name, cron, CLI command, webhook event | flow, plan | flow or plan with no trigger |
| `durable` | What happens after the request returns: job / workflow / queue / nothing — and which runtime the repo already uses | plan | plan says "async", "job", "workflow" without naming the mechanism |
| `new-infra` | Exact compose service ids to add, or "none" | plan | plan says cache / queue / search / bus without a service id |
| `target-unit` | Which app / package / service tree receives the change | plan | unclear which unit |
| `plan-artifact` | The plan itself (pasted text or a repo path) | plan | "review the plan" with no body and no file |
| `pr-head` | Head ref: PR number, branch, or `HEAD` | pr | unstated |
| `pr-base` | Base ref: `origin/main`, `main`, or a SHA | pr | unstated |
| `pr-flow` | Which path to overlay when the diff spans several | pr | diff touches more than one feature |

Defaults you may take **without asking**, and must state in chat:

- "this PR" with an unambiguous git remote → base `origin/main` (or `main`),
  head = working tree.
- Compose stack when only one exists.
- Output directory `.architecture-map/` under the repo root.

After the user answers, continue. If they say "assume X", record X in
`unknown[]` (or a finding's `detail`) and proceed — that is a stated
assumption, not a guess.

## Blocked shapes

- `plan`: `verdict: "blocked"`, `hops: []`, `questions[]` filled,
  `findings: []`, inventory infra/processes present with `used: false`.
- `pr`: `hops: []`, `questions[]` filled, `findings: []`, **no** `verdict`,
  `compare` optional.

Prefer chat-only questions. Render the blocked shape only when the user
asked for HTML in the same request.
