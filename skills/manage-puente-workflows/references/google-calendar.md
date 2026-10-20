# Google Calendar workflow actions

## Contents

- Discover the live contract
- Connect a Google Calendar account
- Select the calendar and event
- Search events
- Create an event
- Update the title or guests
- Read event output
- Recover from errors

## Discover the live contract

Call authenticated `GET /workflows/integrations` before you prepare a Calendar node.
Read public `GET /openapi.json` from the configured `BASE_URL`.
Check the exact `node_id` in both the selectable catalog and `x-puente-integration-actions`.
Read its `input_schema`, `output_schema`, and `vue_input_schema`.
Read `components.schemas.WorkflowNode` and `components.schemas.ScenarioCreate` for the complete definition.

Use the live contract if it differs from this reference.
Backend source and account authorization do not prove deployment or availability.

| Node ID | Changes calendar state | Manual execution allowed |
|---|---|---|
| `google_calendar.search_events` | No | Yes |
| `google_calendar.create_event` | Yes | No |
| `google_calendar.update_event` | Yes | No |

These flags do not authorize this management skill to run nodes or workflows.
Prepare definitions under the parent skill's save and activation rules.
Do not bypass execution limits with a code node or direct Google API request.

The current integration has no delete, get-event, list-calendars, free/busy, or Calendar event trigger action.
Do not add recurrence, conference, reminder, attachment, or provider version inputs.
Google API v3 does not add `/v3` to saved node IDs.
Top-level inputs and event time objects reject extra properties.

## Connect a Google Calendar account

Use [integrations.md](integrations.md) for account selection and authorization.
Use provider `google-calendar` on shared connection routes.
A Gmail, Sheets, or Drive connection does not replace a Calendar connection.

| Operation | Method and path |
|---|---|
| List connections | `GET /studio/integrations/connections?provider=google-calendar` |
| Read a connection | `GET /studio/integrations/connections/{connection_id}?provider=google-calendar` |
| Verify a connection | `POST /studio/integrations/connections/{connection_id}/verify?provider=google-calendar` |
| Disconnect, only when requested | `DELETE /studio/integrations/connections/{connection_id}?provider=google-calendar` |

Authenticate each request with `X-API-Key: <STUDIO_KEY>`.
The Studio key supplies company and team scope; do not send `equipo_id`.
The list response contains `data`, an array of public connection records.
Read the selected connection, then verify it with JSON `{}`.
Verification reads one event page from the primary calendar and updates the public status.
Continue only when `status` is `active`.
This check does not prove write permission or access to another calendar.

Create a link only after the user chooses a new connection:

```http
POST /studio/integrations/google-calendar/connect-link
X-API-Key: <STUDIO_KEY>
Content-Type: application/json

{"display_name":"Team Calendar"}
```

The body is optional.
The optional `display_name` has a limit of 120 characters.
The response contains `connection_id`, `connect_link`, and `expires_at`.
Show the short-lived link and ask the user to complete Google authorization.
Wait for the user's reply, then read and verify that connection.
Do not poll while the user completes authorization.
Link creation alone does not establish an active connection.
A requested disconnect returns `204 No Content`.

Use only these public Studio routes with the Studio key.
Do not use JWT-only `/integrations/...` routes or ask for Google tokens or Nango credentials.
If the integration is unavailable, report the error for Puente support.
External users do not need backend access, migrations, cloud configuration, or provider administration.

## Select the calendar and event

Each action needs a literal Puente `connection_id` in UUID format.
Use the discovered Calendar connection ID, without a workflow expression.
Do not substitute an account email or a provider connection ID.

`calendar_id` defaults to `primary`, the connected account's primary calendar.
Use another calendar ID only when the user supplies that calendar's ID and intends to use it.
Do not substitute a calendar name, event URL, or frontend URL.
This skill has no calendar-browser route.

Update Event also needs `event_id` from the intended calendar.
Use the normalized `event_id` from a search or create result.
Do not use a title, `html_link`, or iCalendar UID as the event ID.
Calendar and event IDs accept 1–2,048 characters, except control characters, `.` and `..`.

