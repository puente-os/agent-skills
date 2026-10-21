# Facebook Lead Ads: New Lead

## Discover availability

Authenticate supported requests with `X-API-Key: <STUDIO_KEY>`. The key sets
company, team, and user. Omit `equipo_id`; these routes reject it. Keep the key
in the agent's configuration. Do not place it in a published frontend.

Before use, read `GET /openapi.json` from the configured `BASE_URL`. Require
the Studio routes below and `facebook_lead_ads.new_lead` in authenticated
`GET /workflows/integrations` and `x-puente-integration-actions`. Inspect its
input and output schemas. If any required route or node is absent, report
that Facebook Lead Ads is unavailable in this environment. Local tests and
an OAuth connection do not prove production availability.

## Select app, account, Page, and Forms

Use this order for Facebook instead of the shared connection-first flow.
The base path below is `/studio/integrations/facebook-lead-ads`.

| Operation | Method and path |
|---|---|
| List permitted Meta apps | `GET /apps` |
| List one app's accounts | `GET /apps/{app_key}/connections` |
| Create an authorization link | `POST /connect-link` |
| Browse Pages | `GET /pages?connection_id={connection_id}` |
| Browse Forms on a Page | `GET /forms?connection_id={connection_id}&page_id={page_id}` |
| Verify a connection | `POST /connections/{connection_id}/verify` |

1. List apps and present their `name` values. Retain the corresponding `key`
   as `app_key`. This lists apps configured for this team, not all apps in the
   user's Meta developer account. Do not request Meta App Secrets or create
   apps or provider configurations through this skill.
2. After app selection, list that app's accounts. The response is
   `{"data":[<public connection records>]}`. Offer `active` accounts by
   `display_name` and `provider_identity` when present. Never choose an account
   from another app. Changing the app clears the account, Page, and Forms.
3. Reuse the selected account. Verify it and continue only with public status
   `active`. Verification probes Page access; it does not prove lead access
   for every Page or Form.
4. Only if the user chooses a new account, create one link with JSON
   `{"app_key":"<selected key>","display_name":"<optional label>"}`.
   `app_key` is required; `display_name` is optional and has at most 120
   characters. The response has `connection_id`, `connect_link`, and
   `expires_at`. Show the short-lived link, wait for the user to authorize and
   reply, then reload that app's accounts and verify the new connection.
   Link creation alone is not authorization. Do not poll while waiting.
5. List Pages for that connection. Page and Form lists return
   `{"data":[{"id":"123","name":"Name"}],"next_cursor":null}`.
   For more results, pass the returned `next_cursor` as `cursor` with the same
   account and Page filters. Keep Meta IDs as strings.
6. If a known Page is absent, call `/pages` with `include_page_id=<Page ID>`
   as well as `connection_id`. Use only an ID supplied by the user or from an
   authorized source. This performs an access check; it does not grant access.
   Do not claim the first Page list is complete.
7. After Page selection, list its Forms. Changing the account clears the Page
   and Forms; changing the Page clears the Forms. Select only Forms from that
   Page. Explain that an empty Form selection means **all Forms on that Page**.

The shared `GET /studio/integrations/connections?provider=facebook-lead-ads`
can list team connections, but it does not replace app-specific discovery.
Use the Facebook verification route above. Shared connection read, verify,
and disconnect routes are not supported for Facebook by this reference.

## Save the New Lead trigger

The node ID is `facebook_lead_ads.new_lead`. Its inputs are:

```json
{
  "connection_id": "<Puente connection UUID>",
  "page_id": "<selected Page ID>",
  "form_ids": ["<selected Form ID>"]
}
```

These are literal values; workflow expressions are not supported. Do not put
`app_key` in node inputs: the selected connection fixes the app. `form_ids`
defaults to `[]`, means all Forms on the selected Page, and accepts at most
100 IDs. Preserve the full workflow definition as described in [api.md](api.md)
and [nodes.md](nodes.md). Save a draft by default.

Before a create or version write, disclose and obtain confirmation for the
normal Puente webhook metadata effects and the Facebook Page subscription:
saving this trigger can add the app's `leadgen` subscription even for a draft.
Existing subscriptions are preserved. Activating requires separate explicit
confirmation and enables automatic execution for matching new leads. This
skill does not submit test leads or call execution, Meta webhook, or run routes.

The trigger matches the selected app, account, Page, and optional Form IDs.
Its normalized output is `lead`, containing `id`, `page_id`, `form_id`,
`created_time`, nullable `ad_id`, and `field_data`. Each field has `name` and
`values` (a list of strings). Use the node context key, for example
`{{new_lead.lead.id}}`. Lead values can contain personal data; do not print
unneeded values in reports.

Deactivation stops new dispatches for this workflow. Subscription cleanup can
have a five-minute preparation grace period and removes only subscriptions
owned by Puente when no active binding needs them. It does not cancel an
execution that has already started.

## Handle errors

- `401`: missing, expired, or revoked Studio key. Ask for configuration repair.
- `404` with `facebook_resource_not_accessible`: app or connection is not
  available to this team. Repeat permitted discovery; do not try other teams.
- `422` with `needs_reauth`: offer authorization only after user selection.
- `422` with `not_accessible` or `resource_unavailable`: check the selected
  Page, Forms, and Meta permissions. Do not replace the account automatically.
- `422` for invalid IDs or a team selector: correct the request against OpenAPI.
- `503` with `facebook_trigger_not_configured`: report environment setup as
  unavailable; do not ask the user for Nango credentials.
- `rate_limited` or `facebook_temporarily_unavailable`: report a temporary
  provider error. After an interrupted create-link or workflow write, inspect
  saved state before retrying.

Never use JWT-only `/integrations/facebook-lead-ads/...` routes with a Studio
key, call Meta directly, or request provider access tokens through this skill.
