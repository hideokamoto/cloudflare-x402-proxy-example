# Testing Guide

This guide explains how to test the x402 payment flow with cookie-based authentication.

## Prerequisites

Before testing, you need:

1. **Base Sepolia testnet USDC**
   - Get testnet ETH from a Base Sepolia faucet
   - Get testnet USDC from Coinbase faucet or similar

2. **A test wallet with a private key**
   - Create a test wallet (DO NOT use a wallet with real funds)
   - Export the private key
   - Fund it with Base Sepolia testnet USDC

3. **The worker running locally**
   ```bash
   pnpm run dev
   ```

## Browser test UI (`/browser-test/`)

The static page at **`/browser-test/`** reproduces the same high-level checks as `test-client.ts`, but in the browser:

1. **Step 1** — `GET` the protected URL with `credentials: 'include'` and assert **402**.
2. **Step 2** — Build `X-PAYMENT` via an injected EVM wallet (`window.ethereum`) using `viem` + `x402/client`, or skip and paste a header manually.
3. **Step 3** — Retry with the `X-PAYMENT` header; expect **2xx** and (usually) a `Set-Cookie` for `auth_token`.
4. **Step 4** — `GET` again without `X-PAYMENT`; if the **HttpOnly** cookie is stored, the request should **not** return **402**.

### When to use which tool

| Tool                       | Best for                                                                  |
| -------------------------- | ------------------------------------------------------------------------- |
| **`pnpm run test:client`** | Scripted/local verification; full control with a test private key         |
| **`purl`**                 | CLI end-to-end with a managed keystore                                    |
| **`/browser-test/`**       | Quick manual checks in a real browser wallet; optional pasted `X-PAYMENT` |

### Prerequisites

- Worker running (`pnpm run dev`) or deployed URL
- Wallet funded on the same network as `NETWORK` in `wrangler.jsonc` (test **USDC** + gas on **Base Sepolia** for the default template)
- **CDN access:** the page loads `viem` and `x402/client` from **esm.sh**. Offline or strict networks may fail at Step 2.

### Manual `X-PAYMENT` troubleshooting

- The pasted header must match the **same resource** and **402** payload you are hitting (amount, `payTo`, network).
- If Step 4 still returns **402**, the browser may not be storing the cookie: verify you are on **HTTPS** in production (`Secure` cookies), stay on the **same origin** as Step 3, and confirm `JWT_SECRET` is set for the Worker.

## Automated Testing

The easiest way to test is using the provided test client script:

```bash
# Set your private key (test wallet only!)
export PRIVATE_KEY=0x...

# Run the test client
pnpm run test:client
```

The test client will:

1. ✅ Request `/premium` without payment (receives 402)
2. ✅ Create and sign a payment with your wallet
3. ✅ Submit the payment and receive premium content
4. ✅ Extract the JWT cookie from the response
5. ✅ Test cookie authentication (no payment needed)

### Example Output

```
🧪 Testing x402 Payment Flow

Server: http://localhost:8787
Network: Base Sepolia (testnet)

📝 Step 1: Requesting /premium without payment...
✅ Received 402 Payment Required
   Payment needed: 10000
   Description: Access to premium content for 1 hour

💰 Step 2: Creating and signing payment...
   Wallet: 0x1234...5678
✅ Payment signed
   Amount: 10000
   Recipient: 0xa9c7...ade4

📤 Step 3: Sending request with payment...
✅ Payment successful! Premium content received:
   Cookie received: Yes

🍪 Step 4: Testing cookie authentication...
   Waiting 2 seconds...
✅ Cookie authentication successful!
   No payment required!

🎉 All tests passed!

Summary:
  ✅ 402 Payment Required response
  ✅ Payment creation and signing
  ✅ Payment verification and content access
  ✅ JWT cookie issuance
  ✅ Cookie-based authentication (no repeat payment)

✨ The x402 payment flow is working correctly!
```

## Manual Testing with curl

### 1. Test the health endpoint

```bash
curl http://localhost:8787/__x402/health
# Should return: {"status":"ok","proxy":"x402-proxy","message":"This endpoint is always public",...}
```

### 2. Request protected endpoint without payment

```bash
curl -v http://localhost:8787/premium
```

You should receive:

- Status: `402 Payment Required`
- Body: Payment requirements including amount, network, recipient address

### 3. Create and submit a payment

This requires using the x402 SDK or a compatible wallet to:

- Parse the payment requirements
- Create a signed payment payload
- Encode it as base64

Example using the x402 SDK (see `test-client.ts` for full code):

```typescript
const payment = await exact.evm.createPayment({
	client: walletClient,
	payTo: requirement.payTo,
	amount: requirement.maxAmountRequired,
	resource: requirement.resource,
});

const encodedPayment = exact.evm.encodePayment(payment);
```

Then submit with the `X-PAYMENT` header:

```bash
curl -v http://localhost:8787/premium \
  -H "X-PAYMENT: <base64-encoded-payment>"
```

### 4. Test cookie authentication

After a successful payment, extract the `auth_token` cookie from the `Set-Cookie` header, then:

```bash
curl http://localhost:8787/premium \
  -H "Cookie: auth_token=<your-jwt-token>"
```

You should receive the authenticated response without being asked for payment!

## Troubleshooting

### "Invalid payment" error

- Check that your wallet has enough testnet USDC
- Verify you're on Base Sepolia network
- Ensure the payment amount matches the requirement

### "Payment expired" error

- Payments have a time window (validBefore/validAfter)
- Create a fresh payment and submit immediately

### No cookie received

- Check the response headers for `Set-Cookie`
- Verify the payment was successful (status 200)

### Cookie doesn't work

- Ensure you're including the full cookie value
- Check that the cookie hasn't expired (1 hour)
- Verify the JWT_SECRET is set in `.dev.vars`

## Environment Variables

The test client uses these environment variables:

- `PRIVATE_KEY` - (Required) Your test wallet private key
- `SERVER_URL` - (Optional) Server URL (default: http://localhost:8787)

## Security Notes

⚠️ **NEVER use a private key from a wallet with real funds for testing!**

- Create a new test wallet specifically for Base Sepolia testnet
- Only fund it with testnet tokens (no real value)
- The `.dev.vars` file is gitignored - don't commit secrets!
