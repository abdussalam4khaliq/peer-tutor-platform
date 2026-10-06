import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidSignature } from "@/lib/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paystack calls this URL after every payment. Set it in the Paystack dashboard:
//   Settings > API Keys & Webhooks > Webhook URL = https://YOUR-SITE/api/paystack/webhook
export async function POST(request) {
  // The signature is computed over the exact raw body, so read it as text, not JSON.
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!isValidSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  // Phase 1 only cares about successful charges. Everything else is acknowledged and ignored.
  if (event?.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const d = event.data || {};
  const admin = createAdminClient();

  const { data: result, error } = await admin.rpc("complete_payment", {
    p_reference: d.reference,
    p_amount_kobo: d.amount,
    p_currency: d.currency,
    p_transaction_id: d.id != null ? String(d.id) : null,
    p_channel: d.channel ?? null,
    p_fee_kobo: d.fees ?? null,
  });

  if (error) {
    // 500 makes Paystack retry the webhook later.
    console.error("complete_payment failed:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  if (result !== "success" && result !== "already_processed") {
    console.error(`Paystack payment ${d.reference} needs attention: ${result}`);
  }

  return NextResponse.json({ received: true, result });
}
