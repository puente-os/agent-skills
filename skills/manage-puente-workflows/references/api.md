# Puente Studio workflow-definition contract

## Contents

- Scope
- Configuration and authentication
- Available actions
- Payloads
- Node definitions
- Agents and workflows
- Definition-management flows
- Execution history
- Execution retry
- Errors and safety

## Scope

Manage saved workflow definitions, read their execution history, and retry an existing failed execution through the dedicated retry routes when available. Do not call general execution-start, trigger, webhook, cron, schedule, or deletion endpoints. Definition writes have automatic backend lifecycle side effects documented below, including schedule management, so no separate cron call is needed.

## Configuration and authentication

Use already-exported values or read the current project's ignored `.env`:

```env
BASE_URL=<base_url>
STUDIO_KEY=<puente_studio_placeholder>
```

Send `X-API-Key: <STUDIO_KEY>` on every request. The credential supplies the company, team, and user identity. Omit `equipo_id` normally; never request, infer, or supply another team's ID.

## Available actions

| Action | Method and path | Notes |
|---|---|---|
| Integration catalog | `GET /workflows/integrations` | Use to discover valid `node_id` values and their public input schemas. |
| Function catalog | `GET /workflows/functions` | Read-only list of field functions; see [expressions.md](expressions.md). |
| Preview a field value | `POST /workflows/expressions/evaluate` | Read-only formula preview with sample `variables`; it never runs or saves a workflow. |
| List definitions | `GET /workflows/` | Latest version per group by default. Includes agents; read `kind`. |
| List version history | `GET /workflows/?all_versions=true` | Used to inspect a version or group locally. |
| Create definition | `POST /workflows/` | Omit `scenario_group_id`; acknowledge automatic service effects. |
| Create updated version | `POST /workflows/` | Include `scenario_group_id`, the complete definition, and acknowledged side effects. |
| Change saved status | `PUT /workflows/{scenario_id}/status` | Use the latest version ID; activation requires explicit confirmation. |
| Change agent or workflow kind | `PUT /workflows/groups/{scenario_group_id}/kind` | Updates every version of the group; see Agents and workflows. |
| List executions | `GET /workflows/{scenario_id}/executions` | Read-only; see Execution history. |
| Read an execution | `GET /workflows/executions/{execution_id}` | Read-only; see Execution history. |
| Check retry eligibility | `GET /workflows/executions/{execution_id}/retry` | Requires execute permission; see [retry.md](retry.md). |
| Retry a failed execution | `POST /workflows/executions/{execution_id}/retry` | Authorized strategy and duplicate-effect acknowledgement required; see [retry.md](retry.md). |

No other workflow-definition action is part of this skill. Connection management is documented separately in [integrations.md](integrations.md); provider action contracts remain in [gmail.md](gmail.md) and [google-sheets.md](google-sheets.md).

## Node definitions

Read [nodes.md](nodes.md) for the external node contract, public catalog fields, dynamic node-type discovery, inputs, references, and edges. Always use the live integrations response as the source of truth for available `node_id` values and their `input_schema`.

## Payloads

### Create or version

```json
{
  "nombre": "Example workflow",
  "descripcion": "Optional description",
  "nodes": [
    {
      "label": "selected_action",
      "node_id": "<node-id-from-integrations>",
      "inputs": {},
      "on_error": "stop",
      "position": {"x": 200, "y": 0},
      "index_position": 1
    }
  ],
  "equipo_id": null,
  "status": "draft",
  "scenario_group_id": null,
  "edges": [],
  "current_scenario_id": null,
  "kind": "workflow"
}
```

Required fields are `nombre` and `nodes`. Saved statuses are `draft`, `active`, and `inactive`.

`ScenarioCreate` fields mean:

- `nombre` (required): human-readable workflow name.
- `nodes` (required): complete ordered array of `WorkflowNode` objects.
- `descripcion` (optional): human-readable description.
- `equipo_id` (optional): owning team. Omit it so the Studio key's team is used; never target another team.
- `status` (optional, default `draft`): saved lifecycle state: `draft`, `active`, or `inactive`.
- `scenario_group_id` (optional): stable group ID whose next version is being created. Omit it for a new workflow.
- `edges` (optional): complete visual/execution connections between node context keys.
- `current_scenario_id` (optional): current version identifier when supplied by the caller's versioning flow; preserve it from an existing complete payload rather than inventing it.
- `kind` (optional): `"workflow"` or `"agent"`. Read only when `scenario_group_id` is absent: a new group takes the sent value, or `"workflow"` when it is omitted. The shape of the graph never decides it. On a new version of an existing group the payload value is ignored and the group's `kind` is inherited. To create an agent, send `"kind": "agent"` and include an `AGENT` or `AGENT_ADVANCED` node as its agent step; creation does not check for that node, but changing a kind to `agent` later does.

