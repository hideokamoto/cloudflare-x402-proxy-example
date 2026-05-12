/// <reference types="node" />
/**
 * Test client for x402 payment flow (x402 v2)
 *
 * This script tests the complete payment and cookie flow:
 * 1. Requests the protected endpoint without payment (should get 402)
 * 2. Creates and signs a payment using @x402/core + @x402/evm
 * 3. Retries the request with the payment
 * 4. Saves the cookie
 * 5. Tests access with the cookie (no payment needed)
 */

import { privateKeyToAccount } from "viem/accounts";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

// Configuration
const SERVER_URL = process.env.SERVER_URL || "http://localhost:8787";
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) {
	console.error("❌ Error: PRIVATE_KEY environment variable is required");
	console.log("\nUsage:");
	console.log("  PRIVATE_KEY=0x... pnpm run test:client");
	process.exit(1);
}

async function main() {
	console.log("🧪 Testing x402 Payment Flow (v2)\n");
	console.log(`Server: ${SERVER_URL}`);
	console.log(`Network: Base Sepolia (eip155:84532)\n`);

	// Set up x402 v2 HTTP client with EVM exact scheme support
	const account = privateKeyToAccount(PRIVATE_KEY);
	const baseClient = new x402Client();
	registerExactEvmScheme(baseClient, { signer: account });
	const httpClient = new x402HTTPClient(baseClient);

	console.log(`   Wallet: ${account.address}\n`);

	// Step 1: Request without payment (should get 402)
	console.log("📝 Step 1: Requesting /premium without payment...");
	const initialResponse = await fetch(`${SERVER_URL}/premium`);

	if (initialResponse.status !== 402) {
		console.error(`❌ Expected 402, got ${initialResponse.status}`);
		process.exit(1);
	}

	const initialBody = await initialResponse.clone().json();
	const paymentRequired = httpClient.getPaymentRequiredResponse(
		(name) => initialResponse.headers.get(name),
		initialBody
	);

	console.log("✅ Received 402 Payment Required");
	const firstRequirement = paymentRequired.accepts[0];
	console.log(`   Payment needed: ${firstRequirement?.amount}`);
	console.log(`   Network: ${firstRequirement?.network}\n`);

	// Step 2: Create and sign payment payload via x402 v2 client
	console.log("💰 Step 2: Creating and signing payment...");
	const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
	const paymentHeaders =
		httpClient.encodePaymentSignatureHeader(paymentPayload);
	console.log("✅ Payment signed");
	console.log(`   Amount: ${firstRequirement?.amount}`);
	console.log(`   Recipient: ${firstRequirement?.payTo}\n`);

	// Step 3: Retry request with payment
	console.log("📤 Step 3: Sending request with payment...");

	const paidResponse = await fetch(`${SERVER_URL}/premium`, {
		headers: paymentHeaders,
	});

	if (!paidResponse.ok) {
		console.error(`❌ Payment failed with status ${paidResponse.status}`);
		const errorBody = await paidResponse.text();
		console.error(`   Error: ${errorBody}`);
		process.exit(1);
	}

	// Extract cookie from response
	const setCookieHeader = paidResponse.headers.get("set-cookie");
	let authToken = "";

	if (setCookieHeader) {
		const match = setCookieHeader.match(/auth_token=([^;]+)/);
		if (match) {
			authToken = match[1];
		}
	}

	console.log("✅ Payment successful! Premium content received:");
	console.log(`   Cookie received: ${authToken ? "Yes" : "No"}\n`);

	if (!authToken) {
		console.warn("⚠️  Warning: No auth cookie received");
		console.log("   Skipping cookie authentication test\n");
		return;
	}

	// Step 4: Test access with cookie (no payment needed)
	console.log("🍪 Step 4: Testing cookie authentication...");
	console.log(`   Cookie: auth_token=${authToken}`);
	console.log("   Waiting 2 seconds...");
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const cookieResponse = await fetch(`${SERVER_URL}/premium`, {
		headers: {
			Cookie: `auth_token=${authToken}`,
		},
	});

	if (!cookieResponse.ok) {
		console.error(`❌ Cookie auth failed with status ${cookieResponse.status}`);
		process.exit(1);
	}

	console.log("✅ Cookie authentication successful!");
	console.log(`   No payment required!\n`);

	// Success summary
	console.log("🎉 All tests passed!\n");
	console.log("Summary:");
	console.log("  ✅ 402 Payment Required response");
	console.log("  ✅ Payment creation and signing");
	console.log("  ✅ Payment verification and content access");
	console.log("  ✅ JWT cookie issuance");
	console.log("  ✅ Cookie-based authentication (no repeat payment)");
	console.log("\n✨ The x402 payment flow is working correctly!");
}

// Run the test
main().catch((error) => {
	console.error("\n❌ Test failed:");
	console.error(error);
	process.exit(1);
});
