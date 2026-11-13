import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSubaccount } from "@/lib/paystack";
import { getActiveUser, verifyAccountInput } from "@/lib/payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step 2: the user confirms. We verify AGAIN on the server (never trusting a name sent from the
// browser), save the verified account, then register it with Paystack as a subaccount. That
// subaccount is where this person's share of each payment is sent directly.
export async function POST(request) {
  const auth = await getActiveUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const result = await verifyAccountInput(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("profiles")
    .select("account_number, bank_code, payout_verified_at, paystack_subaccount_code")
    .eq("id", auth.user.id)
    .maybeSingle();

  const unchanged =
    before?.payout_verified_at &&
    before.account_number === result.accountNumber &&
    before.bank_code === result.bank.code;

  if (unchanged && before.paystack_subaccount_code) {
    return NextResponse.json({
      saved: true,
      payoutReady: true,
      bankName: result.bank.name,
      accountName: result.accountName,
    });
  }

  const now = new Date().toISOString();

  // The old subaccount (if any) is cleared in the same write, so there is never a moment where the new
  // bank details sit next to a subaccount that still pays the OLD account.
  const { error } = await admin
    .from("profiles")
    .update({
      bank_name: result.bank.name,
      bank_code: result.bank.code,
      account_number: result.accountNumber,
      account_name: result.accountName,
      payout_verified_at: now,
      payout_updated_at: before?.payout_verified_at && !unchanged ? now : null,
      paystack_subaccount_code: null,
    })
    .eq("id", auth.user.id);

  if (error) {
    console.error("saving payout account failed:", error);
    return NextResponse.json({ error: "Couldn't save your account. Please try again." }, { status: 500 });
  }

  // A changed account is the signature of a hijacked login: tell the owner.
  if (before?.payout_verified_at && !unchanged) {
    await admin.rpc("notify", {
      p_profile_id: auth.user.id,
      p_type: "payment",
      p_title: "Payout account changed",
      p_body: `Your earnings will now be sent to ${result.bank.name} ending ${result.accountNumber.slice(-4)}. If this wasn't you, contact an admin right away.`,
      p_link: "/payouts",
    });
  }

  let payoutReady = false;
  try {
    const sub = await createSubaccount({
      businessName: result.accountName,
      bankCode: result.bank.code,
      accountNumber: result.accountNumber,
    });
    if (!sub?.subaccount_code) throw new Error("Paystack returned no subaccount code");

    const { error: codeError } = await admin
      .from("profiles")
      .update({ paystack_subaccount_code: sub.subaccount_code })
      .eq("id", auth.user.id);
    if (codeError) throw codeError;
    payoutReady = true;
  } catch (err) {
    console.error("createSubaccount failed:", err);
  }

  return NextResponse.json({
    saved: true,
    payoutReady,
    bankName: result.bank.name,
    accountName: result.accountName,
  });
}
