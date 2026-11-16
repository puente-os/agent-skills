# Outlook workflow actions

## Contents

- Discover the live contract
- Connect an Outlook account
- Shared inputs and message output
- Read messages and folders
- Send email and manage drafts
- Outbound attachments
- Reply in the original thread
- Forward and move
- Read and download attachments
- New email trigger
- Recover from errors

## Discover the live contract

Before saving an Outlook node, call authenticated `GET /workflows/integrations`
and read public `GET /openapi.json` from the configured `BASE_URL`. Require the
exact `node_id` in both the selectable catalog and the top-level
`x-puente-integration-actions` object. Read its `input_schema`, `output_schema`,
and `vue_input_schema`, plus `components.schemas.WorkflowNode` and
`components.schemas.ScenarioCreate`.

Use the current contract if it differs from this reference. Local source code
or account authorization does not prove that a node is deployed or selectable.
Inputs reject extra properties. Outlook uses Microsoft Graph v1.0; do not add
`/v1` to stored node IDs or invent a provider version input.

| Node ID | Changes mailbox state | Manual execution allowed |
|---|---|---|
| `outlook.list_messages` | No | Yes |
| `outlook.get_message` | No | Yes |
| `outlook.list_mail_folders` | No | Yes |
| `outlook.list_attachments` | No | Yes |
| `outlook.download_attachment` | No | Yes |
| `outlook.send_email` | Yes | No |
| `outlook.create_draft` | Yes | No |
| `outlook.update_draft` | Yes | No |
| `outlook.send_draft` | Yes | No |
| `outlook.reply_email` | Yes | No |
| `outlook.create_reply_draft` | Yes | No |
| `outlook.forward_email` | Yes | No |
| `outlook.move_message` | Yes | No |
| `outlook.new_email` | Trigger; see below | No |

Rediscover this metadata before use. It does not authorize this management
skill to execute a node or workflow. Do not bypass a manual-execution limit
with a code node, direct Graph request, or another endpoint. Calendar actions,
shared-mailbox selection, and a standalone message-browser route are not
documented here.

## Connect an Outlook account

Follow [integrations.md](integrations.md) for account selection and authorization.
Use provider `outlook` explicitly on all shared connection routes.

| Operation | Method and path |
|---|---|
| List connections | `GET /studio/integrations/connections?provider=outlook` |
| Read a connection | `GET /studio/integrations/connections/{connection_id}?provider=outlook` |
| Verify a connection | `POST /studio/integrations/connections/{connection_id}/verify?provider=outlook` |
| Disconnect, only when requested | `DELETE /studio/integrations/connections/{connection_id}?provider=outlook` |

Authenticate with `X-API-Key: <STUDIO_KEY>`. Do not send `equipo_id`; the key
supplies company and team. The list response contains `data`, an array of public
connection records. Read the selected connection, then verify it with JSON `{}`.
Verification probes Inbox access, updates the saved status, and returns the
public connection record. Continue only when `status` is `active`. This does
not prove access to every message or permission for every write operation.

Only after the user chooses a new connection, call:

```http
POST /studio/integrations/outlook/connect-link
X-API-Key: <STUDIO_KEY>
Content-Type: application/json

{"display_name":"Support Outlook"}
```

The body is optional. `display_name` is an optional label of at most 120
characters. The response contains `connection_id`, `connect_link`, and
`expires_at`. Show the short-lived link. Wait for the user to complete Microsoft
authorization and reply, then read and verify that connection. Link creation
alone does not make the connection ready. A requested disconnect returns
`204 No Content`.

Do not use JWT-only `/integrations/...` routes with a Studio key or ask the
user for Microsoft tokens or Nango credentials.

## Shared inputs and message output

Every node requires a literal Puente `connection_id` in UUID format. Use the
value returned by connection discovery, not an email, Microsoft token, Nango
identifier, or workflow expression.

`message_id`, `attachment_id`, and folder IDs are opaque resource identifiers,
not subjects, filenames, Outlook links, or internet `Message-ID` headers.
Resource IDs are 1–2,048 characters and cannot contain whitespace, `/`, `\`,
`?`, or `#`; `.` and `..` are invalid. Use IDs returned by the selected mailbox.
Folder inputs can also use supported well-known folder IDs such as `inbox`
and `archive`.

Use expressions only where live field metadata sets `supports_references: true`.
Follow [nodes.md](nodes.md) for the saved context key. A message result is nested:
use `{{read_message.message.message_id}}`, not `{{read_message.message_id}}`.

