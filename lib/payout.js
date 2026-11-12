import { createClient } from "@/lib/supabase/server";
import { listBanks, resolveAccount } from "@/lib/paystack";

// SERVER ONLY. Shared by the payout API routes.

export async function getActiveUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in first.", status: 401 };

  const { data: profile } = await supabase.from("profiles").select("id, status").eq("id", user.id).maybeSingle();
  if (!profile || profile.status !== "active") {
    return { error: "Your account can't do this right now.", status: 403 };
  }
  return { user };
}

// Validates the input and asks Paystack who owns the account.
// Returns { ok: true, bank, accountNumber, accountName } or { ok: false, error, status }.
export async function verifyAccountInput(body) {
  const bankCode = typeof body?.bankCode === "string" ? body.bankCode.trim() : "";
  const accountNumber = typeof body?.accountNumber === "string" ? body.accountNumber.trim() : "";

  if (!/^\d{2,6}$/.test(bankCode) || !/^\d{10}$/.test(accountNumber)) {
    return { ok: false, error: "Choose your bank and enter your 10-digit account number.", status: 400 };
  }

  let banks;
  try {
    banks = await listBanks();
  } catch (err) {
    console.error("listBanks failed:", err);
    return { ok: false, error: "Couldn't reach the payment provider. Please try again.", status: 502 };
  }

  const bank = banks.find((b) => b.code === bankCode);
  if (!bank) return { ok: false, error: "That bank isn't supported.", status: 400 };

  try {
    const resolved = await resolveAccount(accountNumber, bankCode);
    if (!resolved?.account_name) throw new Error("No account name returned");
    return { ok: true, bank, accountNumber, accountName: String(resolved.account_name).trim() };
  } catch (err) {
    console.error("resolveAccount failed:", err);
    return { ok: false, error: "We couldn't verify that account. Check the bank and account number.", status: 400 };
  }
}