Use expressions only where live field metadata sets `supports_references: true`.
`connection_id`, `page_size`, `send_updates`, and `guest_operation` do not support expressions.
Use [nodes.md](nodes.md) for context keys and edges.

## Search events

`google_calendar.search_events` requires only `connection_id`.

| Optional input | Default | Contract |
|---|---|---|
| `calendar_id` | `primary` | Calendar ID |
| `query` | null | Non-empty free text, at most 512 characters |
| `time_min` | null | RFC3339 timestamp with a timezone offset |
| `time_max` | null | RFC3339 timestamp with a timezone offset; later than `time_min` when both exist |
| `page_size` | `25` | Integer from 1 through 100 |
| `cursor` | null | Opaque continuation cursor, at most 24,000 characters |

Search uses free text, not Gmail query syntax or an exact title match.
The backend expands recurring events into instances and orders results by start time.
`time_min` excludes events whose end time is at or before that value.
`time_max` excludes events whose start time is at or after that value.
Thus, results can include events that start before `time_min` and overlap the requested interval.
See Google's [event list contract](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).

The result contains `events` and nullable `next_cursor`.
Each call returns one page.
Pass `next_cursor` unchanged as the next `cursor`.
Keep the same connection, calendar, filters, and page size.
Do not decode the cursor or substitute a Google page token or URL.
Stop at a null cursor or the user's requested result limit.
An empty page with a continuation cursor does not prove that the full search has no matches.

```json
{
  "label": "find_events",
  "node_id": "google_calendar.search_events",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "calendar_id": "primary",
    "query": "Project review",
    "time_min": "2026-10-21T00:00:00-03:00",
    "time_max": "2026-10-22T00:00:00-03:00",
    "page_size": 25
  },
  "on_error": "stop",
  "index_position": 1
}
```

Select the intended event before an update.
Do not use `events[0]` without a non-empty result and an unambiguous match.

## Create an event

`google_calendar.create_event` requires `connection_id`, `title`, `start`, and `end`.

| Input | Requirement or default |
|---|---|
| `calendar_id` | Optional; default `primary` |
| `title` | Required; 1–4,096 characters |
| `start`, `end` | Required event time objects; use the same time format |
| `description` | Optional; null by default; at most 512,000 characters |
| `location` | Optional; null by default; at most 4,096 characters |
| `attendees` | Optional array of valid email strings; default `[]`; at most 200 entries |
| `send_updates` | `all`, `externalOnly`, or `none`; default `all` |

Each time object has exactly one non-null `date` or `date_time`.
For timed events, use `date_time` with a timezone offset.
The optional `time_zone` must be a valid IANA name, such as `America/Santiago`.
The aliases `dateTime` and `timeZone` are also accepted for time inputs.
Use the normalized snake_case names in workflow examples and output references.
Do not mix date-only and timed values between `start` and `end`.
The end must follow the start, with timed values compared in UTC.

For an all-day event on 21 October, use `start: {"date":"2026-10-21"}` and `end: {"date":"2026-10-22"}`.
The end date is exclusive; it is not the last included day.

```json
{
  "label": "create_review",
  "node_id": "google_calendar.create_event",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "calendar_id": "primary",
    "title": "Project review",
    "start": {"date_time":"2026-10-21T10:00:00-03:00", "time_zone":"America/Santiago"},
    "end": {"date_time":"2026-10-21T10:30:00-03:00", "time_zone":"America/Santiago"},
    "attendees": ["customer@example.com"],
    "send_updates": "all"
  },
  "on_error": "stop",
  "index_position": 2
}
```

Create returns `event`; it does not prove that guests received or accepted an invitation.
Before a save, establish the intended calendar, local date, timezone, guests, and notification choice.
Follow the parent skill's confirmation rules for the workflow save and activation.
This example does not authorize a live calendar change.

## Update the title or guests

`google_calendar.update_event` requires `connection_id` and `event_id`.
`calendar_id` defaults to `primary`; `send_updates` defaults to `all`.
The optional `title` accepts 1–4,096 characters.
Omitted or null `title` leaves the title unchanged.

