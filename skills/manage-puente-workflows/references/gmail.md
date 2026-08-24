# Gmail workflow actions

## Contents

- Discover the live contract
- Gmail connection behavior
- Editor behavior
- Shared input rules
- Normalized message output
- Send email
- Find email
- Get attachment
- Create draft
- Get sent message

## Discover the live contract

Do not treat this reference as an authoritative action registry. Before saving a Gmail node:

1. Call authenticated `GET /workflows/integrations`. This is the saved/selectable node catalog and its editor input schema.
2. Read public `GET /openapi.json`, including `components.schemas.WorkflowNode`, `components.schemas.ScenarioCreate`, and the top-level `x-puente-integration-actions[node_id]` entry.
3. Require the exact same `node_id` in both surfaces. Do not save a node that appears only in one.
4. Build `inputs` from the current action contract. Gmail input models reject additional properties, including extra properties in an attachment object.

The OpenAPI action entry supplies `action_name`, `mutates`, `manual_execution_allowed`, `input_schema`, `output_schema`, and `vue_input_schema`. `mutates` means the action writes Gmail state. `manual_execution_allowed` means the editor may run that node standalone; it does not authorize this management skill to call execution, trigger, webhook, schedule, or other non-public endpoints.

The production schema can be cross-checked at `https://api.puente.xyz/openapi.json`. The authenticated integrations catalog still controls which nodes are currently selectable for the Studio key's environment.

## Gmail connection behavior

First follow the shared discovery, selection, readiness, and authorization flow
in [integrations.md](integrations.md). Gmail uses:

- action prefix `gmail.*`;
- connection provider `gmail`;
- `GET /studio/integrations/connections?provider=gmail` to list connections;
- `GET /studio/integrations/connections/{connection_id}?provider=gmail` to read
  one connection;
- `DELETE /studio/integrations/connections/{connection_id}?provider=gmail` to
  disconnect only when requested.

An existing Gmail connection is ready when its public status is `active`. There
is no Gmail variant of the Studio spreadsheet-verification request; do not call
`/verify` for Gmail.

Only after the user chooses a new Gmail connection, create its link:

```http
POST /studio/integrations/gmail/connect-link
X-API-Key: <STUDIO_KEY>
Content-Type: application/json

{"display_name":"Support Gmail"}
```

The body is optional. `display_name` is an optional human-facing label of at
most 120 characters. The response contains:

- `connection_id`: opaque Puente identifier for this team-scoped connection;
- `connect_link`: short-lived authorization URL;
- `expires_at`: time at which that authorization link expires.

After link creation, return to the shared flow in [integrations.md](integrations.md).
A Gmail connection may report `needs_reauth` or `not_accessible`; do not present
either state as ready. A requested disconnect succeeds with `204 No Content`.

## Editor behavior

The Puente workflow editor identifies `gmail.*` nodes as Gmail actions, presents a Gmail connection selector for `connection_id`, and renders the remaining controls from the selected action's current catalog `input_schema`. It does not maintain a second Gmail field list. An active selected connection is required before the editor offers standalone execution.

Catalog fields with `type: "json"`, such as recipients and attachments, are saved as JSON arrays or objects when their entered value is valid JSON. A complete workflow reference is preserved for runtime resolution instead of being parsed as JSON. When an optional field is left blank and the catalog publishes a default, the editor saves that default; this turns untouched `cc`, `bcc`, and `attachments` into `[]` and `reply_to` into `null` for the current compose contract.

The editor also applies catalog presentation constraints such as dropdown options, string maximum lengths, and integer minimums and maximums. Runtime validation still comes from the OpenAPI action `input_schema`; do not infer that an editor control relaxes that contract.

## Shared input rules

All five actions currently have `manual_execution_allowed: true`. Always rediscover this metadata before relying on it.

