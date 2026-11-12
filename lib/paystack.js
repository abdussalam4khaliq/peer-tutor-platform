import crypto from "crypto";

// SERVER ONLY helpers for the Paystack REST API.
const BASE_URL = "https://api.paystack.co";

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

// Paystack signs every webhook: HMAC-SHA512 of the RAW request body, using your secret key.
export function isValidSignature(rawBody, signature) {
  if (!signature) return false;

  const expected = crypto.createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Returns Paystack's full JSON (data AND meta) and throws a readable error on failure.
async function paystackJson(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.status) {
    throw new Error(json?.message || `Paystack request failed (${res.status})`);
  }

  return json;
}

async function paystackFetch(path, options = {}) {
  return (await paystackJson(path, options)).data;
}

// amountKobo: integer in kobo (₦1,500 = 150000)
// split (optional): the object from lib/split.js buildSplit(); Paystack then pays each subaccount
// its share directly and sends the rest to your main account.
export function initializeTransaction({ email, amountKobo, reference, callbackUrl, metadata, split }) {
  const body = {
    email,
    amount: amountKobo,
    currency: "NGN",
    reference,
    callback_url: callbackUrl,
    metadata,
  };
  if (split) body.split = split;

  return paystackFetch("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function verifyTransaction(reference) {
  return paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
}

// ---- Bank accounts ---------------------------------------------------------
const BANK_CACHE_MS = 6 * 60 * 60 * 1000;
let bankCache = { at: 0, banks: [] };

// Nigerian banks as [{ name, code }], cached for a few hours.
export async function listBanks() {
  if (bankCache.banks.length && Date.now() - bankCache.at < BANK_CACHE_MS) {
    return bankCache.banks;
  }

  const byCode = new Map();
  let next = null;

  for (let page = 0; page < 10; page++) {
    const qs = new URLSearchParams({ country: "nigeria", currency: "NGN", perPage: "100", use_cursor: "true" });
    if (next) qs.set("next", next);

    const json = await paystackJson(`/bank?${qs.toString()}`);

    for (const b of json.data || []) {
      const isBank = !b.type || b.type === "nuban";
      if (b.active !== false && isBank && b.code && b.name) {
        byCode.set(String(b.code), { name: b.name, code: String(b.code) });
      }
    }

    next = json.meta?.next;
    if (!next) break;
  }

  const banks = [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (banks.length) bankCache = { at: Date.now(), banks };
  return banks;
}

// Returns { account_name, account_number } or throws (e.g. "Could not resolve account name").
export function resolveAccount(accountNumber, bankCode) {
  const qs = new URLSearchParams({ account_number: accountNumber, bank_code: bankCode });
  return paystackFetch(`/bank/resolve?${qs.toString()}`);
}

// ---- Subaccounts (where a tutor's or referrer's share is paid) --------------
// percentage_charge is required by Paystack's API but is not used by our per-payment flat splits.
// Returns { subaccount_code, ... }
export function createSubaccount({ businessName, bankCode, accountNumber }) {
  return paystackFetch("/subaccount", {
    method: "POST",
    body: JSON.stringify({
      business_name: String(businessName).slice(0, 100),
      settlement_bank: bankCode,
      account_number: accountNumber,
      percentage_charge: 0,
    }),
  });
}
