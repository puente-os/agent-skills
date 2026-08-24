# Google Sheets workflow actions

## Contents

- Discover the live contract
- Google Sheets connection behavior
- Shared input and metadata meanings
- Search rows (advanced)
- Batch get values
- Batch get values by data filter
- Create spreadsheet row
- Upsert row

## Discover the live contract

Do not treat this reference as an authoritative action registry. Before saving a Google Sheets node:

1. Call authenticated `GET /workflows/integrations`. This is the saved/selectable node catalog and its editor input schema.
2. Read public `GET /openapi.json`, including `components.schemas.WorkflowNode`, `components.schemas.ScenarioCreate`, and the top-level `x-puente-integration-actions[node_id]` entry.
3. Require the exact same `node_id` in both surfaces. Do not save a node that appears only in one.
4. Build `inputs` from the current action contract. These schemas reject additional properties, so extra fields can fail validation.

The OpenAPI action entry supplies `action_name`, `mutates`, `manual_execution_allowed`, `input_schema`, `output_schema`, and `vue_input_schema`. `mutates` means the action writes Google provider state. `manual_execution_allowed` means the editor may run that node standalone; it does not authorize this management skill to call execution, trigger, webhook, schedule, or other non-public endpoints.

The production schema can be cross-checked at `https://api.puente.xyz/openapi.json`. The authenticated integrations catalog still controls which nodes are currently selectable for the Studio key's environment.

## Google Sheets connection behavior

First follow the shared discovery, selection, readiness, and authorization flow
in [integrations.md](integrations.md). Google Sheets uses:

- action prefix `google_sheets.*`;
- connection provider `google-sheets`;
- `GET /studio/integrations/connections?provider=google-sheets` to list
  connections;
- `GET /studio/integrations/connections/{connection_id}?provider=google-sheets`
  to read one connection;
- `DELETE /studio/integrations/connections/{connection_id}?provider=google-sheets`
  to disconnect only when requested.

Only after the user chooses a new Google Sheets connection, create its link:

```http
POST /studio/integrations/google-sheets/connect-link
X-API-Key: <STUDIO_KEY>
Content-Type: application/json

{"display_name":"Finance Sheets"}
```

The body is optional. `display_name` is an optional human-facing label of at
most 120 characters. The response contains:

- `connection_id`: opaque Puente identifier for this team-scoped connection;
- `connect_link`: short-lived authorization URL;
- `expires_at`: time at which that authorization link expires.

After either selecting an existing active connection or authorizing a new one,
verify access to the intended spreadsheet. `spreadsheet` is the spreadsheet ID
or supported Google Sheets URL to probe:

```http
POST /studio/integrations/connections/{connection_id}/verify
X-API-Key: <STUDIO_KEY>
Content-Type: application/json

{"spreadsheet":"<spreadsheet ID or Google Sheets URL>"}
```

An access probe does not alter connection status. A failed probe does not
authorize changing, replacing, or disconnecting the connection. A requested
disconnect succeeds with `204 No Content`.

## Shared input and metadata meanings

All five actions documented below currently have `manual_execution_allowed: true`. Always rediscover this metadata before relying on it.

- `connection_id` (required): literal opaque Puente connection ID obtained through the lifecycle above; no workflow interpolation.
- `spreadsheet` (required): spreadsheet ID, supported Google Sheets URL, or a resolved workflow reference.
- `major_dimension` (optional, default `ROWS`): `ROWS` groups returned values by row; `COLUMNS` groups them by column.
- `value_render_option` (optional, default `FORMATTED_VALUE`): `FORMATTED_VALUE` returns display-formatted values, `UNFORMATTED_VALUE` returns underlying values, and `FORMULA` returns formulas.
- `date_time_render_option` (optional, default `SERIAL_NUMBER`): `SERIAL_NUMBER` returns numeric date/time serials; `FORMATTED_STRING` returns formatted text. Google ignores this setting when `value_render_option` is `FORMATTED_VALUE`.

Downstream nodes reference an output through the saved context key described in [nodes.md](nodes.md), for example `{{read_ranges_1.spreadsheet_id}}`.

## Search rows (advanced)

`google_sheets.search_rows_by_query` is displayed as **Search Rows (Advanced)**. It is read-only (`mutates: false`) and filters rows with the Google Visualization API Query Language.

Inputs in addition to `connection_id` and `spreadsheet`:

