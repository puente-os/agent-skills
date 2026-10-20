# Google Docs workflow text actions

## Discover the live contract

Before you save a Docs node, read authenticated `GET /workflows/integrations`
and public `GET /openapi.json` from the configured `BASE_URL`.
Require the exact node ID in the selectable catalog and the top-level
`x-puente-integration-actions` object. Read its `input_schema`, `output_schema`,
and `vue_input_schema`. Use the current contract if it differs from this reference.

| Node ID | Display name | Changes a document | Manual execution allowed |
|---|---|---|---|
| `google_docs.get_document` | Get Document | No | Yes |
| `google_docs.insert_text` | Insert Text | Yes | No |

Puente exposes these two actions. Do not invent document creation, deletion,
formatting, export, or file-browser actions. Do not add `/v1` to stored node IDs
or invent a provider version input.

Use this skill for discovery, connections, and saved definitions only.
Manual-execution metadata does not authorize node or workflow execution through this skill.
Do not bypass the Insert Text restriction with a code node or direct Google API request.
Obey the parent skill's rules for save effects and separate activation approval.

## Connect a Docs account

Read [integrations.md](integrations.md) for account selection and authorization.
Use provider `google-docs` explicitly on every shared connection route.

| Operation | Method and path |
|---|---|
| List connections | `GET /studio/integrations/connections?provider=google-docs` |
| Read a connection | `GET /studio/integrations/connections/{connection_id}?provider=google-docs` |
| Verify a connection | `POST /studio/integrations/connections/{connection_id}/verify?provider=google-docs` |
| Disconnect, only when requested | `DELETE /studio/integrations/connections/{connection_id}?provider=google-docs` |

Authenticate with `X-API-Key: <STUDIO_KEY>`. Omit `equipo_id`; the key supplies the
company and team. The list response contains `data`, an array of public connection
records. After account selection, read the connection, then verify it with JSON `{}`.
Continue only when the returned public `status` is `active`.

Verification checks the provider connection and Google account identity.
It does not read a document or prove edit permission.
The selected account needs read access for Get Document and edit access for Insert Text.
A Drive or Sheets connection does not substitute for a Docs connection.

Only after the user chooses a new connection, call:

```http
POST /studio/integrations/google-docs/connect-link
X-API-Key: <STUDIO_KEY>
Content-Type: application/json

{"display_name":"Team Documents"}
```

The body is optional. `display_name` is an optional label of at most 120 characters.
The response contains `connection_id`, `connect_link`, and `expires_at`.
Show the short-lived link. Wait for the user to complete authorization and reply.
Then read and verify that connection. Link creation alone does not establish readiness.
Authorization requests the Google Docs scope, plus account identity scopes.
A requested disconnect returns `204 No Content`.

Do not use JWT-only `/integrations/...` routes with a Studio key.
Do not ask for Google tokens, Nango credentials, or OAuth secrets.
There is no Docs document-browser route documented for this skill; ask for the document ID or URL.

## Select a document

Both actions require:

| Input | Requirement |
|---|---|
| `connection_id` | Literal Puente connection UUID from discovery |
| `document` | Document ID or supported Google URL, 1–2,048 characters |

Do not use an email, Nango identifier, token, or workflow expression for `connection_id`.
The `document` input supports references when the live metadata permits them.
Read [nodes.md](nodes.md) for context keys and edges.
Inputs reject extra properties.

Prefer the document ID or its `https://docs.google.com/document/d/{id}/edit` URL.
The normalizer accepts IDs with at least 10 letters, digits, underscores, or hyphens.
It also accepts recognized ID paths or `id` query parameters on supported Google hosts.
Those hosts are `docs.google.com`, `drive.google.com`, `sheets.google.com`, and `slides.google.com`.
URLs must use HTTPS. Arbitrary hosts, unresolved expressions, invalid IDs, and `root` fail with `invalid_reference`.
A supported URL only supplies an ID; the resource must still be a Google Docs document.
Do not use a document title or a tab ID as the document identifier.

