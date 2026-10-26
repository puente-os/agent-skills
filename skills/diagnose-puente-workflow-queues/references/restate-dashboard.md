# Read queue behavior in Restate

This guide is for staff who already have access to the correct Restate environment. A Studio credential does not grant Restate dashboard access. Use read-only views; do not edit state, rules, or invoke handlers to inspect a queue.

## Native concurrency

Open **Flow control → Rules** and find `company-<empresa_id>`. Check the enabled concurrency value rather than assuming the baseline of 30.

Open **Flow control → Limit counters** and locate that company scope. Inspect `usage`, `concurrency_limit`, `available`, and `num_waiters`. `num_waiters` counts waiting virtual queues, not Puente workflow requests. An idle counter can be absent; use Rules to confirm configuration.

Open **Flow control → VQueues** for the same scope to inspect scheduler stages and blocked work. Native queue stages are not the same as Puente's admission outcome. A native invocation can run setup while its Puente execution has not recorded a business start.

In **Introspection**, this read-only query shows one company's native counters. Replace the scope literal with the verified company scope:

```sql
SELECT scope, usage, concurrency_limit, available, num_waiters
FROM sys_user_limits
WHERE scope = 'company-<empresa_id>'
```

If using a CLI instead of the dashboard, use the installed Restate CLI, select the requested environment explicitly, and verify its identity before each instance operation. Do not replace it with custom HTTP requests.

## Puente rolling-window admission

The 50-start baseline is enforced by Puente's admission Virtual Object, not a native Restate rate-limit rule. It will not appear as a 50/minute setting in Rules or Limit counters.

In **Virtual Objects** or **State**, locate service `PuenteCompanyAdmission`, object key equal to the decimal company ID (for example, `11`), and state key `queue`. The admission object is unscoped; do not look for it under `company-11`. The workflow invocations use the `company-11` scope.

| Stored field | Meaning |
|---|---|
| `entries` | Waiting execution IDs and their queue/expiry timestamps. |
| `starts` | Execution IDs and first-start timestamps retained for rolling-window decisions. |
| `cron_owners` | Workflow group IDs mapped to unfinished scheduled execution IDs. |
| `cron_deadlines` | Deadlines used by cron ownership cleanup. |
| `timer_at` | Scheduled admission wake-up timestamp, when present. |

These fields are snapshots. Cleanup and timestamp trimming occur during admission processing; do not treat `len(starts)` as an always-current last-minute count. Count timestamps newer than the current time minus 60 seconds. Compare expired entries with execution detail before drawing conclusions about live queue depth. Inspect state without changing it.

## Find a delayed execution

In **Invocations**, locate the execution ID in the workflow key for `PuenteWorkflow_<build>/run`. Compare invocation creation, first attempt, journal timings, and current status. Then inspect related `PuenteCompanyAdmission` handlers such as `enqueue` and `claim` for that company. Correlate execution IDs where available; matching company and time alone does not prove a link.

Keep three intervals separate: API acceptance, Puente queue-to-start, and business-node runtime. An 80-second delay before an admission handler's first attempt with a subsecond handler duration is evidence of waiting before the handler, not an 80-second business operation. The dashboard alone does not establish whether the cause is plan throttling, worker transport, object serialization, or another capacity constraint.

For Puente's actual start/expiry outcome, use the optional `admission` fields in execution detail. For the editable effective starts/minute policy, ask staff to verify PostgreSQL configuration; Restate's native rule shows concurrency only.

Sources: [Restate flow control](https://docs.restate.dev/services/flow-control#observing-flow-control) and [SQL introspection](https://docs.restate.dev/references/sql-introspection#table-sys_user_limits). These system tables require a compatible Restate version; do not assume that older environments expose every view.