- `sheet_name` (required): non-empty visible tab name.
- `query` (required): non-empty query from 1 to 8,192 characters. Google query syntax has no `from` clause. Use column letters and single-quoted string literals, for example `select * where A = 'hola'`.
- `range` (optional, default `null`): non-empty A1 range when supplied, such as `A1:F1000`. It limits the data queried within `sheet_name`; omit it to query the selected tab without a narrower range.
- `limit` (optional integer, default `1000`, minimum `1`): maximum number of rows the action may return. The public input contract does not define a fixed maximum, so values greater than `1000` are accepted.

If `query` has no `limit N` clause, the action applies the `limit` field to the query. If `query` already has a `limit N` clause, that clause is preserved. The `limit` field still caps the number of rows the action accepts: keep a query-level limit at or below the field value, or the action can fail if the query returns more rows than the field allows. The action does not silently truncate an oversized result.

The first row is treated as column headers and is not returned as data. Use a real header row; otherwise the first data row will be interpreted as headers and omitted.

Safe node example:

```json
{
  "label": "search_greeting",
  "node_id": "google_sheets.search_rows_by_query",
  "inputs": {
    "connection_id": "conn_example_opaque",
    "spreadsheet": "https://docs.google.com/spreadsheets/d/example-sheet-id/edit",
    "sheet_name": "Customers",
    "query": "select A, B where A = 'Pepe'",
    "limit": 2500
  },
  "on_error": "stop",
  "index_position": 1
}
```

The action output schema is:

```json
{
  "data": [
    {
      "A": "Pepe",
      "B": "Gonzales"
    }
  ]
}
```

A standalone execution response places that action output under `result`:

```json
{
  "result": {
    "data": [
      {
        "A": "Pepe",
        "B": "Gonzales"
      }
    ]
  }
}
```

Rows are objects keyed by the returned column identifiers such as `A` and `B`. Missing cells are `null`; dates, datetimes, and times are normalized to ISO-formatted strings. No matches return `{"data":[]}`. Omitting `limit` uses the `1000`-row default; supplying a larger value allows more than 1,000 rows when the result fits within the 5 MiB response-size constraint. A response that exceeds that constraint fails instead of returning a partial list. Narrow the query or `range`, or batch the work, when a large result may exceed it.

## Batch get values

`google_sheets.batch_get_values` is read-only (`mutates: false`). It reads several A1 ranges in one request.

Inputs in addition to the shared fields:

- `ranges` (required): non-empty array of A1 range strings. The result `value_ranges` order follows this request order.

Safe node example:

```json
{
  "label": "read_ranges",
  "node_id": "google_sheets.batch_get_values",
  "inputs": {
    "connection_id": "conn_example_opaque",
    "spreadsheet": "https://docs.google.com/spreadsheets/d/example-sheet-id/edit",
    "ranges": ["Orders!A1:D20", "Summary!A1:B5"],
    "major_dimension": "ROWS",
    "value_render_option": "FORMATTED_VALUE",
    "date_time_render_option": "SERIAL_NUMBER"
  },
  "on_error": "stop",
  "position": {"x": 300, "y": 0},
  "index_position": 1
}
```

Output fields:

- `spreadsheet_id`: resolved Google spreadsheet ID.
- `value_ranges`: array in requested range order. Each item contains `range` (resolved range), `major_dimension` (`ROWS` or `COLUMNS`), and `values` (two-dimensional value array grouped by that dimension).

## Batch get values by data filter

`google_sheets.batch_get_values_by_data_filter` is read-only (`mutates: false`). It reads ranges selected by Google data filters.

Inputs in addition to the shared fields:

- `data_filters` (required): non-empty array. Each item must select exactly one of `a1_range`, `grid_range`, or `developer_metadata_lookup`.
- `a1_range`: non-empty A1 range such as `Sheet1!A1:D20`.
- `grid_range`: object whose optional non-negative integer fields are `sheet_id`, `start_row_index`, `end_row_index`, `start_column_index`, and `end_column_index`. `sheet_id` is the numeric tab ID/gid, not the spreadsheet ID. Row and column indexes are zero-based and half-open: start is inclusive, end is exclusive; an omitted boundary is unbounded on that side.
- `developer_metadata_lookup`: advanced lookup object. Its published optional fields are:
  - `location_type`: `SPREADSHEET`, `SHEET`, `ROW`, or `COLUMN`;
  - `metadata_location`: free-form object in the published schema; do not invent nested fields;
  - `location_matching_strategy`: `EXACT_LOCATION` or `INTERSECTING_LOCATION`;
  - `metadata_id`: integer greater than or equal to zero;
  - `metadata_key`: non-empty string;
  - `metadata_value`: string;
  - `visibility`: `DOCUMENT` or `PROJECT`.

Valid selector shapes include:

```json
{"a1_range":"Sheet1!A1:D20"}
```

```json
{"grid_range":{"sheet_id":0,"start_row_index":0,"end_row_index":20,"start_column_index":0,"end_column_index":4}}
```