- `connection_id` is required, must be a non-empty string, and does not support workflow references.
- A field whose editor metadata says `supports_references: true` may contain a complete workflow reference such as `{{find_mail_1.messages[0].message_id}}`. Use the context-key rules in [nodes.md](nodes.md).
- Input objects reject unknown fields. Use only properties published in the current action `input_schema`.
- `message_id` is a non-empty string of at most 256 characters.

The compose actions, `gmail.send_email` and `gmail.create_draft`, share these fields:

| Field | Required | Public contract |
|---|---:|---|
| `to` | yes | Non-empty array of email-address strings. |
| `cc` | no | Email-address string array; default `[]`. |
| `bcc` | no | Email-address string array; default `[]`. |
| `subject` | yes | Non-empty string, maximum 998 characters. |
| `body` | yes | Non-empty string. |
| `body_type` | no | `text/plain` or `text/html`; default `text/plain`. |
| `reply_to` | no | Email-address string or `null`; default `null`, maximum 998 characters. |
| `attachments` | no | Attachment-object array; default `[]`, maximum 10 items. |

Recipient and reply-to strings are trimmed. Each must be non-empty, contain `@`, and contain no carriage return or line feed. The public contract does not claim full RFC mailbox parsing.

Each attachment object contains exactly:

| Field | Required | Public contract |
|---|---:|---|
| `name` | yes | Filename, 1–255 characters. It must be a basename, not a path, and cannot contain control characters or be `.` or `..`. |
| `attachment` | yes | Publicly reachable HTTPS URL, maximum 2,083 characters. |

The fetched content must be PDF, ZIP, GIF, JPEG, PNG, or WebP. Redirects are not followed. The detected content type must agree with any meaningful response content type and filename extension. Each attachment and all attachments combined are limited to 20 MiB. Duplicate final filenames are rejected.

These URLs are compose inputs only. Do not put credentials, raw private-storage URLs, or short-lived signed URLs in them.

## Normalized message output

`gmail.find_email` returns an array of normalized messages, and `gmail.get_sent_message` returns one normalized message. Each message has exactly these required fields:

| Field | Type | Meaning |
|---|---|---|
| `message_id` | string | Gmail message identifier. |
| `thread_id` | string | Gmail thread identifier. |
| `label_ids` | string[] | Gmail labels on the message, such as `INBOX` or `SENT`. |
| `snippet` | string | Gmail's message snippet, or an empty string. |
| `headers` | object of strings | Present normalized headers, keyed in lowercase. |
| `text_body` | string | Decoded plain-text MIME content, or an empty string. |
| `html_body` | string | Decoded HTML MIME content, or an empty string. |
| `attachments` | array | Attachment metadata found throughout the MIME tree. |

`headers` includes only values present for `from`, `to`, `cc`, `bcc`, `subject`, `date`, and `message-id`. It is not the provider's raw header list.

Each attachment metadata object has `attachment_id`, `filename`, `mime_type`, and non-negative `size_bytes`. This is metadata only; use `gmail.get_attachment` to obtain a protected workflow file.

## Send email

`gmail.send_email` writes Gmail state (`mutates: true`). It accepts the shared compose contract above, builds either plain text or HTML email content, fetches any accepted URL attachments, and submits the message for sending.

Example node:

```json
{
  "label": "send_receipt",
  "node_id": "gmail.send_email",
  "inputs": {
    "connection_id": "conn_example_opaque",
    "to": ["customer@example.com"],
    "cc": [],
    "bcc": [],
    "subject": "Your receipt",
    "body": "<p>Thanks for your purchase.</p>",
    "body_type": "text/html",
    "reply_to": "support@example.com",
    "attachments": [
      {
        "name": "receipt.pdf",
        "attachment": "https://files.example.com/receipt.pdf"
      }
    ]
  },
  "on_error": "stop",
  "index_position": 1
}
```

Output fields:

- `message_id`: accepted Gmail message identifier;
- `thread_id`: Gmail thread identifier;
- `label_ids`: labels returned for the accepted message;
- `accepted`: always `true` for a successful action response.

`accepted: true` means the Gmail send request succeeded. It is not proof of inbox delivery, reading, opening, or link activity. Puente does not expose delivery or open tracking through this action.