Each `WorkflowNode` accepts:

- `label` (required): base label used to form the saved node's context key.
- `node_id` (required): exact value discovered through integrations and cross-checked in OpenAPI action metadata when available.
- `inputs` (optional, default `{}`): exact action-specific input object. Additional fields can be rejected.
- `script_code` (optional): top-level Python source for a supported code node; it is not an integration input.
- `on_error` (optional, default `stop`): `stop` ends the workflow on node failure; use `continue` only when requested.
- `position` (optional): visual-editor coordinates or metadata.
- `index_position` (optional): canvas index used to construct references and edge endpoints.

The compatible context-key convention from the supplied guide is `label_index_position` when an index exists, otherwise `label`. Edges connect those context keys. Validate node IDs against the integrations response.

### Saved status

```json
{"status": "active"}
```

### Response identity

Important fields:

```text
id, scenario_group_id, version, is_latest, kind, nombre, descripcion,
nodes, edges, status, equipo_id, webhook_url, sync_webhook_id,
created_by_user_id, created_at, updated_at, validation_warnings
```

`kind` is `"workflow"` or `"agent"` in every scenario response, including `GET /workflows/` and `POST /workflows/`.

`POST /workflows/` and `PUT /workflows/{scenario_id}/status` also return `schedule`:

```json
{
  "state": "scheduled",
  "reason": null,
  "error_code": null,
  "schedule_id": "<schedule-id>",
  "cron": "0 9 * * 1-5",
  "timezone": "America/Santiago"
}
```

- `scheduled`: the schedule exists and runs `cron` in `timezone`. If `error_code` is `cron_invalid`, `cron_too_frequent`, or `timezone_invalid`, the existing schedule keeps its previous cron until the saved one is corrected.
- `not_scheduled`: the workflow does not run on a schedule. `reason` is `inactive`, `not_schedule_trigger`, `missing_cron`, or `legacy_unscheduled` (an older active workflow that is scheduled on its next save or activation). Report it as information, not as an error.
- `sync_failed`: the definition was saved and remains active, but the schedule could not be synchronized; `error_code` explains why. A changed cron keeps the previous schedule until synchronization succeeds. Report it; the next save or the backend's periodic repair retries it. Do not retry automatically.
- `not_configured`: scheduling is disabled in this environment.

## Agents and workflows

An agent is a workflow with `kind: "agent"`. It uses the same versions, execution, webhooks, schedules, permissions, and endpoints as any workflow. `kind` only decides how the product presents and manages it: agents appear in the **Agents** section and workflows in **Workflows**.

Choose the kind from what the user wants to build:

- `agent`: it converses with customers or the team and answers with AI around an agent step, a catalog node whose `node_type` is `AGENT` (simple agent) or `AGENT_ADVANCED` (advanced agent). Any trigger works, and extra steps do not stop it from being an agent.
- `workflow`: it follows fixed steps that connect tables and integrations, even when one of those steps uses AI.

When the request is ambiguous, ask which one the user means instead of guessing. An agent-shaped graph saved without `kind` is still a workflow.

`GET /workflows/` keeps listing agents together with workflows. Filter by `kind` when the user asks only for one of them. In project responses, agents appear in their own `agents` group but are still assigned with `tipo: "workflow"`; see the `manage-puente-projects` skill.

### Change the kind

```http
PUT /workflows/groups/{scenario_group_id}/kind
X-API-Key: ...
Content-Type: application/json

{"kind": "agent"}
```

The path takes the stable `scenario_group_id`, not a version `id`. The body accepts `"agent"` or `"workflow"`. The call accepts the Studio credential, as the status change does; it requires the `resource:workflow:update` permission for a user token, and the workflow must belong to the credential's team.

- `200`: `{"scenario_group_id": "<uuid>", "kind": "agent"}`. Every version of the group now has that `kind`.
- `422` with `{"detail": "Necesita un paso de agente"}`: changing to `agent` requires the latest version to contain at least one node whose `node_type` is `AGENT` or `AGENT_ADVANCED`. Add that step with a new version first, or keep the workflow kind.
- `404`: the group does not exist or belongs to another team.

Changing the kind does not alter the graph, the status, the version, the schedule, or the webhook. It creates no new version and needs no side-effect confirmation, but confirm the target kind with the user before sending it, because it moves the component between the Agents and Workflows sections. Read the group back and verify `kind`.

