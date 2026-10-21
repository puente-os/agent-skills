# Google Ads workflow actions

## Contents

- Discover the live contract
- Connect a Google Ads account
- Shared inputs and campaign output
- Get a campaign
- Get campaign metrics
- Use outputs in later nodes
- Recover from errors

## Discover the live contract

Before saving a Google Ads node, call authenticated `GET /workflows/integrations`
and read public `GET /openapi.json` from the configured `BASE_URL`. Require the
exact `node_id` in both the selectable catalog and the top-level
`x-puente-integration-actions` object. Read its `input_schema`, `output_schema`,
and `vue_input_schema`, plus `components.schemas.WorkflowNode` and
`components.schemas.ScenarioCreate`. Use the current contract if it differs
from this reference. Inputs reject extra properties.

| Node ID | Display name | Changes Google Ads state | Manual execution allowed |
|---|---|---|---|
| `google_ads.get_campaign` | Get Campaign | No | Yes |
| `google_ads.get_campaign_metrics` | Get Campaign Metrics | No | Yes |

Both actions read data. Puente does not expose campaign creation, editing,
activation, budget changes, billing, or a raw query input through these nodes.
Do not invent account-list or campaign-browser endpoints. Ask for the intended
customer ID, campaign ID when needed, and manager customer ID when applicable.
Do not add a provider API version to the node ID or invent a version input.

Manual-execution metadata does not authorize this management skill to run a
node or workflow. Use the skill for discovery, connections, and saved
definitions. Do not call execution endpoints or the Google Ads API directly.
Follow the parent skill's save-effects and activation rules.

## Connect a Google Ads account

Follow [integrations.md](integrations.md) for account selection and authorization.
Use provider `google-ads` explicitly on every shared connection route.
A connection for another Google service is not a Google Ads connection.

| Operation | Method and path |
|---|---|
| List connections | `GET /studio/integrations/connections?provider=google-ads` |
| Read a connection | `GET /studio/integrations/connections/{connection_id}?provider=google-ads` |
| Verify a connection | `POST /studio/integrations/connections/{connection_id}/verify?provider=google-ads` |
| Disconnect, only when requested | `DELETE /studio/integrations/connections/{connection_id}?provider=google-ads` |

Authenticate with `X-API-Key: <STUDIO_KEY>`. Omit `equipo_id`; the key supplies
the company and team. The list response contains `data`, an array of public
connection records. After account selection, read the connection and verify it
with JSON `{}`. Continue only when the returned public `status` is `active`.

Verification checks the provider connection and Google account identity.
It does not read an Ads campaign or prove access to a customer account.
The connected Google account must have access to the intended Ads customer,
directly or through the selected manager. An active connection does not prove
Google OAuth scope verification approval.

Only after the user chooses a new connection, call:

```http
POST /studio/integrations/google-ads/connect-link
X-API-Key: <STUDIO_KEY>
Content-Type: application/json

{"display_name":"Marketing Ads"}
```

The body is optional. `display_name` is an optional label of at most 120
characters. The response contains `connection_id`, `connect_link`, and
`expires_at`. Show the short-lived link, wait for the user to complete Google
authorization and reply, then read and verify that connection. Link creation
alone does not make it ready. A requested disconnect returns `204 No Content`.

Authorization requests Google's `https://www.googleapis.com/auth/adwords`
scope plus account identity scopes. The Google Ads scope can permit Ads changes,
although these two Puente actions only read data. Explain this scope before
new authorization. Do not ask an external Studio user for developer tokens,
Google access tokens, Nango credentials, OAuth secrets, or backend access.
Do not use JWT-only `/integrations/...` routes with a Studio key.

## Shared inputs and campaign output

| Input | Requirement |
|---|---|
| `connection_id` | Required literal Puente connection UUID from connection discovery; no workflow expression |
| `customer_id` | Required string of exactly 10 digits, without hyphens; identifies the Ads customer to query |
| `login_customer_id` | Optional manager customer ID, exactly 10 digits without hyphens; default null |

Keep IDs as strings, including leading zeros. `customer_id` is the target
account; `login_customer_id` supplies manager access context and does not
replace it. Omit an unused manager ID or use null. Do not send an empty string.

Campaign IDs are strings of 1–20 digits whose first digit is nonzero. Use the
campaign ID, not an Ads URL or `customers/.../campaigns/...` resource name.
All action inputs except `connection_id` support workflow references when
their live field metadata sets `supports_references: true`.

Both outputs contain a normalized campaign object:

| Field | Meaning |
|---|---|
| `resource_name` | Google resource name, such as `customers/1234567890/campaigns/123456789` |
| `id` | Campaign ID string |
| `name` | Campaign name |
| `status` | Provider status, such as `PAUSED` or `ENABLED` |
| `advertising_channel_type` | Provider channel, such as `SEARCH` |
| `bidding_strategy_type` | Provider bidding strategy string, or null |

Use these snake_case output names in references, not Google's camelCase names.

