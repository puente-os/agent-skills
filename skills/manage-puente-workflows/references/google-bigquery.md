# Google BigQuery workflow actions

## Discover the live contract

Before saving a BigQuery node, read authenticated `GET /workflows/integrations`
and public `GET /openapi.json` from the configured `BASE_URL`. Require the
exact node ID in both the selectable catalog and the top-level
`x-puente-integration-actions` object. Read its `input_schema`, `output_schema`,
and `vue_input_schema`, plus `WorkflowNode` and `ScenarioCreate` for the saved
definition. Use the live contract if it differs from this reference.

| Node ID | Display name | Changes BigQuery data | Manual execution allowed |
|---|---|---|---|
| `google_bigquery.list_tables` | List Tables | No | Yes |
| `google_bigquery.insert_rows` | Insert Rows | Yes | No |

Use this skill for connection management and saved workflow definitions.
Manual-execution metadata describes the editor; it does not authorize this
skill to run a node or workflow. Insert Rows must run as part of a saved
workflow when the user tests it in Puente. Do not bypass its preview block
with a code node or direct Google API request. Follow the parent skill's save
and activation confirmation rules.

These actions use existing datasets and tables. There are no BigQuery
project, dataset, or table selectors in the Studio API documented here.
Ask for explicit IDs. Do not invent SQL query, batch load, schema discovery,
row read, upsert, table creation, or project creation actions. Do not add a
REST version to the node IDs or add provider options to their inputs.

## Connect a BigQuery account

Follow [integrations.md](integrations.md) for existing-account selection and
new authorization. Use provider `google-bigquery` explicitly on every shared
connection route. A Drive or Sheets connection does not substitute for it.

| Operation | Method and path |
|---|---|
| List connections | `GET /studio/integrations/connections?provider=google-bigquery` |
| Read a connection | `GET /studio/integrations/connections/{connection_id}?provider=google-bigquery` |
| Verify a connection | `POST /studio/integrations/connections/{connection_id}/verify?provider=google-bigquery` |
| Disconnect, only when requested | `DELETE /studio/integrations/connections/{connection_id}?provider=google-bigquery` |

Authenticate with `X-API-Key: <STUDIO_KEY>`. Omit `equipo_id`; the key supplies
the company and team. The list response has a `data` array of public connection
records. After the user selects one, read it and verify it with JSON `{}`.
Continue only when verification returns public `status: "active"`.

Verification checks the provider connection and Google account identity.
It does not list BigQuery resources or prove dataset or table permissions.
The selected account must have access to the target dataset to list tables
and permission to insert into the target table. Listing a table does not prove
write access. Ask the user or their administrator to resolve missing access;
do not ask for cloud administration credentials.

Only after the user chooses a new connection, call:

```http
POST /studio/integrations/google-bigquery/connect-link
X-API-Key: <STUDIO_KEY>
Content-Type: application/json

{"display_name":"Team BigQuery"}
```

The body is optional. `display_name` is an optional label of at most 120
characters. The response contains `connection_id`, `connect_link`, and
`expires_at`. Show the short-lived link, wait for the user to complete Google
authorization and reply, then read and verify that connection. Link creation
alone does not establish readiness. Authorization requests the BigQuery
scope plus account identity scopes. A requested disconnect returns `204`.

Use only the public Studio routes above. Do not ask for Google tokens, service
account keys, OAuth client secrets, Nango credentials, backend repository
access, database access, or migrations.

## Shared inputs

Both actions require:

| Input | Requirement |
|---|---|
| `connection_id` | Literal opaque Puente connection UUID from account selection |
| `project_id` | Google Cloud project ID, 1–1,024 characters, without surrounding whitespace |
| `dataset_id` | Dataset ID, 1–1,024 letters, digits, or underscores |

Pass each resource ID separately. Do not supply a Cloud Console URL, display
name, or a fully qualified `project.dataset.table` string in place of an ID.
`connection_id` does not accept an email, provider identifier, token, or workflow
expression. Other fields support references when the live metadata permits
them. Read [nodes.md](nodes.md) for saved context keys and edges.
Inputs reject extra properties. Omit unused optional inputs rather than
sending empty strings.

## List Tables

`google_bigquery.list_tables` requires the shared inputs. Optional inputs:

| Input | Default | Meaning |
|---|---|---|
| `page_size` | `100` | Integer at least 1; use the live schema and provider limits |
| `page_token` | `null` | Nonempty continuation token from a previous page |

It returns one page with `tables` and nullable `next_page_token`. Each table
has `project_id`, `dataset_id`, `table_id`, `name`, and `type`. `name` is the
friendly name when available, otherwise the table ID. Use the IDs to identify
a resource. The type can describe a view or another non-writable resource;
do not assume that every listed item accepts inserts. The result does not
include table rows or a column schema.

