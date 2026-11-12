import { NextResponse } from "next/server";
import { getActiveUser } from "@/lib/payout";
import { listBanks } from "@/lib/paystack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getActiveUser();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const banks = await listBanks();
    return NextResponse.json({ banks });
  } catch (err) {
    console.error("listBanks failed:", err);
    return NextResponse.json({ error: "Couldn't load the bank list. Please try again." }, { status: 502 });
  }
}
