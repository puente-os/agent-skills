# Google Drive workflow actions

## Contents

- Discover the live contract
- Connect a Google Drive account
- Browse drives, files, and folders
- Shared inputs and outputs
- List files and folders
- Get file metadata
- Create a folder
- Copy, move, or trash an item
- Download a file
- Upload a workflow file
- Recover from errors

## Discover the live contract

Before saving a Drive node, call authenticated `GET /workflows/integrations`
and read public `GET /openapi.json` from the configured `BASE_URL`. Require
the exact `node_id` in both the selectable catalog and the top-level
`x-puente-integration-actions` object. Read that entry's `input_schema`,
`output_schema`, and `vue_input_schema`, plus `components.schemas.WorkflowNode`
and `components.schemas.ScenarioCreate` before building the definition.

Use the current schema if it differs from this reference. Inputs reject extra
properties. The provider API version is Drive v3; stored node IDs do not
contain `/v3`, and there is no workflow version selector for the provider API.

| Node ID | Display name | Changes Google Drive state |
|---|---|---|
| `google_drive.list_files` | List Files and Folders | No |
| `google_drive.get_file_metadata` | Get File Metadata | No |
| `google_drive.create_folder` | Create Folder | Yes |
| `google_drive.copy_file` | Copy File | Yes |
| `google_drive.move_file` | Move File | Yes |
| `google_drive.trash_file` | Move File to Trash | Yes |
| `google_drive.upload_file` | Upload File | Yes |
| `google_drive.download_file` | Download File | No |

All eight currently expose `manual_execution_allowed: true`. This metadata
does not authorize this management skill to execute a node or workflow.
Download does not change Google Drive state, but execution stores a temporary
Puente workflow file. The drive browser is a separate read operation; do not
invent a `google_drive.list_drives` workflow action.

## Connect a Google Drive account

Follow [integrations.md](integrations.md) for account selection and authorization.
Use provider `google-drive` explicitly; the connection routes default to a
different provider when it is omitted. A Sheets or Gmail connection is not a
Drive connection, even when it uses the same Google account.

| Operation | Method and path |
|---|---|
| List connections | `GET /studio/integrations/connections?provider=google-drive` |
| Read a connection | `GET /studio/integrations/connections/{connection_id}?provider=google-drive` |
| Verify a connection | `POST /studio/integrations/connections/{connection_id}/verify?provider=google-drive` |
| Disconnect, only when requested | `DELETE /studio/integrations/connections/{connection_id}?provider=google-drive` |

Authenticate with `X-API-Key: <STUDIO_KEY>`. Do not send `equipo_id`; the key
supplies the company and team. The list response contains `data`, an array of
public connection records. Read and verify the chosen connection before use.
Send JSON `{}` with the verification POST. Drive verification updates and
returns the public connection record; continue only when `status` is `active`.
It does not prove access to every file. Browse the intended resource as well.

Only after the user chooses a new connection, call:

```http
POST /studio/integrations/google-drive/connect-link
X-API-Key: <STUDIO_KEY>
Content-Type: application/json

{"display_name":"Operations Drive"}
```

The body is optional. `display_name` is an optional label of at most 120
characters. The response contains `connection_id`, `connect_link`, and
`expires_at`. Show the short-lived link, wait for the user to complete Google
authorization and reply, then read and verify that connection. Link creation
alone does not make it ready. A requested disconnect returns `204 No Content`.

## Browse drives, files, and folders

These Studio routes select resources before a definition is saved. They do
not execute the saved workflow. Use the selected literal `connection_id` and
URL-encode query parameters.

- `GET /studio/integrations/google-drive/drives?connection_id=...` lists
  accessible shared drives. Optional `page_token` continues the result.
  The response uses Google's names: `drives` contains `id` and `name`, and
  `nextPageToken` is the continuation token when present.
- `GET /studio/integrations/google-drive/files?connection_id=...` lists
  accessible items. Optional parameters are `drive_id`, `parent_id`, `query`,
  `folders_only` (default `false`), and `page_token`.
  `query` is a name substring, not a raw Google query. `parent_id` restricts
  results to a folder; `folders_only=true` restricts them to folders.
  This response uses normalized names: `files`, `next_page_token`, and
  `incomplete_search`. Each page contains at most 100 items.

