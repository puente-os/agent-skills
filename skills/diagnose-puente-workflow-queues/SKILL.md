---
name: diagnose-puente-workflow-queues
description: Explain Puente workflow start limits, active capacity, queued webhooks, synchronous timeouts, and skipped cron ticks. Use when a Studio user asks why an execution is pending, how bursts are handled, whether a webhook can retry, or how to inspect queue behavior. Read execution evidence without triggering work or changing company limits.
---

# Diagnose Puente workflow queues

Explain the observed admission state before recommending a retry. This skill permits read-only diagnosis. It does not authorize workflow execution, cancellation, company policy changes, rollout changes, or Restate state edits.

## Establish the scope

Company admission applies to production webhook and cron executions that use Restate and belong to an enabled company. All its projects and workflows share the allowance. Manual runs and other engines retain their own behavior. Do not assume that every company is enabled or that a missing admission field proves a queue fault.

The baseline is **50 new starts per rolling 60 seconds** and **30 active Restate execution slots per company**. Staff can set company overrides. These are defaults, not a live reading of the caller's policy. The public Studio contract does not expose a company-limit settings endpoint. Ask staff to verify an unknown effective policy; do not infer it from one execution or change it through a database or internal command.

| Control | Baseline behavior |
|---|---|
| New starts | Bursts are allowed; starts are not spaced evenly across the minute. |
| Active slots | A durable suspension releases capacity. Resume requires capacity again. |
| Waiting capacity | At most 2,000 waiting runs per company. |
| Async webhook and cron queue lifetime | Up to 30 minutes before execution starts. |
| Sync webhook queue lifetime | Up to 10 seconds, bounded by an earlier deadline known to Puente. |
| Async execution runtime | Separate 35-minute timeout measured from actual execution start. |
| Cron overlap | Skip the new tick while the same workflow group has an unfinished scheduled run. |

A retry inside an existing workflow, a node execution, or a resume does not consume another new-start allowance. A new webhook request can create a new execution; do not assume webhook retries are deduplicated.

An unfinished run is not the same as an occupied active slot. Ordinary HTTP requests and Python `time.sleep` do not automatically become durable waits. A native slot can also cover execution setup before the first business node. Shared worker capacity and provider connection limits remain separate constraints; an allowance of 30 does not promise 30 useful nodes will run at once.

## Read execution evidence

For authenticated reads, follow the configuration, ownership, pagination, and response contract in [the workflow API reference](../manage-puente-workflows/references/api.md#execution-history). Use the consuming project's `BASE_URL` and `STUDIO_KEY`, not plugin-cache credentials. Never print the key or put it in generated frontend code.

1. Read the saved workflow and its version/group identity when needed.
2. List recent executions with `GET /workflows/{scenario_id}/executions`.
3. Read the relevant execution with `GET /workflows/executions/{execution_id}`.
4. Inspect the optional `admission` object in execution detail. Do not assume the list response contains it.

The optional admission fields are `outcome`, `queued_at`, `expires_at`, `execution_started_at`, and `reason`. Timestamps are Unix seconds. Preserve the execution ID when reporting an issue. Do not expose input payloads or provider secrets in a report.

| Admission outcome | Interpretation |
|---|---|
| `created` | Admission metadata exists; durable queue acceptance is not yet demonstrated by this field alone. |
| `queued` | Waiting to start; do not report this as a failed business node. |
| `started` | The first start was recorded. Inspect steps and the global status for progress or failure. |
| `expired` | The execution became ineligible before its first start. |
| `queue_full` | Admission was rejected because waiting capacity was full. |
| `overlap` | The new scheduled tick was skipped because a prior scheduled run is unfinished. |
| `cancelled` | Queued work was made ineligible. Read the supplied reason and context. |

Admission outcomes can appear with a global `cancelled` status. Queue rejection, queue expiry, and cron overlap are admission outcomes, not workflow execution failures. Work that never starts does not consume execution usage, generate workflow error emails, or count toward automatic failure deactivation.

For a started run, queue delay is `execution_started_at - queued_at`. For a queued run, report its age and expiry using the current time. Do not use the history row's `started_at` as proof of actual execution start. If `execution_started_at` is absent, report that absence rather than inventing a duration.

Below-limit delays can come from admission processing, dispatch, transport, or shared worker capacity. A `pending` label alone does not prove that the rate limit was reached. Report observed timing separately from an unconfirmed cause. For staff with Restate access, read [the dashboard guide](references/restate-dashboard.md).

## Explain webhook responses and retries

- **Async `202`:** durable acceptance and an execution ID, not completion. Work can remain queued. Read that execution before suggesting another request.
- **`429`:** inspect `detail.reason` and honor `Retry-After`. A full async queue and an expired sync queue wait are different reasons. Do not tell the caller that every rate-limited async request is rejected; accepted excess work waits.
- **`503`:** durable acceptance could not be confirmed. Do not claim acceptance or safe automatic retry. Check any known execution ID and the producer's deduplication contract first.
- **Sync wait:** Puente allows a short queue wait before starting. If the queued deadline wins the atomic start-versus-expiry decision, that execution cannot start later. Once started, the existing response behavior applies within the overall 300-second response budget, including queue time.
- **Caller timeout or disconnect:** an observed disconnect invalidates queued work. Puente cannot infer an undisclosed caller timeout or undo effects that already started. A missing HTTP response alone does not prove that no work ran.

Do not add automatic POST retries to a Studio app unless its business deduplication and retry policy are defined. Never run a webhook or load test merely to diagnose its queue.

## Explain cron overlap

QStash remains the schedule delivery service. Its deliveries enter the same company admission queue. One unfinished scheduled execution blocks new ticks for the logical `scenario_group_id`, including across saved workflow versions. Queued, running, and durably waiting scheduled runs all count as unfinished for this rule.

Overlap returns a successful skipped response with `reason=overlap`; it does not retry or catch up the skipped tick. Full-queue overload is retryable, and retries of the same provider delivery ID must not create duplicate work. Terminal completion, failure, cancellation, or queue expiry releases cron ownership. Do not manually replay a skipped tick as a recovery step.

## Use concrete examples

- **50 requests at once:** with an empty rolling window and enough shared capacity, up to 30 occupy active slots. The other 20 wait for capacity. This is an upper bound, not a latency guarantee.
- **The 51st start:** after 50 starts, the next new start waits until a prior start leaves the last 60 seconds, even if a slot is free.
- **A sync request behind 30 occupied slots:** it can wait up to 10 seconds. If it does not win a start before expiry, it returns `429` and cannot perform business work later.
- **A durable WhatsApp wait:** the unfinished run releases active capacity. Resume needs capacity but does not consume a new-start allowance. Only use this example if the workflow actually uses a durable wait.
- **A five-minute cron taking twelve minutes:** the ticks at minutes 5 and 10 are skipped while the minute-0 run remains unfinished. A later tick can start after it finishes.

When answering, give the effective policy if verified, the observed outcome and timestamps, and the next permitted read or user action. State uncertainty explicitly. Do not promise instant admission or attribute a delay to a Restate pricing tier without evidence.