## Definition-management flows

### List

```http
GET /workflows/?all_versions=false
X-API-Key: ...
```

Use `all_versions=true` only when version history or local item filtering is needed.

### Inspect a saved version or group

Request all versions, then:

1. Match `id` for a specific saved version.
2. Otherwise match `scenario_group_id`.
3. For a group match, choose `is_latest=true` unless all versions were requested.

### Create

Send the complete definition with `scenario_group_id` absent or `null`. Send `"kind": "agent"` to create an agent; omit it or send `"workflow"` for a workflow. Record the returned `id`, generated `scenario_group_id`, and `kind`.

The Puente service also:

- generates a `sync_webhook_id` for a new workflow;
- may persist a legacy `webhook_url` response field;
- exposes its fixed synchronous webhook endpoint from the configured Puente API
  origin even though this skill calls only the definition endpoint.

Explain these effects and obtain explicit user confirmation before sending the request.

### Update by versioning

There is no partial definition update.

1. Inspect the latest complete saved definition.
2. Copy `nombre`, `descripcion`, `nodes`, `edges`, and `status` into a new payload.
3. Set `scenario_group_id` to the existing stable group ID.
4. Apply the requested edits.
5. Explain that the new version inherits `kind` and `sync_webhook_id` from the prior version, preserving the fixed Puente webhook endpoint, and that saving it as active with a `trigger.schedule` node creates or updates the workflow's schedule.
6. Obtain explicit user confirmation of the automatic service effects.
7. POST the complete payload once.
8. Verify that `version` increased, `is_latest` is true, and `kind` is unchanged.

A new version never changes `kind`, even when the payload sends another value. Use the kind endpoint to change it.

### Schedule triggers

A workflow is scheduled when its latest version is `active` and has exactly one `trigger.schedule` node. Saving through `POST /workflows/` or activating through `PUT /workflows/{scenario_id}/status` creates or updates that schedule automatically, including with a Studio credential. Do not call `/workflows/{id}/cron`.

`inputs.cron` must have exactly 5 fields (minute, hour, day of month, month, day of week) using only digits and `* / , -`. Names such as `MON`, `?`, `L`, `#`, `@` macros, and seconds fields are rejected; day of week is `0-6`. The minimum interval is 5 minutes, checked on the minute field:

| Cron | Result |
|---|---|
| `*/5 * * * *`, `0,30 * * * *`, `0 9 * * 1-5` | Valid |
| `* * * * *`, `*/2 * * * *`, `0-10 * * * *`, `*/7 * * * *` | `cron_too_frequent` |

`inputs.timezone` must be an exact IANA name such as `America/Santiago`; it defaults to `UTC`.

Validation codes are `cron_missing`, `cron_invalid`, `cron_too_frequent`, `timezone_invalid`, and `trigger_schedule_duplicated`. They return `422` when:

- `POST /workflows/` saves `active` and the cron or timezone changed, the previous version was not active, or the workflow is new. `detail` is `{"errors": [...], "warnings": [...]}`, each item `{code, message, node, edge}`. The previous version stays current.
- `PUT /workflows/{scenario_id}/status` activates the version. `detail` is a user-facing string.

Other saves return the same codes in `validation_warnings`.

### Field formula validation

Every `POST /workflows/` and every activation through `PUT /workflows/{scenario_id}/status` validates field formulas. A `draft` save returns formula errors in `validation_warnings` and still saves. An `active` or `inactive` save, or an activation, returns `422` with `detail` = `{"errors": [...], "warnings": [...]}`; formula items add `field`, `start`, `end`, and `hint`. Fix them with [expressions.md](expressions.md).

### Derive user-facing URLs

Use only these configured API origins:

| Environment | API origin | Derived webhook endpoint | Frontend editor URL |
|---|---|---|---|
| Production | `https://api.puente.xyz` | `https://api.puente.xyz/workflows/webhook/{sync_webhook_id}` | `https://app.puente.xyz/workflows/{scenario_group_id}/edit`; for `kind: "agent"`, `https://app.puente.xyz/agentes/{scenario_group_id}/edit` |
| Staging | `https://staging.puente.xyz` | `https://staging.puente.xyz/workflows/webhook/{sync_webhook_id}` | Not defined by this contract; do not invent one. |

The stable `scenario_group_id` identifies the workflow project across versions
and is the UUID in the production editor route. The `id` field identifies one
saved version and must not be substituted into that route.

Build the webhook endpoint from the normalized configured API origin and
`sync_webhook_id`. This matches the Puente frontend behavior. Treat
`webhook_url` as a legacy fallback field, and do not surface a different
webhook host or webhook subdomain. If either required value is absent or the
configured origin is unsupported, state that the URL cannot be derived.

