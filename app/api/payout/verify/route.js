import { NextResponse } from "next/server";
import { getActiveUser, verifyAccountInput } from "@/lib/payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step 1: the user picks a bank and types a number; we show them the name on the account.
// Nothing is saved here.
export async function POST(request) {
  const auth = await getActiveUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const result = await verifyAccountInput(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ accountName: result.accountName, bankName: result.bank.name });
}