Omit `drive_id` for the default user search, or use an ID from the shared-drive
browser. Use `parent_id=root` for the My Drive root. Without a parent filter,
the browser searches the selected scope rather than just its root children.
Keep filters unchanged when requesting another page. Stop when the token is
absent or null. Report `incomplete_search: true`; do not describe the result as
complete. Ask the user to narrow the scope if necessary.

Browser parameter names differ from action inputs: `parent_id` becomes
`parent_folder`, `query` becomes `name_contains`, and `folders_only=true`
becomes `item_type: "folder"`. Store the selected resource ID, not its display
name. Do not send unresolved workflow expressions to browser routes.

## Shared inputs and outputs

Every action requires a non-empty, literal Puente `connection_id`. Do not use
an email, Google token, provider connection ID, or workflow expression there.

File and folder references accept an item ID or a supported HTTPS Google URL,
such as `https://drive.google.com/file/d/FILE_ID/view`,
`https://drive.google.com/drive/folders/FOLDER_ID`, or a Docs, Sheets, or Slides
document URL. Raw IDs contain at least 10 letters, digits, underscores, or
hyphens. Use `root` only where a My Drive folder root is intended. Other URL
hosts and HTTP URLs are rejected. A valid reference does not establish access.

Use workflow expressions only where the live field metadata sets
`supports_references: true`. Follow [nodes.md](nodes.md) for the saved context
key, for example `{{read_metadata.file.file_id}}`. Names are 1–255 characters.
Optional names and resource fields default to null; omit unused values rather
than sending empty strings.

Except for list and download, each action returns `{"file": <item>}`. A
normalized item contains `file_id`, `name`, `mime_type`, `item_type` (`file` or
`folder`), `parent_ids`, `drive_id`, `size_bytes`, `created_at`, `modified_at`,
`web_view_url`, `trashed`, and `can_download`. Some metadata, including size,
drive ID, dates, and URL, can be null. Do not treat a folder as a downloadable
file or assume Google-native documents have a byte size.

## List files and folders

`google_drive.list_files` requires only `connection_id`. Optional inputs:

| Input | Default | Meaning |
|---|---|---|
| `drive_id` | null | Shared-drive scope; omitted uses the user scope |
| `parent_folder` | null | Only direct children of this folder |
| `name_contains` | null | Non-empty name substring, at most 255 characters |
| `item_type` | `all` | `all`, `file`, or `folder` |
| `mime_types` | `[]` | Up to 20 MIME strings; matches any listed type |
| `include_trashed` | `false` | With `true`, include both trashed and active items |
| `page_size` | `100` | Integer from 1 through 200 |
| `page_token` | null | Continuation token, at most 2,048 characters |

The action returns one page: `files`, nullable `next_page_token`, and
`incomplete_search` (default `false`). It does not fetch all pages or recurse
through folders. Do not infer absence from the first page alone.

```json
{
  "label": "find_reports",
  "node_id": "google_drive.list_files",
  "inputs": {
    "connection_id": "conn_example_opaque",
    "parent_folder": "example_folder_id",
    "name_contains": "Report",
    "item_type": "file",
    "page_size": 100
  },
  "on_error": "stop",
  "index_position": 1
}
```

## Get file metadata

`google_drive.get_file_metadata` requires `connection_id` and `file` (1–2,048
characters). It reads metadata for a file or folder and returns `file`. It
does not download bytes. Read `can_download` before planning a download.

## Create a folder

`google_drive.create_folder` requires `connection_id` and `name`. Optional
`parent_folder` and `drive_id` default to null. The parent is `parent_folder`
when supplied, otherwise `drive_id`; with neither, Google chooses the default
location. For a shared-drive subfolder, select its actual parent folder ID.
It creates one folder and returns `file`. Do not claim an existing folder is
reused by name or that missing intermediate folders are created.

## Copy, move, or trash an item

All three require `connection_id` and `file` (1–2,048 characters).

