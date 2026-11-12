// Removes the remaining mentions of the wallet and withdrawals from files you already had:
//   - navigation and dashboard: "Wallet" becomes "Earnings"
//   - admin home: the withdrawals card becomes "Old wallet balances"
//   - admin enrollments: "Confirm payment" becomes "Grant access" (it no longer records money or commissions)
//   - Terms and Privacy pages: wording about wallets and withdrawals is replaced with direct payouts
// IMPORTANT: the Terms and Privacy wording is a sensible starting point, not legal advice.
// Have a lawyer read it before you rely on it.
// Safe to run more than once. Usage (from your project root):  node fix-wallet-removal.mjs
import fs from "node:fs";

function patchFile(file, label, steps) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP    ${label}: ${file} not found`);
    return;
  }
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let s = raw.replace(/\r\n/g, "\n");
  let changed = 0;
  const missing = [];

  for (const step of steps) {
    const { find, replace, what } = step;
    const done = step.done ? s.includes(step.done) : false;
    if (done) continue;
    const hit = find instanceof RegExp ? find.test(s) : s.includes(find);
    if (!hit) {
      missing.push(what);
      continue;
    }
    s = find instanceof RegExp ? s.replace(find, replace) : s.replace(find, replace);
    changed++;
  }

  if (changed > 0) fs.writeFileSync(file, crlf ? s.replace(/\n/g, "\r\n") : s);
  const note = missing.length ? ` (couldn't find: ${missing.join("; ")})` : "";
  console.log(`${changed > 0 ? "PATCHED" : missing.length ? "MANUAL " : "OK     "} ${label}${note}`);
}

patchFile("components/app-header.js", "navigation", [
  { what: "Wallet link", find: '{ href: "/wallet", label: "Wallet" }', replace: '{ href: "/wallet", label: "Earnings" }', done: 'label: "Earnings"' },
]);

patchFile("app/dashboard/page.js", "dashboard button", [
  { what: "Wallet button", find: 'href="/wallet">Wallet</a>', replace: 'href="/wallet">Earnings</a>', done: 'href="/wallet">Earnings</a>' },
]);

patchFile("app/admin/page.js", "admin home card", [
  { what: "card title", find: "<strong>Withdrawal requests</strong>", replace: "<strong>Old wallet balances</strong>", done: "Old wallet balances" },
  {
    what: "card text",
    find: "Review and pay out tutor commissions and referral earnings.",
    replace: "Pay out and close the balances left in the old wallet.",
    done: "close the balances left in the old wallet",
  },
  {
    what: "enrollments card text",
    find: "See who&apos;s on trial or paid, and mark bank transfers as paid.",
    replace: "See who&apos;s on trial or paid, and grant complimentary access.",
    done: "grant complimentary access",
  },
]);

patchFile("app/admin/enrollments/enrollment-payment.js", "admin enrollments (buttons)", [
  { what: "plan placeholder", find: "Select plan paid for...", replace: "Select the plan length to grant...", done: "Select the plan length to grant" },
  { what: "confirm button", find: "Confirm payment${", replace: "Grant access${", done: "Grant access${" },
  { what: "busy label", find: '"Confirming..."', replace: '"Granting..."', done: '"Granting..."' },
]);

patchFile("app/admin/mark-paid-button.js", "admin enrollments (row button)", [
  { what: "button label", find: "Mark paid (+30 days)", replace: "Grant 30 days", done: "Grant 30 days" },
  { what: "busy label", find: '"Marking..."', replace: '"Granting..."', done: '"Granting..."' },
]);

patchFile("app/admin/enrollments/page.js", "admin enrollments (text)", [
  {
    what: "intro text",
    find: "Select the courses a student paid for, pick the matching plan, then confirm. Bundles are paid in one action.",
    replace:
      "Card payments unlock access automatically. Use this only to give a student complimentary access (for example a scholarship or a goodwill extension): select the courses, pick how long, then grant. It records no payment and pays no commission.",
    done: "complimentary access (for example",
  },
]);

patchFile("app/terms/page.js", "Terms of use", [
  {
    what: "section 5 wallet sentence",
    find: /This is separate from your <strong>wallet balance<\/strong> \(see below\), which\s+does represent real money owed to you\./,
    replace: "These have no cash value and are separate from the commissions and bonuses in section 6, which are paid in real money.",
    done: "separate from the commissions and bonuses in section 6",
  },
  {
    what: "section 6",
    find: /<h2>6\. Wallet, commissions, and withdrawals<\/h2>\s*<p>[\s\S]*?<\/p>/,
    replace:
      "<h2>6. Commissions, referral bonuses, and payouts</h2>\n" +
      "        <p>\n" +
      "          Tutors earn a commission for each paying student in their course, and users may earn a referral\n" +
      "          bonus when a student they referred pays, under the referral rules shown in the app. Coursemate\n" +
      "          does not hold these amounts. When a student pays, the payment is divided by our payment\n" +
      "          processor (Paystack) and each person&apos;s share is sent directly to the bank account they have\n" +
      "          verified with us, on the processor&apos;s normal settlement schedule. To receive payouts you must\n" +
      "          provide accurate bank account details. You&apos;re responsible for their accuracy, and we&apos;re not\n" +
      "          liable for funds sent to an incorrect account you supplied. Coursemate does not offer wallets,\n" +
      "          stored balances, or withdrawals.\n" +
      "        </p>",
    done: "Commissions, referral bonuses, and payouts",
  },
  {
    what: "section 8 wallet sentence",
    find: /but retain any wallet balance already earned, which can still be\s+withdrawn subject to normal processing\./,
    replace: "Payouts that have already been sent are not affected.",
    done: "Payouts that have already been sent are not affected.",
  },
]);

patchFile("app/privacy/page.js", "Privacy policy", [
  {
    what: "bank details line",
    find: "bank name, account number, and account name — collected only if you request a withdrawal",
    replace:
      "bank name, account number, and account name — collected only if you set up payouts as a tutor or referrer, and shared with our payment processor (Paystack) to verify your account and send you your share of payments",
    done: "collected only if you set up payouts",
  },
  {
    what: "who can see bank details",
    find: "Admins reviewing withdrawal requests",
    replace: "Admins who support payouts",
    done: "Admins who support payouts",
  },
  { what: "last updated", find: "Last updated: September 2026", replace: "Last updated: November 2026", done: "Last updated: November 2026" },
]);
