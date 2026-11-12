# Retry a failed workflow execution with Puente Studio

Use this procedure only for a user-requested retry of an existing failed
execution. Diagnosis, a definition fix, or a request to check eligibility does
not authorize a retry. Do not start unrelated runs or retry a set of executions
through an unattended loop.

## Configuration, authentication, and availability

Use the consuming project's configured `BASE_URL` and `STUDIO_KEY`, as described
in [api.md](api.md#configuration-and-authentication). Send
`X-API-Key: <STUDIO_KEY>` on every request, including eligibility and result
reads. Studio users use their Studio key throughout this procedure. Do not ask
for a user JWT, backend credentials, database access, or workflow-engine access.
Never print the key or put it in a URL, generated file, or report.

Both retry methods require `resource:workflow:execute` for the user associated
with the Studio key, including the eligibility GET. An active Studio key alone
is insufficient. The execution must belong to the key's company and exact
team, and its associated user must pass the team-access check. Do not supply
another company or team to bypass these checks. Execution-history access does
not prove execute permission.

Check `GET /openapi.json` at the configured API for both methods on
`/workflows/executions/{execution_id}/retry` and the request/response schemas.
Then check the execution's eligibility. OpenAPI registration alone does not
prove that retries are enabled or that the execution can be retried.

Retry is supported in all environments, including production, when the
configured API exposes this contract and retry preparation is available.
Check the deployed API and execution eligibility in the configured environment.
A hostname or this skill release does not prove deployed availability. If the
contract is absent or the API reports retry unavailable, stop and report the
limitation. Do not change `BASE_URL` or use a webhook or general run endpoint
as a fallback.

## Inspect the execution and choose a strategy

Read `GET /workflows/executions/{execution_id}` for the selected execution.
If the user supplied a workflow rather than an execution, first use
`GET /workflows/{scenario_id}/executions` to identify the failed run. Resolve
ambiguity before a POST. Read only the inputs, results, and errors needed to
explain the retry; do not copy complete payloads or logs into reports.

Call `GET /workflows/executions/{execution_id}/retry` with the execution UUID.
The response contains:

| Field | Meaning |
|---|---|
| `eligible`, `reason` | Whether retry from the failed step is allowed and why it is denied. |
| `failed_occurrence_key` | Saved failed node occurrence for partial retry, when available. |
| `restart_eligible`, `restart_reason` | Whether restart from the beginning is allowed and why it is denied. |
| `scenario_version` | Original saved workflow version, when available. |
| `retry_of_execution_id` | Parent execution when this run is itself a retry. |
| `linked_execution_id` | Existing child retry; read it instead of creating another. |
| `retry_strategy` | Strategy used to create this execution, when it is a retry. |

| Requested strategy | Required field | Steps that run |
|---|---|---|
| `from_failed_step` | `eligible: true` | Reuse the successful saved prefix; run the failed step and the remaining steps. |
| `from_start` | `restart_eligible: true` | Run the original saved definition from the beginning without reusing successful results. |

Partial retry requires a failed, terminal execution with a supported linear
graph and valid saved outcomes before and at the failure. Branches, iterators,
unsupported control nodes, missing results, and unknown external outcomes can
make it ineligible. Full restart does not require the successful prefix or a
linear graph. The backend also permits full restart of other terminal runs;
this procedure is limited to the failed execution the user selected.

Both strategies require unexpired saved inputs, a saved definition and node
catalog, and a compatible original runtime. Use the API's eligibility result
and reason; do not try to override a denial. Do not switch from partial retry
to full restart without authorization for the different scope.

Both strategies use the original saved workflow version and inputs. A new
definition version, changed node code, or corrected input does not replace
that snapshot. If the user expects a later definition fix to run, explain this
limit and stop this retry procedure.

## Authorize and submit one retry

Before sending a POST, identify the source execution, saved version, chosen
strategy, and steps that will run. Explain that emails, writes, Python code,
and other external actions can happen again. Partial retry reuses successful
saved results, but the failed action can already have had an external effect.
Full restart can repeat effects from every step. Check the destination through
available authorized reads when the failed action's effect is uncertain.

Obtain authorization for that execution, strategy, and possible duplicate
effects unless the user has already authorized them with these effects
understood. A generic request to fix or diagnose a workflow is insufficient.
Do not add another confirmation when the required authorization is already
clear. Never set the acknowledgement merely to make validation pass.

Send `POST /workflows/executions/{execution_id}/retry` once with:

```json
{
  "strategy": "from_failed_step",
  "acknowledge_duplicate_effects": true
}
```

For an authorized full restart, use `"strategy": "from_start"` with the same
acknowledgement. There are no replacement-input, team, or version fields in
this request.

The accepted response is HTTP `202` with `execution_id` for the linked child
and `retry_of_execution_id` for the source. The source keeps its original
results and failure. Requests with the same source and strategy return the
existing child; another strategy for that source returns `409`. A failed child
can be the source of a later, separately authorized retry. Do not create that
next retry automatically.

## Verify and recover an uncertain response

Read `GET /workflows/executions/{execution_id}` using the returned child ID.
Use bounded polling while it is pending or running. A transient history `404`
after acceptance is not proof that creation failed. Retry the read within the
polling bound; do not send another POST. Report the terminal result, or report
that the child is still pending/running when the polling bound ends. A `202`
response proves acceptance, not successful execution or external delivery.

If the POST times out, is interrupted, or returns an error with an uncertain
creation outcome, read the source's retry eligibility again. If
`linked_execution_id` is present, read that execution and report its state.
Do not automatically resend the POST or change strategy. If no linked child
can be established, report the uncertainty before another authorized attempt.

Report the source and child IDs, selected strategy, saved version when known,
and observed status or failure. Do not expose credentials, full inputs, or logs.

## Expected failures

| Status or result | Action |
|---|---|
| `401` | Report rejected/missing/revoked credentials or an associated user with no roles, according to `detail`. Do not fall back to a JWT. |
| `403` | Report insufficient execute permission or team access. A read-capable key may still be denied. |
| `404` | Report that retry is unavailable, the execution is missing, or it is outside the key's company/team, according to `detail`. Do not probe other teams. |
| Eligibility false | Show the selected strategy's reason. No POST; no automatic strategy fallback. |
| `409` | Report the rejection, expired/unreadable saved data, incompatible runtime, or conflicting linked strategy. Read eligibility and any existing child before further action. |
| `422` | Check the UUID, strategy, and required true acknowledgement against OpenAPI. Missing authorization cannot be repaired by setting the acknowledgement. |