- `google_drive.copy_file` also accepts optional `destination_folder` and
  `name`, both default null. Omitted values leave placement and naming to
  Google. This copies one file; it does not recursively copy folders.
- `google_drive.move_file` requires `destination_folder`. It adds that parent
  and removes the item's current parents. It does not create a copy.
- `google_drive.trash_file` moves the file or folder to trash. It does not
  permanently delete it. There is no restore or permanent-delete action in
  this set.

Each returns `file`. Copy and move destination references are at most 2,048
characters. Google permissions and shared-drive rules still apply. Confirm
the intended item and destination before saving a definition that moves or
trashes user data. Do not run these actions through this skill.

## Download a file

`google_drive.download_file` requires only `connection_id` and `file`. Do not
send `export_format`, including `"auto"` or null: that input was removed.

Google-native files use automatic conversion:

| Source | Downloaded format |
|---|---|
| Google Docs | DOCX |
| Google Sheets | XLSX |
| Google Slides | PPTX |

Other Google-native types, including Drawings and folders, are not supported
exports. Ordinary binary files retain their content format. Download requires
Google's download capability and is limited to 100 MiB (104,857,600 bytes);
Google can impose additional export limits. The output has `source_file`
(normalized Drive metadata) and `workflow_file`, containing `file_id`,
`file_url`, `filename`, `mime_type`, `size_bytes`, and `expires_at`.

The temporary workflow file expires after 24 hours and is scoped to its company
and team. Use its `file_id` in a later upload while it is valid. `file_url`
points to a JWT-protected Puente delivery route; it is not a public Google
link and this Studio-key skill cannot fetch it. Do not publish it as an
anonymous download URL.

```json
{
  "label": "download_report",
  "node_id": "google_drive.download_file",
  "inputs": {
    "connection_id": "conn_example_opaque",
    "file": "example_source_file_id"
  },
  "on_error": "stop",
  "index_position": 2
}
```

## Upload a workflow file

`google_drive.upload_file` requires `connection_id` and `workflow_file_id`
(1–128 characters). Use an existing, unexpired Puente workflow file ID from
the same company and team. This field does not take a local path, arbitrary
URL, base64 content, Google file ID, or `puente-file:` prefix.

Optional `name`, `drive_id`, and `parent_folder` default to null. An omitted
name uses the stored filename and MIME type. Parent selection follows create
folder: `parent_folder`, then `drive_id`, then Google's default location.
The action creates a file and returns normalized `file` metadata. It does not
overwrite an existing file or convert it to a Google-native document.

For a download followed by an upload, connect the nodes with an edge and pass
the nested output ID using the saved context key:

```json
{
  "label": "upload_report",
  "node_id": "google_drive.upload_file",
  "inputs": {
    "connection_id": "conn_example_opaque",
    "workflow_file_id": "{{download_report.workflow_file.file_id}}",
    "parent_folder": "example_destination_folder_id",
    "name": "Report copy.docx"
  },
  "on_error": "stop",
  "index_position": 3
}
```

These examples are node fragments. Use the complete definition and edge
contract in [api.md](api.md) and [nodes.md](nodes.md) before saving a workflow.

## Recover from errors

Preserve the returned HTTP status and error detail. Read
[errors.md](errors.md) and [troubleshooting.md](troubleshooting.md) for workflow
error envelopes. A valid HTTP response alone does not prove a workflow step
succeeded.

- For `integration_unavailable`, stop the operation and report the environment
  and integration. Account authorization alone might not resolve environment
  configuration. Do not change provider infrastructure through this skill.
- For an inaccessible connection or `needs_reauth`, follow the connection
  selection flow. Do not replace or disconnect it automatically.
- For `invalid_reference`, check the ID or supported HTTPS URL and confirm
  that a workflow expression resolves before the action uses it.
- For `file_not_found`, check the workflow file's expiry, company, and team;
  a new download can produce a fresh ID when the user runs the workflow.
- For `file_not_downloadable`, check permissions and download capability.
  For `file_not_exportable`, check the supported native formats above.

Do not automatically retry upload, copy, folder creation, move, or trash after
an uncertain result. Ask the user to inspect the provider state before a
retry, since the previous action might already have taken effect.
