# Troubleshoot a failed or stuck workflow

Explain the error from the evidence available to the user. Use
[errors.md](errors.md) for meaning, causes, fixes, and retry conditions.
Do not require credentials to interpret a supplied message.

## Collect the minimum evidence

Use information already supplied. Ask only for missing details that affect the diagnosis:

- Exact error message and HTTP status, if a request failed.
- Stable workflow ID (`scenario_group_id`) and saved version ID when available.
- Execution ID, if the request created an execution.
- Failed step label, error name/value, and a short traceback excerpt when available.
- Time, time zone, and whether the trigger was manual, scheduled, or a webhook.

Do not request credentials, complete input datasets, or full logs when a short
error excerpt is enough. Remove secrets and personal data from examples.

## Determine where the failure occurred

| Stage | Evidence | Next action |
| --- | --- | --- |
| Before execution | Non-success HTTP response; no execution ID returned | Read `detail`. Do not assume that a history row or failure email exists. |
| Inside a step | Execution ID, failed status, step error | Identify the first relevant failed step and match the exact error. |
| Stuck or uncertain | Pending/running status without a final result | Collect timing and last known step. Contact Puente when progress cannot be established. |
| After an external action | Failed or interrupted response after a possible email/write | Check the destination before another run. The action may already be complete. |

An accepted request or HTTP `202` proves admission, not successful execution.
An internal retry warning does not prove final failure. A missing execution ID
in an interrupted response does not prove that the server rejected the request.

## Understand the available surfaces

- Failed API requests can expose an HTTP status and `detail`.
- The execution-detail API can expose `status`, `stopped_at`, and each step's `error.name`, `error.value`, `error.traceback`, and logs.
- The history list contains summaries. It omits dedicated step error and log fields; a summary alone may not establish the cause.
- Failure alerts can contain a message and traceback excerpt. Absence of an alert does not prove success. Provider acceptance does not prove inbox delivery.
- Internal ownership state and `launch_error_code` are not explicit fields in the execution-detail response. Do not promise access to them.

The execution-detail route currently requires a user JWT and
`resource:workflow:read`. This skill uses a Studio key for supported definition
and integration operations. A Studio key does not grant access to that route.
Do not request a user JWT or call execution routes through this skill.
Interpret details supplied by the user instead.

Do not assume the user has Datadog, production database, Resend, or Upstash
credentials. Never present an internal console operation as an available
Puente product feature. API fields do not prove how the frontend displays them.

## Explain and recover

1. Match the exact message in [errors.md](errors.md). If absent, say that the cause is not yet established; do not invent a stable error code.
2. State what the evidence confirms and what remains uncertain. Check earlier errors before treating an ownership or inactive-execution message as the cause.
3. Explain one concrete user action. Separate definition/input corrections from issues that require Puente support.
4. State whether a retry could help. Check completed steps and external actions before suggesting another run.
5. For a requested definition fix, use the existing inspect, write, and read-back procedure in [api.md](api.md). Diagnostic guidance does not authorize activation or execution.

Do not rerun, resume, trigger, or reactivate a workflow automatically. Do not
clear application locks or change stored execution state as a troubleshooting
shortcut. Keep the workflow's existing status unless the user requests a change
under the management procedure.

## Report the finding

Use a short report with:

- **Error:** Exact name or message.
- **Meaning and cause:** Confirmed facts, then any unresolved possibilities.
- **Next action:** A user correction or a request for Puente support.
- **Retry:** Conditions and possible duplicate actions.
- **Evidence:** Non-secret workflow/execution IDs, failed step, and timestamp.

When contacting Puente is necessary, prepare these details for the user.
Do not claim that a support ticket exists unless one was actually created.
