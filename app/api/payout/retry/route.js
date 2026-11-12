import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSubaccount } from "@/lib/paystack";
import { getActiveUser } from "@/lib/payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// If registering the payout account with Paystack failed the first time, this tries again
// using the account details that were already verified and saved.
export async function POST() {
  const auth = await getActiveUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data: p } = await admin
    .from("profiles")
    .select("bank_code, account_number, account_name, payout_verified_at, paystack_subaccount_code")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!p?.payout_verified_at || !p.bank_code || !p.account_number || !p.account_name) {
    return NextResponse.json({ error: "Please verify your bank account first." }, { status: 400 });
  }
  if (p.paystack_subaccount_code) {
    return NextResponse.json({ payoutReady: true });
  }

  try {
    const sub = await createSubaccount({
      businessName: p.account_name,
      bankCode: p.bank_code,
      accountNumber: p.account_number,
    });
    if (!sub?.subaccount_code) throw new Error("Paystack returned no subaccount code");

    const { error } = await admin
      .from("profiles")
      .update({ paystack_subaccount_code: sub.subaccount_code })
      .eq("id", auth.user.id);
    if (error) throw error;

    return NextResponse.json({ payoutReady: true });
  } catch (err) {
    console.error("createSubaccount retry failed:", err);
    return NextResponse.json({ error: "We couldn't finish setting up your payouts. Please try again in a moment." }, { status: 502 });
  }
}
