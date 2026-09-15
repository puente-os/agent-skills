# Troubleshoot a failed or stuck workflow

Explain the error from the evidence available to the user. Use
[errors.md](errors.md) for meaning, causes, fixes, and retry conditions.
Do not require credentials to interpret a supplied message.

## Collect the minimum evidence

Use information already supplied. Ask only for missing details that affect the diagnosis:

- Exact error message and HTTP status, if a request failed.
- Stable workflow ID (`scenario_group_id`) and saved version ID when available.
- Execution ID, if the request created an execution.
- Failed step label, error name/value, optional error message, and a short traceback excerpt when available.
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
- The execution-detail API can expose `status`, `stopped_at`, and each step's `error.name`, `error.value`, optional `error.message`, `error.traceback`, and logs.
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

For integration errors, `error.value` is the stable machine-readable code.
The optional `error.message` gives human-readable guidance. Failure notification
code still reads `value`; do not assume an alert includes `message`.

## Check a Google Sheets `invalid_range` error

Use this procedure for `IntegrationActionFailed` with `value: "invalid_range"`.
Read the [error contract](errors.md#invalid_range-google-sheets) for the exact
detection rules. The code identifies a tab/range problem, not an OAuth failure.

Use only available, authorized read-only tools for inspection. This skill does
not grant access to execution routes or undocumented spreadsheet metadata routes.
If no authorized metadata tool is available, ask the user for the exact tab titles.

1. Inspect the failed action's inputs and any supplied resolved values.
   Check the target spreadsheet and the applicable `range`, `ranges`, or `sheet_name`
   fields against [google-sheets.md](google-sheets.md) and the live action contract.
2. Compare the requested tab name with the exact titles from read-only spreadsheet metadata or user-supplied evidence.
   Do not assume that a tab is named `Sheet1`.
3. Check the cell/A1 range and the quotes around the tab name.
   Names with spaces or special characters need single quotes, for example
   `'Sales 2026'!A1:B4`. Preserve characters within the title, including apostrophes.
   Use the [Google A1 notation reference](https://developers.google.com/workspace/sheets/api/guides/concepts#cell)
   to check the syntax.
4. Correct the input only with authorization under the definition procedure in [api.md](api.md).
   Preserve the action's intended cells and other inputs.
5. Read back the saved definition to check the correction.
   Check completed steps and external writes before a separately authorized retry.
   This skill must not run or resume the workflow.

In a confirmed incident, the action requested `Sheet1`, but read-only metadata
reported a tab titled `bancos_prueba`. Google returned
`Unable to parse range: Sheet1`. This evidence identified an invalid tab/range
reference. It did not prove that the integration was unavailable.

Do not infer that every `invalid_range` means a missing tab. Do not reconnect
OAuth or retry unchanged inputs as the first fix. Keep credentials, headers,
complete provider bodies, and internal traces out of public diagnostics.

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
