# Hyperswitch sandbox quickstart

This guide is for the current public **test-mode beta**. It is not permission to process real customer money.

## Current endpoints

- Control center: <https://control-center-production-403b.up.railway.app>
- Router API: <https://router-production-32a7.up.railway.app>
- Web SDK: <https://web-production-feaf3.up.railway.app/HyperLoader.js>

These are temporary Railway domains. Transactional email and password-reset delivery are not operational yet, so use an address and password you can retain safely.

## 1. Create your tenant

1. Open the control center and create an account.
2. Complete the optional two-factor-authentication decision.
3. Record the generated merchant and profile identifiers in your password manager or development secrets vault.
4. Create a test API key in the control center's API-key section.

Treat the API key as a secret. Do not paste it into tickets, chat, screenshots, source files, shell history, or Git.

## 2. Prepare a Stripe sandbox

Install Stripe CLI and either authenticate an existing Stripe test account:

```bash
stripe login
```

or create a temporary claimable Stripe sandbox:

```bash
stripe sandbox create
```

Stripe sandbox creation can print test credentials. Store them directly in a secrets manager and clear the terminal. Never use a key beginning with `sk_live_` in this beta.

## 3. Connect Stripe in Hyperswitch

1. Open **Connectors** in the control center.
2. Add Stripe to the required business profile.
3. Select test mode.
4. Enter the Stripe test secret directly in the protected connector form.
5. Record the resulting merchant connector account identifier (`mca_...`).

Do not put the Stripe secret in a JSON file or command committed to Git.

## 4. Configure signed Stripe webhooks

Set these local shell values. Replace every placeholder with values from your own tenant and connector:

```bash
export HS_ROUTER_URL='https://router-production-32a7.up.railway.app'
export HS_MERCHANT_ID='your_merchant_id'
export HS_MCA_ID='mca_your_connector_id'
export HS_WEBHOOK_URL="${HS_ROUTER_URL}/webhooks/${HS_MERCHANT_ID}/${HS_MCA_ID}"
```

Create a test webhook endpoint:

```bash
stripe webhook_endpoints create \
  -d "url=${HS_WEBHOOK_URL}" \
  -d 'enabled_events[0]=*' \
  --confirm
```

Stripe prints a webhook signing secret beginning with `whsec_`. Enter it immediately in the Stripe connector's webhook settings in the control center. Never commit or share it.

For a short-lived local listener instead of a persistent Stripe endpoint, Stripe CLI also supports:

```bash
stripe listen --forward-to "${HS_WEBHOOK_URL}"
```

Keep the listener running while testing and copy its temporary signing secret into the connector webhook settings for that test session only.

## 5. Run the proven payment smoke test

This low-level processor-token flow is the regression path proven against the live beta. It is a smoke test, not a production checkout architecture.

Keep tenant values in your current shell only. Read the API key without echoing it or writing it into shell history:

```bash
read -r -s -p 'Hyperswitch test API key: ' HS_API_KEY
printf '\n'
export HS_API_KEY
export HS_PROFILE_ID='pro_your_profile_id'
```

Create a Stripe test PaymentMethod:

```bash
command -v stripe >/dev/null
export STRIPE_PAYMENT_METHOD_ID="$(stripe payment_methods create \
  -d type=card \
  -d 'card[token]=tok_visa' \
  --confirm | jq -r '.id')"
[[ "$STRIPE_PAYMENT_METHOD_ID" == pm_* ]]
```

Create and confirm a EUR 15.99 payment through Hyperswitch:

