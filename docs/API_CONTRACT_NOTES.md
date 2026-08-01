# Prava API Contract Notes

Recorded from official documentation at https://docs.prava.space on 2026-08-01.
This is the source of truth for this project. If implementation code diverges
from this file, the file wins — update code, not this file, unless docs change.

## Base URL

`https://sandbox.api.prava.space`

Sandbox keys only: `sk_test_*` / `pk_test_*`. Production keys are rejected on
this host. Card entry surface lives on a separate domain: `sandbox.collect.prava.space`.

## Health

No documented dedicated schema beyond: returns a status confirmation and
timestamp. Assumed shape (not explicitly schema'd in docs):

```json
{ "status": "ok", "timestamp": "..." }
```

Treated as **NEEDS_VERIFICATION** until the live call is made — see Evidence Ledger.

## POST /v1/sessions (Create Session)

### Request

Required:
- `user_id` (string, 1-255 chars)
- `user_email` (string, valid email)
- `total_amount` (string, decimal, up to 2 decimals, e.g. `"49.99"`)
- `currency` (string, ISO 4217, e.g. `"USD"`)
- `purchase_context` (array, exactly one entry):
  - `merchant_details`: `name`, `url` (https), `country_code_iso2`
  - `product_details` (array, at least one): `description`, `unit_price`, `quantity` (int, default 1), `product_id` (optional, max 50 chars)

Optional:
- `integration_type`: `"full_checkout"` (default) or `"embedding"`
- `callback_url` (https, max 2048 chars) — required for hosted mode, omit for embedded
- `card`: `card_id` or `vault_ref_id` (one only) — pre-select a card
- `mandate_setup` — NOT USED in this project
- `user_phone`, `user_country_code_iso2`, `external_order_ref`, `description`

Note: doc example prompt included `merchant_details.category`, which is **not**
part of the documented schema returned by the live fetch. Following the docs
fetch (source of truth) — `category` is omitted from our request payload.

### Response (201)

- `session_id` (string)
- `session_token` (string, JWT)
- `iframe_url` (string)
- `order_id` (string)
- `expires_at` (ISO 8601 string)
- `authorizeOnly` (boolean, optional — mandate-setup sessions only, not used here)

## GET /v1/sessions/{sessionId}/payment-result

Auth: `Authorization: Bearer <secret key>`

Response:
- `session_id`, `order_id` (nullable), `status` (`pending|awaiting_result|completed|failed`)
- `transactions[]`: `txn_id`, `status`, `line_items[]`, `error` (on failure: `code`, `message`)
- `line_items[]`: `txn_ref_id`, `merchant_name`, `merchant_url`, `total_amount`, `status`,
  `token` (nullable, only when status=awaiting_result), `dynamic_cvv` (nullable, same condition),
  `expiry_month`, `expiry_year`, `products[]`
- `products[]`: `product_ref_id`, `external_product_id`, `name`, `unit_price`, `quantity`

HTTP: 200 success, 401 (AUTH_1001/AUTH_1002), 404 (NOT_FOUND).

## POST /v1/sessions/{sessionId}/report-status

Auth: `Authorization: Bearer <secret key>`, `Content-Type: application/json`

Request:
- `txn_ref_id` (required)
- `txn_status` (required, `APPROVED` or `DECLINED`)
- `txn_type` (default `PURCHASE`)
- `authorization_code` (max 128 chars)
- `response_code` (max 2 chars)
- `amount_paid`
- `product_statuses[]`: `status` (required, `COMPLETED|FAILED|CANCELED|INPROGRESS|PENDING|ONHOLD`), `product_id`, `product_ref_id`, `amount_paid`

Response (200):
- `status`: `"confirmed"`
- `txn_ref_id`
- `txn_status` (`APPROVED`/`DECLINED`)
- `visa_confirmation` (`SUCCESS`/`FAILURE`)

## SDK — @prava-sdk/core

```ts
import { PravaSDK } from '@prava-sdk/core';
const prava = new PravaSDK({ publishableKey: 'pk_test_xxx' });
```

`prava.collectPAN(options): Promise<CollectPANResult>`

Required: `sessionToken`, `iframeUrl` (pass verbatim — do not modify), `container` (CSS selector | HTMLElement)

Optional callbacks: `onReady`, `onSuccess`, `onError`, `onChange`, `onDismiss`, `styles`

```ts
interface CollectPANResult {
  enrollmentId: string;
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
}
```

Cleanup: `sdk.destroy()`

## Integration Modes

- **Embedded** (used in this project): SDK-based, `integration_type: "embedding"`, no callback_url, in-app iframe mount, `onSuccess` callback.
- **Hosted** (not used yet): no SDK, `callback_url` required, user redirected.

## Test Cards / OTP

Documented at https://docs.prava.space/api-reference/test-cards.
Cards share prefix `4622 9431 2313`, expiry `12/27`, varying last 4 + CVV.
OTP test value: `456789`.
Valid only on sandbox host — never hardcoded into this application.

## Documented Error Codes

`VAL_2001`, `AUTH_1001`, `AUTH_1002`, `CARD_NOT_FOUND`, `CARD_INACTIVE`,
`TRIES_EXHAUSTED`, `NOT_FOUND`, `INVALID_STATE`, `VISA_CONFIRMATION_FAILED`,
`REPORT_STATUS_ERROR`.

## Discrepancies vs. original task prompt

1. Task prompt's example create-session body included `merchant_details.category`.
   Live docs fetch for create-session schema does not list `category` as a
   documented field. **Resolution: omit `category` from the request payload,
   per docs-as-source-of-truth rule.**
2. Task prompt referenced `docs.prava.space/sdk/collect-pan`, which 404s.
   Correct path is `docs.prava.space/sdk/cards/collect-pan`. No content
   discrepancy — only a URL path correction.
3. Documented Create Session success response is "201 Created" (per the
   `api-reference/create-session` doc). The live sandbox actually returned
   **HTTP 200** for a successful, schema-valid session creation on 2026-08-01
   (see Evidence Ledger E012/E013). Our route handler only checks `res.ok`
   (any 2xx), so this did not cause a functional failure. Recorded as
   NEEDS_VERIFICATION — live behavior observed, doc not corrected/reconfirmed.
