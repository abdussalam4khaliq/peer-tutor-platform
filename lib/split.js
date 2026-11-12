// Helpers for splitting a Paystack payment between the platform and subaccounts.
// Amounts are in kobo (₦1 = 100 kobo). Every share is an integer.

export function mergeShares(shares) {
  const bySubaccount = new Map();
  for (const share of shares || []) {
    const amount = Number(share.amount_kobo);
    if (!share.subaccount_code || !Number.isInteger(amount) || amount <= 0) {
      throw new Error("Invalid payout share");
    }
    bySubaccount.set(share.subaccount_code, (bySubaccount.get(share.subaccount_code) || 0) + amount);
  }
  return [...bySubaccount.entries()].map(([subaccount_code, amount_kobo]) => ({ subaccount_code, amount_kobo }));
}

// The `split` object for Paystack's initialize call, or null when nobody else is paid.
// A tutor who appears twice (two courses in one bundle, or tutor and referrer) is added together,
// because each subaccount can only appear once. Whatever is not assigned stays with Coursemate,
// and Coursemate pays Paystack's fee (bearer_type "account").
export function buildSplit(shares) {
  const merged = mergeShares(shares);
  if (merged.length === 0) return null;
  return {
    type: "flat",
    bearer_type: "account",
    subaccounts: merged.map((m) => ({ subaccount: m.subaccount_code, share: m.amount_kobo })),
  };
}

export function totalShares(shares) {
  return mergeShares(shares).reduce((sum, m) => sum + m.amount_kobo, 0);
}

// A cautious estimate of Paystack's fee (1.5% plus ₦100 on ₦2,500 and up, capped at ₦2,000),
// used only to make sure the payout shares can never leave Coursemate unable to cover it.
export function estimatedFeeKobo(amountKobo) {
  const fee = Math.round(amountKobo * 0.015) + (amountKobo >= 250000 ? 10000 : 0);
  return Math.min(fee, 200000);
}

export function platformKeepsEnough(amountKobo, shares) {
  return amountKobo - totalShares(shares) >= estimatedFeeKobo(amountKobo);
}