## Get a campaign

`google_ads.get_campaign` requires `connection_id`, `customer_id`, and
`campaign_id`. It also accepts optional `login_customer_id`.
It returns `customer_id` and one `campaign` object. A missing campaign is an
error, not a successful empty object.

This node fragment uses illustrative identifiers. Replace them with the
selected connection and resources before saving.

```json
{
  "label": "read_campaign",
  "node_id": "google_ads.get_campaign",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "customer_id": "1234567890",
    "login_customer_id": "9876543210",
    "campaign_id": "123456789"
  },
  "on_error": "stop",
  "index_position": 1
}
```

## Get campaign metrics

`google_ads.get_campaign_metrics` requires `connection_id`, `customer_id`,
`start_date`, and `end_date`. It also accepts optional `login_customer_id`.

| Additional input | Requirement and default |
|---|---|
| `start_date` | Required valid date in `YYYY-MM-DD` format; inclusive |
| `end_date` | Required valid date in `YYYY-MM-DD` format; inclusive; must not precede start date |
| `campaign_id` | Optional campaign ID string; default null |
| `page_token` | Optional continuation string of 1–8,192 characters; default null |

Omit unused optional fields or send null. Do not send empty strings or relative
date literals such as `yesterday`. Without `campaign_id`, the action reports
campaigns for the selected customer. It excludes campaigns with status
`REMOVED`. Results aggregate the requested date range per campaign; this is
not a daily breakdown. The six metrics are fixed, so do not add `metrics`,
`query`, `segments`, or `page_size` inputs.

The output contains `customer_id`, `start_date`, `end_date`, `rows`, and
nullable `next_page_token`. Each row contains `campaign` and `metrics`.

| Metric | Type and unit |
|---|---|
| `impressions` | Non-negative integer impression count |
| `clicks` | Non-negative integer click count |
| `cost_micros` | Integer total cost in micros of the customer account currency |
| `conversions` | Number; can have a fractional value |
| `ctr` | Number; clicks divided by impressions, expressed as a ratio |
| `average_cpc` | Number; average cost per click in micros of the customer account currency |

Divide cost values by 1,000,000 to express them in account currency units.
Multiply `ctr` by 100 to express it as a percentage. Do not assume USD or CLP;
this output does not contain a currency code.

The action returns one page, with at most 10,000 rows. For a later page, pass
`next_page_token` as `page_token` and preserve the connection, customer,
manager, dates, and campaign filter. Stop when `next_page_token` is null.
Do not infer a complete result from the first page when a token remains.
This describes saved workflow pagination, not permission to execute it here.

`rows: []` is a valid empty result. A row with six zero metrics can also be
valid, for example for a campaign with no activity in the selected period.
Neither result proves that ads are serving. Do not activate campaigns or change
budgets to create test data.

## Use outputs in later nodes

Follow [nodes.md](nodes.md) for context keys. With label `read_campaign` and
`index_position: 1`, the key is `read_campaign_1`. The metrics node can use
the first action's customer and campaign IDs:

```json
{
  "label": "campaign_metrics",
  "node_id": "google_ads.get_campaign_metrics",
  "inputs": {
    "connection_id": "11111111-1111-4111-8111-111111111111",
    "customer_id": "{{read_campaign_1.customer_id}}",
    "login_customer_id": "9876543210",
    "campaign_id": "{{read_campaign_1.campaign.id}}",
    "start_date": "2026-10-01",
    "end_date": "2026-10-21",
    "page_token": null
  },
  "on_error": "stop",
  "index_position": 2
}
```

Connect these fragments with an edge whose `source` is `read_campaign_1` and
`target` is `campaign_metrics_2`. Use [api.md](api.md) and [nodes.md](nodes.md)
for a complete definition. Check that `rows` is nonempty before a reference
such as `{{campaign_metrics_2.rows[0].metrics.clicks}}`. Use
`{{campaign_metrics_2.next_page_token}}` only for a later page while it is
non-null. A history display of `[REDACTED]` is not a provider page token;
do not copy it into an input.

## Recover from errors

Preserve the returned status and public error detail. Read [errors.md](errors.md)
and [troubleshooting.md](troubleshooting.md) for workflow error envelopes.

| Code | User action |
|---|---|
| `invalid_input` | Check string IDs, date order, optional nulls, page token, and absence of extra inputs |
| `needs_reauth` | Offer the documented authorization flow after the user chooses it |
| `not_accessible` | Check the selected connection, customer ID, manager context, and Google account access |
| `resource_unavailable` | Check the campaign ID and its customer account |
| `rate_limited` | Report the limit and wait before a user-controlled retry |
| `unavailable` | Report provider or environment unavailability; account authorization alone might not resolve it |
| `invalid_data` | Report the invalid provider result; do not invent campaign data or metrics |

Do not replace or disconnect a connection after a failed read without an
explicit request. Environment setup and Google verification problems belong
with Puente support, not with an external user's credentials or cloud setup.