Always label the editor URL and webhook endpoint separately. When a user asks
to open the workflow or project in the frontend, return the editor URL rather
than the webhook endpoint.

### Change saved status

Use the saved version `id` of the latest version (`is_latest=true`). Any other version returns `409`; read the group again and use its latest `id`. Activating one version causes other active versions in the same group to become inactive.

Activation does not run the workflow immediately. It does make the workflow eligible for execution through existing external triggers or synchronous webhooks, and it creates or updates the schedule of a `trigger.schedule` workflow. Require separate explicit user confirmation before saving `active`, including when `active` appears in a create/version payload.

## Execution history

Both routes are read-only and accept the Studio credential. The credential sees
only executions of workflows owned by its team. A workflow or execution from
another team returns `404`, the same as a missing one.

### List executions

`GET /workflows/{scenario_id}/executions` accepts any saved version `id` of the
workflow and returns executions of every version from the last 90 days, newest
first.

| Query parameter | Use |
|---|---|
| `limit` | 1 to 200; defaults to 50. |
| `cursor` | The previous page's `next_cursor`. |
| `include=messages` | Adds each execution's `input` and, as `outputs`, the results of its last three completed steps. |
| `timezone` | IANA zone used for `totals.today`; defaults to `UTC`. |

The response contains `executions`, `next_cursor` (`null` on the last page), and
`totals` (`total`, `completed`, `failed`, `running`, `today`) on the first page
only. Each execution has `execution_id`, `scenario_id`, `scenario_version`,
`status`, `stopped_at`, `started_at`, `completed_at`, `total_steps`,
`steps_completed`, `steps_failed`, and `first_step_label`. A preview has
`value`, `bytes`, `truncated`, and `preview`. A value over 8 KiB has
`value: null`, `truncated: true`, and its first 1,024 characters in `preview`.

The list is a summary without step errors or logs. Use it to find the relevant
execution, then read that execution. Request `include=messages` only when the
input or output is needed for the diagnosis.

### Read an execution

`GET /workflows/executions/{execution_id}` returns the global `status`
(`pending`, `running`, `completed`, or `failed`), `stopped_at`, `failure`
(`source`, `node_label`, `step_index`, `error_type`, `message`, `http_status`)
when available, `initial_variables`, timestamps, and `steps`. Each step has
`step_index`, `label`, `node_id`, `status`, `result`, `logs` (`stdout`,
`stderr`), `error` (`name`, `value`, `message`, `traceback`), and `iteration`
for steps inside an iterator.

The response is limited to 16 MiB. A value removed to fit appears in
`truncated` with its `field`, `step_index`, `iteration_index`, and `bytes`.
Read only the values you need again with `?step_index=<n>`, adding
`&iteration_index=<n>` for one iterator item. `iteration_index` requires
`step_index`.

A full read of a legacy-engine execution that has been `running` for more than
35 minutes marks it `failed` as stuck. This is server-side recovery, not a
retry. Report it when it happens.

Execution data can contain personal data or secrets received by the workflow.
Quote only the excerpts that support the diagnosis. Never copy complete
payloads, `initial_variables`, or logs into reports.

## Execution retry

Read [retry.md](retry.md) for availability checks, Studio-key permissions, both
retry strategies, request and response fields, duplicate-effect authorization,
and linked-execution verification. Execution-history access does not prove
permission to check eligibility or retry. Retrying uses the original saved
version and inputs; it does not apply a later definition fix.

## Errors and safety

- `401`: the Studio credential is missing, invalid, revoked, or not accepted.
- `403`: the operation attempts a resource outside the credential's team.
- `404`: the requested saved definition cannot be found through the available list data, or the requested workflow, workflow group, or execution does not exist or belongs to another team.
- `409`: `PUT /workflows/{scenario_id}/status` received a version that is not the latest. Deleting the current version of an active workflow with several versions also returns `409`; it must be deactivated first.
- `422`: the payload shape is invalid, a schedule validation code applies (see Schedule triggers), a field formula is invalid (see Field formula validation), or `PUT /workflows/groups/{scenario_group_id}/kind` asked for `agent` on a workflow without an `AGENT` or `AGENT_ADVANCED` node (`Necesita un paso de agente`).

Never print the Studio credential or persist it outside the current project's ignored `.env`. Do not automatically retry create, version, status, kind, or execution-retry mutations after a network interruption. For an uncertain retry response, follow the linked-execution recovery procedure in [retry.md](retry.md).