| `guest_operation` | `attendees` input | Effect |
|---|---|---|
| `keep` (default) | Omit or null | Preserve guests; a non-null title is necessary |
| `add` | Non-empty email array | Add absent guests; preserve existing guests |
| `remove` | Non-empty email array | Remove the listed guests |
| `replace` | Email array; `[]` is valid | Replace the guest list; `[]` removes all guests |

The input guest array accepts at most 200 valid email strings.
Do not send `attendees` with `guest_operation: "keep"`.
Do not send an empty update or an empty array for `add` or `remove`.
Guest email comparison ignores case.
The backend preserves existing attendee metadata for retained guests.

This action cannot change start, end, description, location, recurrence, or conference details.
Do not create a replacement event to simulate an unsupported update without the user's instruction.
For recurring instances, use the selected instance ID; do not substitute `recurring_event_id` to change a series.

Guest changes use the current event and an ETag condition to prevent concurrent overwrites.
A `conflict` stops the change; reassess the latest event before another attempt.

```json
{
  "label": "add_guest",
  "node_id": "google_calendar.update_event",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "calendar_id": "primary",
    "event_id": "{{create_review.event.event_id}}",
    "guest_operation": "add",
    "attendees": ["reviewer@example.com"],
    "send_updates": "all"
  },
  "on_error": "stop",
  "index_position": 3
}
```

Both mutations accept these notification choices:

- `all`: notify all guests.
- `externalOnly`: notify guests who do not use Google Calendar.
- `none`: request no notifications; do not promise silent changes or reliable guest synchronization.

The default can send invitations or update notices when the workflow runs.
Explain this effect before the workflow save.
See Google's [event creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert) and [event update](https://developers.google.com/workspace/calendar/api/v3/reference/events/update) notification contracts.

## Read event output

Search returns `events`; Create Event and Update Event return one nested `event`.
Normalized event fields are `event_id`, `title`, `description`, `location`, `status`, `start`, `end`, `attendees`, `html_link`, `etag`, and `recurring_event_id`.
Some fields are null when Google omits them; `start` and `end` can also be null.
Time objects contain `date`, `date_time`, and `time_zone`.
Attendee objects contain `email`, `display_name`, `response_status`, `organizer`, and `optional`.
Input attendees are email strings; output attendees are objects.

Use `{{create_review.event.event_id}}` for a created event ID.
Use `{{create_review.event.html_link}}` for its Google Calendar link when present.
Do not use Google's raw `id`, `summary`, `htmlLink`, or `dateTime` as normalized output field names.
A successful mutation does not prove email delivery or guest attendance.

These JSON examples are node fragments.
Use [api.md](api.md) and [nodes.md](nodes.md) for complete definitions, edges, and context keys.

## Recover from errors

Preserve the returned HTTP status and error detail.
Use [errors.md](errors.md) and [troubleshooting.md](troubleshooting.md) for workflow error envelopes.

| Error or state | User action |
|---|---|
| `integration_unavailable` | Report that Puente support must check availability in the target environment. |
| `needs_reauth`, `not_accessible` | Return to connection selection and verification; check permission for the intended calendar. |
| `invalid_input`, `invalid_action_input` | Check field names, date formats, time range, guest operation, and email list. |
| `invalid_reference` | Check IDs and cursor inputs; preserve the original search filters. |
| `resource_unavailable` | Check that the event exists in the selected calendar and remains accessible. |
| `conflict` | Stop; ask the user to inspect the current event before another update. |
| `invalid_data`, `result_too_large` | Preserve the detail and report the failure; do not use partial data for a guest change. |
| `rate_limited`, `unavailable` | Preserve retry information; this skill cannot run or retry the node. |
| `outcome_unknown` | Stop; ask the user to inspect Google Calendar before any retry. |

A timeout, interrupted mutation response, or invalid mutation result can leave an unknown outcome.
Google may already have created or changed the event.
Do not automatically repeat Create Event or Update Event after such a result.
Do not disconnect or replace an account to resolve an uncertain mutation.