```bash
payment_payload="$(jq -nc \
  --arg profile_id "$HS_PROFILE_ID" \
  --arg mca_id "$HS_MCA_ID" \
  --arg payment_method_id "$STRIPE_PAYMENT_METHOD_ID" \
  '{
    amount:1599,
    currency:"EUR",
    confirm:true,
    capture_method:"automatic",
    authentication_type:"no_three_ds",
    payment_method:"card",
    payment_method_type:"credit",
    off_session:true,
    profile_id:$profile_id,
    description:"Hyperswitch sandbox smoke test",
    recurring_details:{
      type:"processor_payment_token",
      data:{
        processor_payment_token:$payment_method_id,
        merchant_connector_id:$mca_id
      }
    },
    routing:{
      type:"single",
      data:{connector:"stripe",merchant_connector_id:$mca_id}
    }
  }')"

payment_response="$(curl --fail-with-body --silent --show-error \
  --request POST \
  --header 'content-type: application/json' \
  --config <(printf 'header = "api-key: %s"\n' "$HS_API_KEY") \
  --data-binary "$payment_payload" \
  "${HS_ROUTER_URL}/payments")"

jq '{payment_id,status,amount,currency,payment_method_type,connector_transaction_id}' \
  <<<"$payment_response"

jq -e '
  .status == "succeeded"
  and .amount == 1599
  and .currency == "EUR"
  and .payment_method_type == "credit"
  and (.connector_transaction_id | startswith("pi_"))
' <<<"$payment_response" >/dev/null
```

The expected result is `status: "succeeded"`, `currency: "EUR"`, `amount: 1599`, and `payment_method_type: "credit"`.

Verify the connector-side result independently:

```bash
export HS_PAYMENT_ID="$(jq -r '.payment_id' <<<"$payment_response")"
export STRIPE_PAYMENT_INTENT_ID="$(jq -r '.connector_transaction_id' <<<"$payment_response")"

stripe payment_intents retrieve "$STRIPE_PAYMENT_INTENT_ID" \
  | jq '{id,status,amount,currency}'
```

## 6. Run the proven partial-refund test

Create a EUR 4.00 refund through Hyperswitch:

```bash
refund_payload="$(jq -nc \
  --arg payment_id "$HS_PAYMENT_ID" \
  '{
    payment_id:$payment_id,
    refund_type:"instant",
    amount:400,
    reason:"requested_by_customer"
  }')"

refund_response="$(curl --fail-with-body --silent --show-error \
  --request POST \
  --header 'content-type: application/json' \
  --config <(printf 'header = "api-key: %s"\n' "$HS_API_KEY") \
  --data-binary "$refund_payload" \
  "${HS_ROUTER_URL}/refunds")"

jq '{refund_id,status,amount,currency,connector_refund_id}' \
  <<<"$refund_response"

jq -e '
  (.status == "success" or .status == "succeeded")
  and .amount == 400
  and (.connector_refund_id | startswith("re_"))
' <<<"$refund_response" >/dev/null
```

Verify the Stripe refund independently:

```bash
export STRIPE_REFUND_ID="$(jq -r '.connector_refund_id' <<<"$refund_response")"

stripe refunds retrieve "$STRIPE_REFUND_ID" \
  | jq '{id,status,amount,currency,payment_intent}'
```

The expected refund status is `succeeded` with `amount: 400`.

## 7. Verify webhook events

```bash
stripe events list --type payment_intent.succeeded --limit 10 \
  | jq '.data[] | {id,type,created}'

stripe events list --type refund.created --limit 10 \
  | jq '.data[] | {id,type,created}'
```

## 8. Clear local secrets

```bash
unset HS_API_KEY HS_PROFILE_ID HS_MCA_ID HS_MERCHANT_ID HS_WEBHOOK_URL
unset HS_PAYMENT_ID STRIPE_PAYMENT_METHOD_ID STRIPE_PAYMENT_INTENT_ID STRIPE_REFUND_ID
unset payment_payload payment_response refund_payload refund_response
```

Delete temporary Stripe webhook endpoints when they are no longer needed:

```bash
stripe webhook_endpoints list --limit 100
stripe webhook_endpoints delete we_your_temporary_endpoint --confirm
```

## Beta limitations

- Test mode only; do not use live PSP credentials.
- No owned production domains yet.
- No transactional email or password-reset delivery yet.
- No published commercial terms, privacy policy, or support SLA yet.
- GitHub synthetic monitoring is baseline monitoring, not a strict 15-minute SLA.
- Native Railway point-in-time recovery is not enabled yet; encrypted daily logical backups are active and restore-tested.
