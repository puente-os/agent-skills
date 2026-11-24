# Webhooks: sync, async, and execution deadlines

Read this reference when choosing a webhook response mode, converting an existing
workflow, or diagnosing `ExecutionDeadlineExceeded` after a webhook request.
Use the definition-management procedure in [api.md](api.md). This reference
does not authorize a webhook call, execution, retry, or activation.

## Choose the response contract

The backend derives the registration mode from the saved graph's catalog node
types. Any node whose `node_type` is `WEBHOOK_RESPONDER` selects sync mode.
A graph without a responder selects async mode. Validate node IDs through the
live integration catalog; do not infer the mode from a node's label or position.

| Saved graph | Mode | Caller receives |
| --- | --- | --- |
| Contains a `WEBHOOK_RESPONDER` | Sync | The responder's configured status, body, and content type, subject to the response deadline |
| Contains no `WEBHOOK_RESPONDER` | Async | HTTP `202` after durable acceptance, with an `execution_id`; work continues separately |

Use sync when the caller needs a value computed by the workflow and the work
fits within the response deadline. Use async when the caller needs acceptance
and the work can finish later. Async does not return a later node's business
result in the original HTTP response. Read execution history to check completion.

An early responder that returns `200` with `{"ok": true}` still selects sync.
It does not turn the remaining graph into an async workflow. A successful
response from that node does not prove that later steps succeeded.

The legacy field name `sync_webhook_id` does not select the mode. Both modes use
the same endpoint shape: `{api_origin}/workflows/webhook/{sync_webhook_id}`.
Use only the supported origins in [api.md](api.md#derive-user-facing-urls).
Do not invent an `async` flag, a separate async endpoint, or a public
registration-status route.

## Understand the separate deadlines

| Budget | Current backend default or limit |
| --- | --- |
| Synchronous webhook response | 300 seconds (5 minutes) |
| Restate workflow run | 3,900 seconds (65 minutes), configurable by environment |
| Python code execution | Up to 3,300 seconds (55 minutes) per node |
| Browser code execution | Up to 55 minutes, shortened by the remaining run budget |

For a sync Restate webhook, the backend bounds the run deadline by the webhook
response deadline. This shorter deadline remains attached to the admitted run
even after an early responder sends its response. Raising the workflow or Python
limit does not remove the 5-minute sync bound.

For async acceptance, the backend does not attach the sync response deadline.
The workflow and node limits still apply. A 65-minute run budget does not give
each node 65 minutes, and async is not an unlimited execution mode.

These values describe the current backend defaults, not every engine or deployed
environment. Check the execution's engine, original version, elapsed time, and
available deployment evidence before identifying which budget expired. Legacy
and interactive **Ejecutar** paths have separate budgets. See
[headless-browser.md](headless-browser.md#limits) and the error catalog's
[`ExecutionDeadlineExceeded`](errors.md#executiondeadlineexceeded) entry.

Maintained backend sources:

- [Registration mode selection](https://github.com/puente-os/puente-backend/blob/main/app/domains/workflows/restate/webhook_registry.py)
- [Async deadline handling](https://github.com/puente-os/puente-backend/blob/main/app/domains/workflows/restate/webhook_receipt.py)
- [Sync run deadline bound](https://github.com/puente-os/puente-backend/blob/main/app/domains/workflows/restate/webhook_processor.py)
- [Webhook timeout](https://github.com/puente-os/puente-backend/blob/main/app/domains/workflows/webhook_http.py), [Restate defaults](https://github.com/puente-os/puente-backend/blob/main/app/domains/workflows/restate/settings.py), and [Python limits](https://github.com/puente-os/puente-backend/blob/main/app/domains/workflows/e2b/executor.py)

## Convert an existing sync webhook to async

1. Read the latest complete definition and identify every responder through the
   live catalog. Check whether the caller depends on its custom response.
2. Show the intended graph change. Remove the responders and reconnect their
   incoming and outgoing edges as required by the graph. Check references to
   removed outputs. Preserve unrelated inputs, scripts, labels, node indices,
   and edges. A typical change is
   `Trigger -> Respond -> Process` to `Trigger -> Process`.
3. Explain that future calls will receive acceptance instead of the custom
   response. Reuse sufficient existing authorization; obtain missing
   confirmation under the skill's definition and activation rules.
4. Save one complete new version with the same `scenario_group_id`. Do not
   modify an old version or send a partial graph. The webhook ID and endpoint
   are inherited. The backend publishes the updated registration and clears
   cached registration metadata as part of its lifecycle process.
5. Read the saved version back. Verify its version, team, status, webhook ID,
   complete graph, and absence of responders. If authorized internal read-only
   tools expose the runtime registration, also verify that its mode is `async`
   and publication is complete. A graph read alone does not prove that runtime
   publication has finished; report that verification limit when applicable.
6. Report the new response contract and verification result. Do not send a test
   webhook or retry the failed execution as part of the definition change.

The change applies to future requests. It does not extend an existing run's
deadline. An ordinary retry preserves the failed execution's original version;
it does not use the new async definition. For a separately authorized operation
on a newer version, follow [continuation.md](continuation.md). Check completed
external actions before any retry or continuation.