This is a node fragment with illustrative IDs. Replace the connection UUID
and resource IDs before saving a complete definition.

```json
{
  "label": "list_dataset_tables",
  "node_id": "google_bigquery.list_tables",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "project_id": "example-project",
    "dataset_id": "operations",
    "page_size": 100
  },
  "on_error": "stop",
  "index_position": 1
}
```

An empty result is valid: `{"tables": [], "next_page_token": null}`.
The action does not fetch all pages. To define a later page, pass the returned
`next_page_token` as `page_token` while keeping the connection, project, dataset,
and page size unchanged. Preserve the token exactly. Stop when it is null;
do not infer the end from the page length alone. Do not claim a first-page
result lists every table. A reference such as
`{{list_dataset_tables.next_page_token}}` requires an edge and a non-null token
before the next page is used; it does not create an automatic pagination loop.

## Insert Rows

`google_bigquery.insert_rows` also requires `table_id` and `rows`.
`table_id` is the existing table ID, 1–1,024 characters, as permitted by the
live schema. `rows` is a nonempty JSON array of objects, one object per row.
Each object's keys must match destination columns and its values must match
the table schema. Get the intended column names and a valid sample row from
the user; List Tables does not provide them.

Pass the row objects directly. Do not wrap each row in a REST `json` object,
send a JSON-encoded string, or place `insertId` alongside a row as a provider
option. Nested JSON values are permitted by Puente but must still match the
actual BigQuery column types. Keep numbers, booleans, arrays, and null values
as their intended JSON types.

The action uses `tabledata.insertAll` with `skipInvalidRows=false` and
`ignoreUnknownValues=false`. Invalid rows fail the request rather than being
silently skipped, and unknown columns are errors rather than discarded data.
These provider options are fixed; do not include them in node inputs.
See Google's [insertAll contract](https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/tabledata/insertAll).

The following fragment assumes an existing table with a string `event_id`
column and an integer `value` column. It is not a table-creation request.
Confirm the destination and row contents before saving the definition.

```json
{
  "label": "insert_event",
  "node_id": "google_bigquery.insert_rows",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "project_id": "example-project",
    "dataset_id": "operations",
    "table_id": "events",
    "rows": [
      {"event_id": "example-event-001", "value": 1}
    ]
  },
  "on_error": "stop",
  "index_position": 2
}
```

Use [api.md](api.md) and [nodes.md](nodes.md) for the complete definition and
edges. Default the workflow to draft. Saving the definition does not insert
these rows; the write occurs when the workflow runs.

The action output contains:

- `submitted_row_count`: number of rows submitted, not an inserted-row count;
- `success`: true only when Google returned no row errors;
- `row_errors`: an array of `{index, errors}`, where `index` is the zero-based
  position in the submitted array. Each error can contain nullable `reason`,
  `location`, and `message`.

A result can have `success: false` even when the provider returned HTTP 200
and the workflow step completed. Inspect both `success` and `row_errors` before
reporting success or allowing downstream work that assumes an insert. Setting
`on_error: "stop"` handles raised failures; it does not turn `success: false`
into a raised failure. Do not calculate an inserted count by subtracting the
number of row errors from `submitted_row_count`.

## Recover from errors

Preserve the public error status and detail. Read [errors.md](errors.md) and
[troubleshooting.md](troubleshooting.md) for the workflow error envelope.

| Code or result | User action |
|---|---|
| `invalid_input` | Check IDs, JSON row shape, page size, and the live contract |
| `needs_reauth` | Offer the documented authorization flow after the user chooses it |
| `not_accessible` | Check the selected connection's team and the account's dataset/table permissions |
| `resource_unavailable` | Check that the requested project, dataset, and table exist and are accessible |
| `unavailable` or `integration_unavailable` | Report the affected environment and integration to Puente when needed |
| `invalid_data` | Report the invalid list response; do not invent table metadata |
| `success: false` with `row_errors` | Match each index to the submitted row and check column names, types, and provider messages |
| `outcome_unknown` | Ask the user to inspect the destination table before any repeat insert |

Insert Rows does not provide duplicate-free delivery, an upsert, a transaction,
or an exposed deduplication key. Its provider adapter disables request retries.
Transport failures, HTTP 408 or 5xx responses, and invalid mutation responses
can produce `outcome_unknown`: the rows might already exist. Do not retry the
insert, rerun the whole workflow, or retry only selected rows automatically.
Ask the user to check the destination using their own BigQuery access and a
row identifier when available. A unique value in the row can help that check
but does not enforce uniqueness. Establish the prior outcome and obtain user
authorization before proposing another insert. Do not use direct SQL or Google
API calls through this management skill to bypass its execution boundary.
A failed action does not authorize replacing or disconnecting the connection.
