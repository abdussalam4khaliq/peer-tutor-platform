import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidSignature, verifyTransaction } from "@/lib/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paystack calls this URL after payment events. Set it in the Paystack dashboard:
//   Settings > API Keys & Webhooks > Webhook URL = https://YOUR-SITE/api/paystack/webhook
//
// Return codes matter: 200 = "got it, don't resend". 500 = "try again later".
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

  const type = event?.event;
  const d = event?.data || {};
  const admin = createAdminClient();

  // ---- Money in ------------------------------------------------------------
  if (type === "charge.success") {
    const { data: result, error } = await admin.rpc("complete_payment", {
      p_reference: d.reference,
      p_amount_kobo: d.amount,
      p_currency: d.currency,
      p_transaction_id: d.id != null ? String(d.id) : null,
      p_channel: d.channel ?? null,
      p_fee_kobo: d.fees ?? null,
    });

    if (error) {
      console.error("complete_payment failed:", error);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }

    if (result !== "success" && result !== "already_processed") {
      console.error(`Paystack payment ${d.reference} needs attention: ${result}`);
    }

    return NextResponse.json({ received: true, result });
  }

  // ---- Refunds -------------------------------------------------------------
  if (type === "refund.processed") {
    const reference = d.transaction_reference || d.transaction?.reference;
    if (!reference) {
      console.error("refund.processed without a transaction reference");
      return NextResponse.json({ received: true });
    }

    // Ask Paystack whether the WHOLE payment was reversed rather than trusting the
    // webhook's wording. Only a full reversal is undone automatically.
    let status;
    try {
      status = (await verifyTransaction(reference)).status;
    } catch (err) {
      console.error("Could not verify refunded transaction:", err);
      return NextResponse.json({ error: "Verification failed" }, { status: 500 });
    }

    if (status === "reversed") {
      const { data: result, error } = await admin.rpc("process_refund", {
        p_reference: reference,
        p_note: "Refunded via Paystack",
      });
      if (error) {
        console.error("process_refund failed:", error);
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
      }
      return NextResponse.json({ received: true, result });
    }

    await admin.rpc("flag_payment", {
      p_reference: reference,
      p_note: `Partial or unconfirmed refund reported by Paystack (transaction status: ${status}). Review it manually.`,
    });
    return NextResponse.json({ received: true, result: "flagged" });
  }

  if (type === "refund.failed" || type === "refund.needs-attention") {
    const reference = d.transaction_reference || d.transaction?.reference;
    if (reference) {
      await admin.rpc("flag_payment", {
        p_reference: reference,
        p_note: `Paystack reported a refund problem (${type}). Check the refund in your Paystack dashboard.`,
      });
    }
    return NextResponse.json({ received: true, result: "flagged" });
  }

  // ---- Disputes / chargebacks: never automatic, just flag for an admin ------
  if (type === "charge.dispute.create" || type === "charge.dispute.resolve") {
    const reference = d.transaction?.reference || d.transaction_reference;
    if (reference) {
      await admin.rpc("flag_payment", {
        p_reference: reference,
        p_note: `Dispute event: ${type}${d.status ? ` (${d.status})` : ""}. Handle it in your Paystack dashboard.`,
      });
    }
    return NextResponse.json({ received: true, result: "flagged" });
  }

  // Everything else is acknowledged and ignored.
  return NextResponse.json({ received: true });
}