## Find email

`gmail.find_email` is read-only (`mutates: false`).

Inputs:

- `connection_id` (required): shared opaque connection ID.
- `query` (required): Gmail API search query, 1–500 characters; workflow references are supported.
- `max_results` (optional): integer from 1 through 25; default `10`; workflow references are not supported.

`query` uses Gmail advanced-search syntax similar to the Gmail web search box, for example `from:billing@example.com has:attachment newer_than:30d`. The action searches individual messages, not whole threads. Gmail API search does not perform the Gmail UI's Google Workspace alias expansion or thread-wide matching. Date literals such as `after:2026/08/01` are interpreted from midnight PST; use epoch seconds when an exact timezone boundary matters.

Puente requests the first matching page, then returns normalized full content for at most `max_results` messages. It does not accept a page-token input. A returned `next_page_token` therefore indicates that Gmail reported another page, but this action cannot request that page directly.

Example node:

```json
{
  "label": "find_invoice",
  "node_id": "gmail.find_email",
  "inputs": {
    "connection_id": "conn_example_opaque",
    "query": "from:billing@example.com has:attachment newer_than:30d",
    "max_results": 5
  },
  "on_error": "stop",
  "index_position": 2
}
```

Output fields:

- `messages`: normalized message array described above;
- `next_page_token`: Gmail page token string or `null`; default `null` when absent.

## Get attachment

`gmail.get_attachment` is read-only with respect to Gmail (`mutates: false`). It turns one Gmail attachment into a protected Puente workflow file.

Inputs:

- `connection_id` (required): shared opaque connection ID.
- `message_id` (required): non-empty string, maximum 256 characters; references supported.
- `attachment_id` (required): non-empty opaque string, maximum 2,048 characters; references supported. Use the matching value returned in normalized message attachment metadata.

Example node using `gmail.find_email` output:

```json
{
  "label": "download_invoice",
  "node_id": "gmail.get_attachment",
  "inputs": {
    "connection_id": "conn_example_opaque",
    "message_id": "{{find_invoice_2.messages[0].message_id}}",
    "attachment_id": "{{find_invoice_2.messages[0].attachments[0].attachment_id}}"
  },
  "on_error": "stop",
  "index_position": 3
}
```

Output fields:

- `file_id`: opaque Puente workflow-file identifier;
- `file_url`: absolute authenticated Puente URL for that workflow file;
- `filename`: normalized attachment filename;
- `mime_type`: attachment media type;
- `size_bytes`: downloaded byte count, from 0 through 20 MiB.

`file_url` points to the protected `/workflow-files/{file_id}` API surface. Fetching it requires an authorized bearer session according to public OpenAPI. Treat it as an authenticated application URL: do not convert it to, request, or expose a raw storage URL or signed storage URL.

## Create draft

`gmail.create_draft` writes Gmail state (`mutates: true`) but does not send the message. It accepts exactly the same compose inputs, defaults, attachment rules, and limits as `gmail.send_email`.

Output fields:

- `draft_id`: Gmail draft identifier;
- `message_id`: identifier of the message inside the draft;
- `thread_id`: Gmail thread identifier.

A successful result confirms draft creation only. Sending, delivery, and opening are separate events and are not reported by this action.

## Get sent message

`gmail.get_sent_message` is read-only (`mutates: false`). It retrieves one full message and returns the normalized message output described above only when Gmail reports the `SENT` label.

Inputs:

- `connection_id` (required): shared opaque connection ID.
- `message_id` (required): non-empty string, maximum 256 characters; references supported. A typical value is `{{send_receipt_1.message_id}}`.

If the message does not have `SENT` in `label_ids`, the action fails instead of returning it as sent. A successful result is mailbox-state verification that Gmail labels that message as sent; it is not delivery, read, open, or engagement verification.

Output fields are the normalized message fields: `message_id`, `thread_id`, `label_ids`, `snippet`, `headers`, `text_body`, `html_body`, and `attachments`.
