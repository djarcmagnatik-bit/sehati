# Payments with Midtrans

The app sells plans and add-ons through **Midtrans Snap** (hosted payment page). This page covers
setup, how a payment becomes "paid", and how to test against the Midtrans **sandbox**, where no real
money moves.

## How an order becomes paid

```text
Checkout → pending order in our DB → Snap payment page → buyer pays
   ├─ Midtrans webhook  POST /api/payments/webhook/midtrans
   │     1. SHA-512 signature checked (constant time) — otherwise 401, nothing else happens
   │     2. our own GET /v2/{order_id}/status to Midtrans — the answer, not the webhook body, is applied
   │     3. status API unreachable → 503, Midtrans retries later
   ├─ Return page  /billing/return?order=…  (buyer comes back)
   │     asks the status API while the order is pending (members only, 30 checks / 10 min per order)
   └─ Worker job  billing.reconcile  every 10 minutes
         re-asks pending Midtrans orders older than 5 minutes, until one day after they expire
```

All three paths go through the same `processPaymentNotification`:
- The order row is locked while the event is applied.
- The event key is `midtrans:{order}:{status}:{transaction_id}:{transaction_status}`, the same whichever path saw it first, so each event applies once.
- The amount must match the order.
- A paid order never moves backwards.
- A refund revokes what the order granted.

Statuses:

| Midtrans status | Our status |
| --- | --- |
| `settlement`, `capture` + fraud `accept` | Paid |
| `pending` | Pending |
| `deny`, `cancel`, `failure` | Failed |
| `expire` | Expired |
| `refund`, `partial_refund` | Refunded |

Anything else is ignored, including `authorize` and a challenged `capture`.

Midtrans answers **404 for a Snap order until the buyer chooses a payment method**. Such orders stay
pending.

## Setup (sandbox)

1. Create a sandbox account at <https://dashboard.sandbox.midtrans.com> (the owner does this).
2. Dashboard → *Settings → Access Keys*: copy the **Server Key** (`SB-Mid-server-…`) into `.env`:
   ```dotenv
   PAYMENT_PROVIDER="midtrans"
   MIDTRANS_SERVER_KEY="SB-Mid-server-…"   # secret: never commit or share
   MIDTRANS_IS_PRODUCTION="false"
   ```
   The client key is not needed: the app uses the Snap redirect, not the Snap.js pop-up.
3. Check the key (creates nothing):
   ```bash
   pnpm payment:check
   ```
   Expected: `OK   server key accepted by Midtrans`.
4. Webhook: in *Settings → Configuration*, set **Payment Notification URL** to
   `{APP_URL}/api/payments/webhook/midtrans`. Midtrans must be able to reach it, so it only works on a
   public HTTPS URL. On a local machine, leave it; the return page and `payment:check` cover the gap.

## Manual test in the sandbox

1. `pnpm dev`, log in, open **Akses & pembayaran**, buy Full Access.
2. The Snap sandbox page opens. Pick for example **BCA Virtual Account** and note the VA number.
3. Pay it at the Midtrans simulator (<https://simulator.sandbox.midtrans.com>, e.g. *BCA → Virtual
   Account*); nothing real is charged.
4. Back in the app (the Snap "finish" button, or **Periksa lagi** on the return page), the status
   becomes **Lunas** and the Full Access features unlock.
5. Without the return page: `pnpm payment:check -- --order <order id>` applies Midtrans' answer and
   prints `PENDING → PAID (applied)`.

Worth trying too:
- Let an order expire. It should end up Expired via the return page or the worker.
- Pay the same order twice (not possible in Snap).
- Replay the webhook. The second call reports `duplicate`.

## Going live

- `MIDTRANS_IS_PRODUCTION="true"` with the production Server Key (`Mid-server-…`).
  `pnpm verify:env` refuses a sandbox `SB-` key with `MIDTRANS_IS_PRODUCTION="true"`.
- Set the production Notification URL. Keep `pnpm worker` running, since `billing.reconcile` catches
  missed webhooks.
- The CSP `form-action` already allows `app.midtrans.com` and `app.sandbox.midtrans.com`.

## Verification status

- **Automated:**
  - Unit tests: signature, status mapping, Snap request, status API URL/auth/404/401/5xx/other-order answers.
  - Integration tests (`tests/integration/payment-status.test.ts`): real provider class and route with a
    local fake of the Midtrans HTTP API.
    - A signed webhook that the status API does not confirm is not applied.
    - A confirmed one is applied exactly once.
    - An amount mismatch is refused.
    - An unreachable API makes the route answer 503.
    - Non-members cannot trigger a sync.
    - The worker applies expired and paid orders.
- **Against the real sandbox, without a key (2026-09-18):** the Status API and Snap both answer
  `HTTP 401` to an invalid key, which the code treats as a configuration error. This matches the handling above.
- **NOT VERIFIED yet:** a full payment with a real sandbox Server Key (steps above), and a webhook from
  Midtrans (needs a public URL).
