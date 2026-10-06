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

async function paystackFetch(path, options = {}) {
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

  return json.data;
}

// amountKobo: integer in kobo (₦1,500 = 150000)
export function initializeTransaction({ email, amountKobo, reference, callbackUrl, metadata }) {
  return paystackFetch("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email,
      amount: amountKobo,
      currency: "NGN",
      reference,
      callback_url: callbackUrl,
      metadata,
    }),
  });
}

export function verifyTransaction(reference) {
  return paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
}
