# Workflow error catalog

Use this reference to explain a reported error. It is not an exhaustive list of
Python or provider errors. An error defined in code does not prove a current
incident. Do not claim a message appeared in production without evidence for
the user's run.

## Find an error

| Category | Names or messages |
| --- | --- |
| Data limits | `payload_limit_exceeded`, `IteratorContextTooLarge` |
| Execution time | `ExecutionTimeout`, `PythonExecutionTimeout` |
| Workflow code | Custom Python exceptions, including `RuntimeError` |
| Configuration | `NodeNotFound`, `NoCodeAvailable` |
| Integrations | `IntegrationRuntimeUnavailable`, `IntegrationActionFailed` |
| Infrastructure | E2B health check warnings, `E2B_InfrastructureError`, `E2B_SDKError` |
| Internal coordination | `step_has_active_owner`, `step_ownership_lost`, `execution_not_active` |

For evidence collection and access limits, read [troubleshooting.md](troubleshooting.md).

## Data limits

### `payload_limit_exceeded`

- **Meaning:** A serialized value exceeds a limit enforced by Puente.
- **Where it appears:** An API error `detail` before execution starts, or an internal exception during execution. Do not assume it becomes a saved step error.
- **Causes:** A large workflow definition, initial variables, Python result, or saved step result. One message covers several checks.
- **Fix:** Identify the stage first. For inputs and outputs, return fewer rows and fields or store large content separately and pass a reference. For definitions, remove unused nodes or large embedded content. Ask Puente to identify the failing check when the response gives no size or stage.
- **Retry:** Do not retry the same data unchanged. Check completed actions before another run after a runtime failure.
- **Contact Puente:** The message does not identify the rejected value, or the workflow fails after its data is reduced. Include the HTTP response and execution ID when available.

There is no single payload limit. Definition, input, result, and iterator
limits are separate. Do not promise that a definition-limit increase also
increases result limits. Use the target environment's current contract or an
explicit error message for a numeric limit; a merged change may not be deployed.

### `IteratorContextTooLarge`

- **Meaning:** The context passed into an iterator is too large.
- **Where it appears:** A saved step error; failure alerts can include its message.
- **Cause:** Earlier steps return more data than the iterator body can receive. The message includes the measured size and limit.
- **Fix:** Reduce query results and remove unused fields before the iterator. Keep large documents outside its context and pass references where supported.
- **Retry:** After reducing the context. Reducing the item count alone may not help if the shared context stays large.
- **Contact Puente:** The error persists with a small context. Supply the size and limit from the message.

## Execution time

### `ExecutionTimeout` / `PythonExecutionTimeout`

- **Meaning:** Code did not finish within its execution time limit.
- **Where it appears:** A saved step error. `ExecutionTimeout` is used by the legacy executor; the new graph executor uses `PythonExecutionTimeout`.
- **Causes:** Large batches, unbounded loops, slow external calls, or a platform execution limit.
- **Fix:** Use smaller batches, bounded loops, and timeouts for external requests. Use the limit reported for that execution; do not apply a legacy timeout to every engine.
- **Retry:** After checking what the timed-out code already changed. A timeout does not prove that external writes failed.
- **Contact Puente:** A small, bounded operation repeatedly times out, or the message lacks enough detail to identify the limit.

## Workflow code

### Custom Python exceptions, including `RuntimeError`

- **Meaning:** The code in a workflow step raised an exception. The name alone does not explain the cause.
- **Where it appears:** Step error name, message, and optional traceback; alerts can include an excerpt.
- **Causes:** Invalid input, a code defect, or an intentional business rule. For example, a synchronization script can reject a new run while an earlier synchronization is active.
- **Fix:** Inspect the exact message and failing line. Correct the input or code. For an active-run guard, check the earlier run before changing its stored status.
- **Retry:** Follow the condition in the message. Do not clear a lock or repeat external writes automatically.
- **Contact Puente:** The error involves a managed node or the user cannot inspect the failing operation. Remove secrets from traceback excerpts.

## Configuration

### `NodeNotFound`

- **Meaning:** A saved node ID is absent from the node catalog.
- **Where it appears:** A step error.
- **Fix:** Check the live integration catalog and select a supported node. Save a complete corrected workflow version through the existing definition procedure.
- **Retry:** After correcting the definition.
- **Contact Puente:** The live catalog lists the same node ID, but execution still rejects it.

### `NoCodeAvailable`

- **Meaning:** A code node has no executable script.
- **Where it appears:** A step error.
- **Fix:** For a Python code node, inspect the saved top-level `script_code` field. Follow [nodes.md](nodes.md) and the public contract before changing the definition. An empty catalog input schema does not mean Python scripts are unsupported.
- **Retry:** After saving and reading back the corrected version.
- **Contact Puente:** A managed node or a saved nonempty script still produces this error.

## Integrations

### `IntegrationRuntimeUnavailable`

- **Meaning:** Puente cannot provide the runtime or identity context for an integration action.
- **Where it appears:** A step error with value `integration_runtime_unavailable`.
- **Fix:** Contact Puente with the execution ID and failed step. This message does not establish that the user's connection expired.
- **Retry:** Do not repeatedly retry or reconnect the account based only on this message.

### `IntegrationActionFailed`

- **Meaning:** An integration action failed unexpectedly at the runtime boundary.
- **Where it appears:** A step error with value `integration_unavailable`. Internal provider details are intentionally hidden on this path.
- **Fix:** Contact Puente with the execution ID, node, and time. Use a specific provider error instead when one is available.
- **Retry:** Check whether the provider already completed the action. Do not assume that a failed response means an email or write did not occur.

## Infrastructure

### E2B health check warning

- **Meaning:** A sandbox health check did not respond in time.
- **Where it appears:** Backend retry logs. It is not proof of a terminal workflow failure.
- **Fix:** Inspect the final execution status. The existing executor can retry this condition automatically.
- **Retry:** Do not start another workflow merely because a retry warning exists.
- **Contact Puente:** The execution remains stuck or ends in failure after repeated infrastructure warnings.

### `E2B_InfrastructureError` / `E2B_SDKError`

- **Meaning:** The legacy executor could not complete a sandbox operation or communicate with its SDK.
- **Where it appears:** Error responses from the legacy executor. Do not label every new-engine sandbox exception with these names.
- **Fix:** Contact Puente if the failure persists. Include the exact message, execution ID, and time.
- **Retry:** First inspect completed steps and external actions. Infrastructure failure does not prove that no work occurred.

## Internal coordination

These messages were found in backend logs. Do not promise they appear in the
user interface or execution-detail response. They can be secondary errors.

### `step_has_active_owner`

- **Meaning:** A request tried to claim a step that another worker still owns.
- **Fix:** Check whether the execution is still progressing. Contact Puente if it remains stuck.
- **Retry:** Do not start a second run while the original remains active. Search for an earlier failure before treating this as the root cause.

### `step_ownership_lost`

- **Meaning:** A worker's step ownership expired or changed before an update.
- **Fix:** Contact Puente with the execution ID and time. Users cannot repair worker ownership through definition edits.
- **Retry:** Check the final status and completed actions first.

### `execution_not_active`

- **Meaning:** A request tried to continue a terminal, cancelled, or expired execution.
- **Fix:** Inspect the original failure and final status. This message alone does not identify why the execution stopped.
- **Retry:** Do not resume it through internal endpoints. Review completed actions before a separate, explicitly requested run outside this skill.
