/**
 * Checks the Midtrans configuration from .env, or syncs one order with the Midtrans status API.
 *
 *   pnpm payment:check                        # is MIDTRANS_SERVER_KEY accepted? (no order is created)
 *   pnpm payment:check -- --order <order id>  # ask Midtrans for that order and apply the answer
 *
 * The second form does what a webhook would, which helps locally, where Midtrans cannot reach the
 * app. The server key is never printed.
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";

config({ quiet: true });

const orderIndex = process.argv.indexOf("--order");
const orderId = orderIndex > -1 ? process.argv[orderIndex + 1] : undefined;

async function main() {
  const [{ getEnv }, { MidtransPaymentProvider }, { syncPaymentStatus }, { getDb }] = await Promise.all([
    import("../src/lib/env"),
    import("../src/server/billing/providers/midtrans"),
    import("../src/server/billing/billing-service"),
    import("../src/server/db"),
  ]);
  const env = getEnv();
  const isProduction = env.MIDTRANS_IS_PRODUCTION === "true";
  console.log(`Midtrans ${isProduction ? "PRODUCTION" : "sandbox"} API, PAYMENT_PROVIDER=${env.PAYMENT_PROVIDER}`);
  if (!env.MIDTRANS_SERVER_KEY) throw new Error("MIDTRANS_SERVER_KEY is not set");
  const provider = new MidtransPaymentProvider({ serverKey: env.MIDTRANS_SERVER_KEY, isProduction });

  try {
    if (!orderId) {
      // An order that cannot exist: 404 proves the key is accepted, 401 that it is not.
      const result = await provider.fetchStatus(`key-check-${randomUUID()}`);
      console.log("error" in result && result.error === "not_found" ? "OK   server key accepted by Midtrans" : `?    unexpected answer ${JSON.stringify(result)}`);
      return;
    }
    const transaction = await getDb().paymentTransaction.findUnique({ where: { orderId }, select: { status: true, provider: true } });
    if (!transaction) throw new Error(`order ${orderId} is not in this database`);
    if (transaction.provider !== "midtrans") throw new Error(`order ${orderId} belongs to provider ${transaction.provider}`);
    const outcome = await syncPaymentStatus(provider, orderId);
    const after = await getDb().paymentTransaction.findUniqueOrThrow({ where: { orderId }, select: { status: true } });
    console.log(`OK   ${orderId}: ${transaction.status} → ${after.status} (${outcome})`);
  } finally {
    await getDb().$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