## Get Document

`google_docs.get_document` requires only the shared inputs above.
It returns `document_id`, `title`, nullable `revision_id`, and `tabs`.
Each tab contains `tab_id`, `title`, nullable `parent_tab_id`, and `text`.
The result includes top-level and child tabs in a flat array.
Use `parent_tab_id` to identify the parent of a child tab.

Puente requests all tab content with `includeTabsContent=true`.
It collects paragraph text runs, table-cell text, and table-of-contents text from each tab body.
This is plain text, not the complete Google document JSON or a formatted export.
Headers, footers, footnotes, images, styles, and structural indices are not returned.
Do not derive a Google insertion index from the length of this flattened text.
See Google's [tab guide](https://developers.google.com/workspace/docs/api/how-tos/tabs).

This node fragment uses illustrative identifiers. Replace them with selected resources before a save.

```json
{
  "label": "read_document",
  "node_id": "google_docs.get_document",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "document": "example_document_1234567890"
  },
  "on_error": "stop",
  "index_position": 1
}
```

Select the intended tab by its returned ID. Check that the tab exists before
an expression such as `{{read_document.tabs[0].text}}`.
The first array element does not necessarily represent the user's intended tab.

## Insert Text

`google_docs.insert_text` requires the shared inputs and nonempty `text`.
It accepts two optional fields:

| Input | Meaning |
|---|---|
| `index` | Strict integer at least 1; omitted or `null` inserts at the end of the selected tab body |
| `tab_id` | Nonblank tab ID; omitted or `null` selects the first tab |

`text`, `index`, and `tab_id` support references when the live metadata permits them.
Use UTF-16 code units for an explicit `index`, not UTF-8 bytes or a Python character count.
Google structural elements also affect valid insertion positions.
Use the returned `tab_id` for a specific tab; a tab URL fragment does not set this input.
Puente does not expose a header, footer, footnote, or revision-precondition input.
See Google's [InsertTextRequest and Location contract](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request).

Confirm the intended document, tab, and text before the definition save.
This node fragment appends text to the first tab when the workflow later runs:

```json
{
  "label": "append_summary",
  "node_id": "google_docs.insert_text",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "document": "example_document_1234567890",
    "text": "Weekly summary\n"
  },
  "on_error": "stop",
  "index_position": 2
}
```

The result contains `document_id` and `replies` from the single insert request.
It does not contain refreshed tab text or a document revision.
Use [api.md](api.md) and [nodes.md](nodes.md) for a complete definition with edges.
Default the definition to draft. Explain automatic webhook effects before the save.
This example does not authorize a document mutation or workflow execution through this skill.

## Recover from errors

Preserve the public error status and detail. Read [errors.md](errors.md) for shared errors.

| Code | User action |
|---|---|
| `invalid_reference` | Supply a supported document ID or HTTPS Google URL |
| `invalid_input` | Check text, index, tab ID, and the live schema |
| `needs_reauth` | Offer the documented authorization flow after the user chooses it |
| `not_accessible` | Check connection scope and document permissions for the selected account |
| `resource_unavailable` | Check that the document exists and remains accessible |
| `unavailable` | Check provider availability before a user-controlled retry |
| `invalid_data` | Report the invalid read response; do not invent document content |
| `outcome_unknown` | Inspect the document before any repeat insert |

Insert Text is not idempotent. A repeat request can duplicate text.
Transport failures, HTTP 408 or 5xx responses, and invalid mutation responses can produce `outcome_unknown`.
The provider adapter sets request retries to zero.
Do not infer failure from a missing response or repeat the insert automatically.
Ask the user to inspect the intended tab and establish whether the text exists.
Resume only after the outcome is clear and the user authorizes any necessary mutation.
Do not disconnect or replace a connection after an action failure without an explicit request.