Get, create-draft, create-reply-draft, update-draft, move, and new-email outputs
contain `message`.
List output contains `messages`. Each normalized message has `message_id`,
`subject`, nullable `body`, `body_preview`, nullable `sender`, `to_recipients`,
`cc_recipients`, `bcc_recipients`, nullable `received_at`, `sent_at`,
`conversation_id`, `internet_message_id`, `folder_id`, and `web_link`, plus
`has_attachments`, `is_draft`, and `is_read`.

`body` contains `content_type` (`text` or `html`) and `content`. A recipient
contains `email_address` with `address` and nullable `name`. These are normalized
Puente names, not Graph's `id`, `bodyPreview`, or `toRecipients` names. List
Messages does not request the full body; use Get Message when full content is
needed. Use the returned message ID after a draft or move operation.

## Read messages and folders

`outlook.list_messages` requires only `connection_id`. Optional inputs:

| Input | Default | Meaning |
|---|---|---|
| `folder_id` | `inbox` | Selected folder ID |
| `search` | null | Non-empty search text, at most 512 characters |
| `unread_only` | `false` | Restrict to unread messages |
| `received_after` | null | Date-time with a timezone |
| `page_size` | `25` | Integer from 1 through 100 |
| `cursor` | null | Opaque continuation cursor |

Do not combine `search` with `unread_only: true` or `received_after`. Do not
copy Gmail query syntax into this field. The result contains `messages` and
nullable `next_cursor`.

`outlook.get_message` requires `connection_id` and `message_id`. It returns
one `message`, including its body when available.

`outlook.list_mail_folders` requires only `connection_id`. Optional
`parent_folder_id` defaults to null: omit it for top-level folders, or set it
to list that folder's direct children. `page_size` defaults to `100` and accepts
1–100; `cursor` defaults to null. It returns `folders` and nullable `next_cursor`.
Each folder has `folder_id`, `name`, nullable `parent_folder_id`,
`child_folder_count`, `unread_count`, and `total_count`. It does not recurse.

List actions return one page. To continue, pass the returned `next_cursor`
unchanged as `cursor` with the same connection, resource, page size, and filters.
Do not decode, edit, or replace it with a Graph URL. Stop at a null cursor.
An empty first page does not establish absence from the entire mailbox.

```json
{
  "label": "find_mail",
  "node_id": "outlook.list_messages",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "folder_id": "inbox",
    "unread_only": true,
    "received_after": "2026-10-01T00:00:00Z",
    "page_size": 25
  },
  "on_error": "stop",
  "index_position": 1
}
```

## Send email and manage drafts

`outlook.send_email` and `outlook.create_draft` share these compose inputs:

| Input | Requirement and default |
|---|---|
| `connection_id` | Required literal connection UUID |
| `to` | Required array of 1–100 valid email addresses |
| `cc`, `bcc` | Optional address arrays, each at most 100; default `[]` |
| `subject` | Required string, at most 998 characters; empty is allowed |
| `body` | Required string, at most 512,000 characters; empty is allowed |
| `body_type` | `text` or `html`; default `text` |
| `workflow_file_ids` | Array of at most 10 Puente file UUIDs; default `[]` |