```json
{"developer_metadata_lookup":{"metadata_key":"region","metadata_value":"south","visibility":"DOCUMENT"}}
```

Safe node example:

```json
{
  "label": "read_filtered",
  "node_id": "google_sheets.batch_get_values_by_data_filter",
  "inputs": {
    "connection_id": "conn_example_opaque",
    "spreadsheet": "example-sheet-id",
    "data_filters": [
      {"a1_range": "Sheet1!A1:D20"},
      {"grid_range": {"sheet_id": 0, "start_row_index": 20, "end_row_index": 40}}
    ],
    "major_dimension": "ROWS",
    "value_render_option": "UNFORMATTED_VALUE",
    "date_time_render_option": "SERIAL_NUMBER"
  },
  "on_error": "stop",
  "index_position": 2
}
```

Output fields:

- `spreadsheet_id`: resolved Google spreadsheet ID.
- `value_ranges`: matched results. Each item contains `data_filters` (the filters that matched it) and `value_range`, whose `range`, `major_dimension`, and `values` describe the matched values. Use `data_filters` to trace why a range was returned; do not assume one result per request filter or request-order correspondence.

## Create spreadsheet row

`google_sheets.create_spreadsheet_row` writes Google Sheets state (`mutates: true`). It inserts one row, shifts existing rows downward, then writes from column A using `USER_ENTERED`, so Google parses the strings as if the user typed them in the Sheets UI.

Inputs in addition to `connection_id` and `spreadsheet`:

- `sheet_id` (required): non-negative integer tab ID/gid. Zero is valid.
- `sheet_name` (required): visible title of that same tab.
- `row_index` (required): zero-based insertion position. `0` inserts before visible row 1; `2` inserts before visible row 3.
- `values` (required): non-empty string array mapped from column A onward.

Safety invariant: `sheet_id` and `sheet_name` must identify the same tab. Otherwise the insertion and value write can target different tabs. Verify both before saving or manually running the node.

Safe node example:

```json
{
  "label": "insert_order",
  "node_id": "google_sheets.create_spreadsheet_row",
  "inputs": {
    "connection_id": "conn_example_opaque",
    "spreadsheet": "example-sheet-id",
    "sheet_id": 0,
    "sheet_name": "Orders",
    "row_index": 2,
    "values": ["order-123", "2026-08-20", "42.50"]
  },
  "on_error": "stop",
  "index_position": 3
}
```

Output fields:

- `spreadsheet_id`: resolved Google spreadsheet ID.
- `sheet_id`: numeric tab ID used for insertion.
- `row_index`: zero-based insertion position.
- `values`: strings written from column A onward.
- `updated_range`: A1 range Google reports as updated.

## Upsert row

`google_sheets.upsert_row` writes Google Sheets state (`mutates: true`).

Inputs in addition to `connection_id` and `spreadsheet`:

- `range` (required): A1 table/search range. Include the sheet name. Until the row-index calculation is corrected, use a range beginning at row 1, such as `Customers!A1:D`.
- `values` (required): non-empty string array for the target row.
- `key_column` (optional only together with `key_value`): zero-based column index within each row returned by `range`.
- `key_value` (optional only together with `key_column`): non-empty string matched by exact equality.

With the key pair, the action updates the first exact match using `USER_ENTERED`; if no row matches, it appends. With both fields omitted, it always appends. Append behavior uses `INSERT_ROWS`.

Current implementation caveat: returned `row_index` is the zero-based match index within the fetched range, not an absolute sheet row. The update calculation does not account for an A1 range that starts below row 1. Recommend a search range beginning at row 1 and do not describe `row_index` as an absolute row number.

Safe node example:

```json
{
  "label": "upsert_customer",
  "node_id": "google_sheets.upsert_row",
  "inputs": {
    "connection_id": "conn_example_opaque",
    "spreadsheet": "{{start.spreadsheet_url}}",
    "range": "Customers!A1:D",
    "values": ["customer-123", "Ana", "active", "2026-08-20"],
    "key_column": 0,
    "key_value": "customer-123"
  },
  "on_error": "stop",
  "index_position": 4
}
```

Output fields:

- `spreadsheet_id`: resolved Google spreadsheet ID.
- `updated_range`: A1 range affected; defaults to an empty string when Google reports none.
- `updated_rows`, `updated_columns`, `updated_cells`: non-negative write counts, each defaulting to zero.
- `success`: always `true` for a successful action response.
- `operation`: `updated` when the first exact match was updated, or `appended` when a row was appended.
- `row_index`: zero-based match index within the fetched range for an update; `null` on append.
