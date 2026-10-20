# Google Analytics (GA4) workflow reports

## Discover the live contract

Before you save a GA4 node, read authenticated `GET /workflows/integrations`
and public `GET /openapi.json` from the configured `BASE_URL`.
Require the exact node ID in the selectable catalog and the top-level
`x-puente-integration-actions` object. Read its `input_schema`, `output_schema`,
and `vue_input_schema`. Use the current contract if it differs from this reference.

| Node ID | Display name | Changes Analytics data | Manual execution allowed |
|---|---|---|---|
| `google_analytics.run_report` | Generate Report | No | Yes |

Puente exposes one GA4 action. Filters, realtime reports, property administration, and data
collection are outside this contract. Do not add `/v1beta` to the stored node ID
or invent a version input.

Manual-execution metadata does not authorize this skill to run a node or workflow.
Use this skill for discovery, connections, and saved definitions only.
Do not call run endpoints or the Google API directly.
Obey the parent skill's rules for save effects and separate activation approval.

## Connect an Analytics account

Read [integrations.md](integrations.md) for account selection and authorization.
Use provider `google-analytics` explicitly on every shared connection route.

| Operation | Method and path |
|---|---|
| List connections | `GET /studio/integrations/connections?provider=google-analytics` |
| Read a connection | `GET /studio/integrations/connections/{connection_id}?provider=google-analytics` |
| Verify a connection | `POST /studio/integrations/connections/{connection_id}/verify?provider=google-analytics` |
| Disconnect, only when requested | `DELETE /studio/integrations/connections/{connection_id}?provider=google-analytics` |

Authenticate with `X-API-Key: <STUDIO_KEY>`. Omit `equipo_id`; the key supplies the
company and team. The list response contains `data`, an array of public connection
records. After account selection, read the connection, then verify it with JSON `{}`.
Continue only when the returned public `status` is `active`.

Verification checks the provider connection and Google account identity.
It does not run a report or prove access to a property. The selected Google
account must have read access to the intended GA4 property.
An active connection does not prove Google scope verification approval or real traffic collection.

Only after the user chooses a new connection, call:

```http
POST /studio/integrations/google-analytics/connect-link
X-API-Key: <STUDIO_KEY>
Content-Type: application/json

{"display_name":"Website Analytics"}
```

The body is optional. `display_name` is an optional label of at most 120 characters.
The response contains `connection_id`, `connect_link`, and `expires_at`.
Show the short-lived link. Wait for the user to complete authorization and reply.
Then read and verify that connection. Link creation alone does not establish readiness.
The connection requests the read-only Analytics scope, plus account identity scopes.
A requested disconnect returns `204 No Content`.

Do not use JWT-only `/integrations/...` routes with a Studio key.
Do not ask for Google tokens, Nango credentials, or OAuth secrets.
There is no property-browser route documented for this skill; ask for the intended property ID.

## Configure Generate Report

Inputs reject extra properties. Use a literal Puente `connection_id` in UUID format
from connection discovery. Do not use a Nango identifier, email, token, or workflow
expression for this field. Other inputs support references when the live metadata
sets `supports_references: true`; read [nodes.md](nodes.md) for context keys.

| Input | Requirement and default |
|---|---|
| `connection_id` | Required literal Puente connection UUID |
| `property_id` | Required numeric string, 1–20 digits, first digit nonzero |
| `start_date` | Default `7daysAgo` |
| `end_date` | Default `yesterday` |
| `dimensions` | Array of at most 9 API field names; default `[]` |
| `metrics` | Required array of 1–10 API field names |
| `limit` | Strict integer from 1 through 10,000; default `1000` |
| `offset` | Strict integer from 0 through 9,223,372,036,854,775,807; default `0` |

Use the GA4 property ID, such as `123456789`. A `G-...` measurement ID, account ID,
property URL, or `properties/...` resource name is not a valid `property_id` input.
Use JSON arrays for dimensions and metrics, not comma-separated strings.
Names must be unique within each array, nonempty, and at most 200 characters.
Names cannot have leading or trailing spaces.

Dates accept `today`, `yesterday`, `NdaysAgo` with one to five digits, or a valid
`YYYY-MM-DD` date. The range is inclusive and uses the property's reporting timezone.
Keep the start date on or before the end date.
Use compatible API field names, such as `country`, `activeUsers`, and `screenPageViews`.
Google's [API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
defines available fields; Puente does not expose every Google request option.

This node fragment uses illustrative identifiers. Replace them with selected resources before a save.

```json
{
  "label": "website_report",
  "node_id": "google_analytics.run_report",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "property_id": "123456789",
    "start_date": "7daysAgo",
    "end_date": "yesterday",
    "dimensions": ["country"],
    "metrics": ["activeUsers", "screenPageViews"],
    "limit": 1000,
    "offset": 0
  },
  "on_error": "stop",
  "index_position": 1
}
```

Use [api.md](api.md) and [nodes.md](nodes.md) for a complete saved definition with edges.
Default the definition to draft. Explain automatic webhook effects before the save.

## Interpret report output

The normalized result contains:

| Field | Meaning |
|---|---|
| `property_id` | Requested GA4 property ID |
| `dimension_headers` | Array of dimension names |
| `metric_headers` | Array of objects with `name` and `type` |
| `rows` | Array of objects with `dimension_values` and `metric_values`, both arrays of strings |
| `row_count` | Total report rows, independent of the page limit |
| `next_offset` | Next row offset, or `null` when no next page is available |
| `metadata` | Provider metadata, such as timezone and currency |
| `property_quota` | Provider quota information |

Match each row's values to the corresponding headers by position.
Metric values remain strings, even for numeric metric types.
Convert them only when the next step requires a numeric value.
Check that `rows` is nonempty before an expression such as
`{{website_report.rows[0].metric_values[0]}}`.

For a later page, use `next_offset` as `offset` with the same connection, property,
dates, dimensions, metrics, and limit. Stop when `next_offset` is `null`.
This describes the saved workflow's pagination; it does not authorize execution through this skill.
See Google's [report and pagination guide](https://developers.google.com/analytics/devguides/reporting/data/v1/basics).

A valid empty report can return `rows: []`, `row_count: 0`, and empty header arrays.
Do not treat absent headers in an empty report as failure.
An empty report does not prove that traffic collection is configured.
Do not retry it automatically or change Analytics configuration to create data.

## Recover from errors

Preserve the public error status and detail. Read [errors.md](errors.md) for shared errors.

| Code | User action |
|---|---|
| `invalid_input` | Check the property ID, dates, compatible field names, arrays, and integer limits |
| `needs_reauth` | Offer the documented authorization flow after the user chooses it |
| `not_accessible` | Check connection scope and the Google account's access to the intended property |
| `resource_unavailable` | Check the property ID and whether the property remains available |
| `unavailable` | Check provider availability or quota details before a user-controlled retry |
| `invalid_data` | Report the invalid provider response; do not invent rows or headers |

Do not disconnect or replace a connection after a report failure without an explicit request.
