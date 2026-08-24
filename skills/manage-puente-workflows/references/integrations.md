# Puente workflow integrations

Use this reference before configuring a connection-backed workflow node. It is
the index of supported integrations and the single source of truth for the
shared connection lifecycle. After selecting a provider, read only that
provider's reference for its endpoints, verification rules, and node contracts.

## Contents

- Supported integrations
- Authentication and scope
- Public connection record
- Connection-first interaction
- Reuse an existing connection
- Create a new connection
- Disconnect
- Add another integration

## Supported integrations

| Integration | Action prefix | Connection provider | Ready condition | Provider reference |
|---|---|---|---|---|
| Gmail | `gmail.*` | `gmail` | Public status is `active` | [gmail.md](gmail.md) |
| Google Sheets | `google_sheets.*` | `google-sheets` | Public status is `active`, then spreadsheet access succeeds | [google-sheets.md](google-sheets.md) |

Do not infer a connection provider or route from an action prefix. A provider
must be documented here and in its provider reference before this skill uses
its connection endpoints. This index does not override live availability:
require each requested node in authenticated `GET /workflows/integrations` and
the public OpenAPI action catalog before saving it.

## Authentication and scope

Use `X-API-Key: <STUDIO_KEY>` for every documented connection request. The
Studio key supplies company, team, and user identity. Never put it in a
published application, a URL, or a report, and never send or infer another
`equipo_id`.

Connection records and identifiers are scoped to the Studio key's team.
`connection_id` is an opaque Puente identifier, not an account email, provider
token, provider connection ID, or workflow reference. Never expose underlying
provider credentials or private identifiers.

## Public connection record

The documented connection list and read operations return public records with:

- `connection_id`: opaque identifier placed literally in a workflow node;
- `provider`: documented connection provider;
- `display_name`: human-facing connection label;
- `provider_identity`: connected account email when available, otherwise
  `null`;
- `status`: public readiness state;
- `team_id`;
- `created_at`;
- `updated_at`.

Use only these public fields. Do not request or derive hidden provider data.

## Connection-first interaction

Before creating an authorization link:

1. Call the selected provider's documented connection-list route.
2. Keep only records whose public `status` is exactly `active`.
3. Present each ready connection as `<display_name> — <provider_identity>`.
4. If `provider_identity` is `null`, show only `display_name`; never invent an
   email.
5. Number the choices when useful and retain each opaque `connection_id` behind
   its displayed choice.
6. Ask whether the user wants an existing connection or a new one.
7. Create an authorization link only after the user chooses a new connection;
   never create one preemptively.

Do not present `needs_reauth` or `not_accessible` connections as ready. Report
their state separately when useful. If there are no active connections, say so
and offer the selected provider's new-connection flow.

## Reuse an existing connection

After the user selects a connection:

1. Read it again through the provider's documented connection-read route.
2. Continue only while its public status remains `active`.
3. Apply any additional provider verification from its reference.
4. Save its opaque `connection_id` literally in the integration node; it does
   not support workflow-value interpolation.

## Create a new connection

After the user explicitly chooses a new connection:

1. Ask for an optional human-facing `display_name` when useful.
2. Call the provider's documented connect-link endpoint once.
3. Show the returned short-lived `connect_link` without logging it.
4. Ask the user to complete authorization and reply when finished.
5. Do not poll or change a workflow while waiting.
6. Read the returned `connection_id` after the user replies.
7. Continue only when its public status is `active` and any provider-specific
   verification succeeds.

Link creation alone does not establish a usable connection. Do not create
another link automatically after an interrupted request.

## Disconnect

Disconnect only when the user explicitly requests it. Use the selected
provider's documented route. A failed verification or workflow action does not
authorize disconnection or replacement.

## Add another integration

Before adding another provider to this index:

1. Confirm its public provider name and Studio connection routes.
2. Document its public connection response and readiness states.
3. Define any provider-specific verification.
4. Add its action prefix and provider reference to the table above.
5. Confirm every documented node through the authenticated integration catalog
   and public OpenAPI action contract.
6. Add focused checks for existing-connection reuse and new authorization.

Never invent provider names, routes, response fields, or readiness semantics.