`outlook.send_email` also accepts `attachments`, default `[]`, using the same
JSON format as Gmail; see [Outbound attachments](#outbound-attachments).
It can combine `workflow_file_ids` and `attachments`; workflow files come first.
`outlook.create_draft` accepts only `workflow_file_ids` for attachments.

Use Outlook's `text` or `html` for `body_type`, not Gmail's `text/plain` or
`text/html`. Do not add `reply_to`. `body_type` does not support expressions.
Workflow files must exist, be unexpired, and belong to the same company and
team. All outbound files remain subject to the size limits below.

Create Draft returns `message`; it does not send. Send Email saves a sent copy
and returns only `{"accepted":true}`. There is no returned sent-message ID.
Acceptance does not prove delivery, reading, or opening. See Microsoft's
[sendMail response contract](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0#response).

`outlook.update_draft` requires `connection_id`, `message_id`, and at least one
non-null change among `to`, `cc`, `bcc`, `subject`, and `body`. These fields use
the compose limits; `to` cannot be empty. Omitted or null fields remain unchanged;
`cc: []` and `bcc: []` clear those recipient lists. `body_type` defaults to `text`
and applies when `body` changes. A `body_type` change alone is invalid. This
action cannot change attachments and rejects a message that is not a draft.
It returns the updated `message`.

`outlook.send_draft` requires `connection_id` and the draft's `message_id`.
It rejects non-drafts and returns only `{"accepted":true}`. It sends the files
already attached to that draft; it does not accept an `attachments` input.

```json
{
  "label": "prepare_message",
  "node_id": "outlook.create_draft",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "to": ["customer@example.com"],
    "subject": "Your report",
    "body": "The report is attached.",
    "body_type": "text",
    "workflow_file_ids": ["{{download_report_2.workflow_file.file_id}}"]
  },
  "on_error": "stop",
  "index_position": 3
}
```

For a later Send Draft node, set `message_id` to
`{{prepare_message_3.message.message_id}}` and connect the nodes with an edge.
This is an authoring example, not authorization to send an email.

## Outbound attachments

`outlook.send_email`, `outlook.reply_email`, and `outlook.create_reply_draft`
accept an optional `attachments` array, default `[]`. Each item requires `name`
(a safe filename, 1–255 characters) and `attachment`. Use either:

- A public HTTPS file URL that the backend can fetch without custom headers or
  authentication. Do not use a private-network URL or the protected Puente
  `workflow_file.file_url` route.
- An object with raw `base64` and `mime_type`. Optional `filename` and
  `size_bytes` describe that content; they do not override size validation.
  Do not include a `data:` prefix. The MIME type must match the actual file.

```json
[
  {"name": "report.pdf", "attachment": "https://files.example.com/report.pdf"},
  {
    "name": "note.txt",
    "attachment": {
      "base64": "SGVsbG8=",
      "mime_type": "text/plain",
      "filename": "note.txt",
      "size_bytes": 5
    }
  }
]
```

Replace example URLs with real file URLs supplied by the user or earlier nodes.
The `attachments` field supports workflow references, including a reference to
an entire array from a code node. Follow [nodes.md](nodes.md) for context keys.
Use the same input format as Gmail, but keep Outlook's own size limits:

- Each outbound file must be smaller than 3,000,000 bytes.
- The encoded request, including body, attachment metadata, and base64 content,
  must be smaller than 4,000,000 bytes. For reply drafts, the combined body and
  attachments are checked before the draft is created.
- Base64 adds size. Several individually valid files can exceed the total.

Large-file upload sessions are not supported. Create Reply Draft has the same
limits; it does not provide a large-file upload path. Do not copy `attachments`
into Create Draft, Update Draft, Forward Email, or Send Draft; those actions do
not accept that field.

## Reply in the original thread

Choose the action from the user's requested result:

| Result | Node | Output |
|---|---|---|
| Send a reply immediately, with optional attachments | `outlook.reply_email` | `{"accepted":true}` |
| Leave an unsent reply in the original thread, with optional attachments | `outlook.create_reply_draft` | `message`, including the draft's `message_id` and `conversation_id` |
| Send a previously prepared draft with its existing attachments | `outlook.send_draft` | `{"accepted":true}` |

Reply Email and Create Reply Draft require `connection_id`, the original
`message_id`, and `body` (1–512,000 characters). Both accept `body_type`
(`text` or `html`, default `text`), `reply_mode` (`sender` or `all`, default
`sender`), and `attachments`. The two dropdown fields do not support
expressions. `reply_mode: "all"` replies to all original recipients.

Use a message ID from the selected Outlook mailbox, such as a Get Message or
New Email output. Do not replace it with a Gmail thread ID, `conversation_id`,
or internet `Message-ID`. These reply actions preserve the original Outlook
thread. Create Draft composes a new message and is not a substitute for Create
Reply Draft.

```json
{
  "label": "prepare_reply",
  "node_id": "outlook.create_reply_draft",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "message_id": "{{read_message_1.message.message_id}}",
    "body": "The report is attached.",
    "body_type": "text",
    "reply_mode": "sender",
    "attachments": [
      {"name": "report.pdf", "attachment": "https://files.example.com/report.pdf"}
    ]
  },
  "on_error": "stop",
  "index_position": 3
}
```

This example leaves the reply unsent (`message.is_draft: true`). For an
immediate reply, use `outlook.reply_email` with the same inputs and expect only
`accepted`, not a `message` result. Do not add a Send Draft node after it.

For a later send after Create Reply Draft, add `outlook.send_draft` with the
same literal connection UUID and `message_id` set to
`{{prepare_reply_3.message.message_id}}`. Connect `prepare_reply_3` to that
node using the edge format in [nodes.md](nodes.md). This sends in the original
thread with the files already attached. Without a separate review or wait
mechanism, adjacent draft and send nodes do not provide a human review pause.
Do not add the send node when the user requests only an unsent draft.

## Forward and move

Both actions require `connection_id` and `message_id`.

- `outlook.forward_email` also requires `to` (1–100 valid email addresses).
  Optional `comment` defaults to an empty string and permits at most 512,000
  characters. It sends the forward and returns only `{"accepted":true}`.
- `outlook.move_message` also requires `destination_folder_id`. It moves the
  existing message and returns `message`. Use the selected folder's ID, not
  its display name. `archive` selects the well-known Archive folder.

Confirm the intended recipients or destination before saving a definition
that will send or move mail. Follow the parent skill's save and activation
rules. Do not run these actions through this skill.

## Read and download attachments

`outlook.list_attachments` requires `connection_id` and `message_id`.
Optional `page_size` is 1–100, default `25`; `cursor` defaults to null.
It returns `attachments` and nullable `next_cursor`. Each attachment contains
`attachment_id`, `name`, `mime_type`, `size_bytes`, `is_inline`, nullable
`content_id`, and `attachment_type`. This is metadata, not file content.

`outlook.download_attachment` requires `connection_id`, `message_id`, and
`attachment_id` from that message. It supports only Graph file attachments
(`attachment_type: "#microsoft.graph.fileAttachment"`), not item or reference
attachments. It enforces the environment's workflow-file size limit, at most
100 MiB. It returns `attachment` metadata and `workflow_file` with `file_id`,
`file_url`, `filename`, `mime_type`, `size_bytes`, and `expires_at`.

The file is temporary and scoped to company and team. Use its `file_id` in
`workflow_file_ids` before expiry. The smaller outbound attachment limit still
applies. `file_url` is a protected Puente route that requires a bearer session;
it is not an anonymous link and this Studio-key skill cannot fetch it.

```json
{
  "label": "download_report",
  "node_id": "outlook.download_attachment",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "message_id": "{{read_message.message.message_id}}",
    "attachment_id": "{{list_files.attachments[0].attachment_id}}"
  },
  "on_error": "stop",
  "index_position": 2
}
```

Select a matching attachment and check that the list is non-empty before using
an array index. Examples are node fragments; use [api.md](api.md) and
[nodes.md](nodes.md) for complete definitions, edges, and context keys.

## New email trigger

Use `outlook.new_email` only when both live catalogs expose it. Its only input
is a literal `connection_id`; its output is `message`, so a downstream action
can use `{{new_mail.message.message_id}}` for a trigger labeled `new_mail`.
It monitors new Inbox mail. Do not add folder, search, polling interval, or
historical-import inputs. A definition can contain at most one Outlook
new-email trigger.

Saving a definition with this trigger can create or renew a Microsoft Graph
subscription and initialize mailbox tracking, even while the workflow is a
draft. Explain this provider-side effect before the parent skill's required
save confirmation. Active workflows can execute automatically when mail
arrives; obtain the parent's separate activation confirmation. Drafts do not
enable workflow delivery. Do not promise historical Inbox replay.

The backend manages subscriptions and renewal. Do not create Graph webhooks,
call internal trigger routes, or configure provider infrastructure. The
JWT-only `/integrations/outlook/trigger-status` route is not a Studio-key
operation. If saving returns `outlook_trigger_not_configured`, stop and report
that the target environment requires operator configuration.

## Recover from errors

Preserve HTTP status and returned detail. Read [errors.md](errors.md) and
[troubleshooting.md](troubleshooting.md) for workflow error envelopes.

- `integration_unavailable`: report the target environment and integration;
  account authorization alone may not resolve configuration.
- `needs_reauth`, `not_accessible`, or `outlook_reconnect_required`: return to
  connection selection and verification. Do not replace or disconnect silently.
- `invalid_reference`: check the resource ID, matching mailbox, cursor, and
  resolved expression. Do not substitute an Outlook web URL.
- `resource_unavailable`: confirm that the message, attachment, or folder still
  exists and belongs to the selected mailbox.
- `file_not_found`: check the Puente file's company, team, and expiry.
- `unsupported_file_type`, `file_too_large`, or `input_too_large`: check the
  attachment type and the separate download and outbound limits above.
- A reply-preparation failure can report that a draft was created and left
  unsent, with its message ID. It may have an incomplete body or attachments.
  Preserve that ID and ask the user to inspect the draft before retrying or
  sending it; do not create another draft automatically.
- `rate_limited`: preserve retry information and let the user choose when to
  retry. This skill cannot run the node.
- `outcome_unknown`: Microsoft may already have accepted the operation. Stop;
  ask the user to inspect the mailbox before any retry. Do not automatically
  repeat sends, replies, forwards, draft changes, or moves after an uncertain
  result, including a timeout or interrupted response.
