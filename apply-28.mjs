// Applies the small code changes that go with migration 28. Safe to run more than once.
//   1. Moves the payment callback page into app/ (it was in the project root, so /payment/callback was a 404)
//   2. Settings form: a field for the referral reward in access days
//   3. Dashboard: shows bonus access days next to cash bonuses
//   4. Payout save route: notifies a tutor when their payout account is changed
// Usage (from your project root):  node apply-28.mjs
import fs from "node:fs";
import path from "node:path";

function patchFile(file, label, steps) {
  if (!fs.existsSync(file)) return console.log(`SKIP    ${label}: ${file} not found`);
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let s = raw.replace(/\r\n/g, "\n");
  let changed = 0;
  const missing = [];
  for (const { find, replace, done, what } of steps) {
    if (s.includes(done)) continue;
    if (!s.includes(find)) { missing.push(what); continue; }
    s = s.replace(find, () => replace);
    changed++;
  }
  if (changed > 0) fs.writeFileSync(file, crlf ? s.replace(/\n/g, "\r\n") : s);
  const note = missing.length ? ` (couldn't find: ${missing.join("; ")})` : "";
  console.log(`${changed > 0 ? "PATCHED" : missing.length ? "MANUAL " : "OK     "} ${label}${note}`);
}

// 1. callback page
const wrong = "payment/callback/page.js";
const right = "app/payment/callback/page.js";
if (fs.existsSync(wrong) && !fs.existsSync(right)) {
  fs.mkdirSync(path.dirname(right), { recursive: true });
  fs.renameSync(wrong, right);
  for (const d of ["payment/callback", "payment"]) { try { fs.rmdirSync(d); } catch {} }
  console.log("MOVED   payment callback page -> app/payment/callback/");
} else {
  console.log(fs.existsSync(right) ? "OK      payment callback page is in app/payment/callback/" : "MANUAL  payment callback page not found");
}

// 2. settings form
patchFile("app/admin/overview/settings-form.js", "settings form", [
  { what: "state default", done: "referral_bonus_days: settings?.", find: "    referral_recurring_limit: settings?.referral_recurring_limit ?? 5,\n",
    replace: "    referral_recurring_limit: settings?.referral_recurring_limit ?? 5,\n    referral_bonus_days: settings?.referral_bonus_days ?? 7,\n" },
  { what: "save payload", done: "referral_bonus_days: Math.max", find: "        referral_recurring_limit: Math.max(0, Math.floor(Number(form.referral_recurring_limit) || 0)),\n",
    replace: "        referral_recurring_limit: Math.max(0, Math.floor(Number(form.referral_recurring_limit) || 0)),\n        referral_bonus_days: Math.max(0, Math.floor(Number(form.referral_bonus_days) || 0)),\n" },
  { what: "bonus label", done: "Referral bonus for TUTOR referrers", find: "        Referral bonus (₦ per month of access for recurring referrals; a flat one-time amount otherwise)\n",
    replace: "        Referral bonus for TUTOR referrers (₦ per month of access for recurring referrals; a flat one-time amount otherwise). Paid straight to their payout account.\n" },
  { what: "days input", done: "Referral reward for everyone else", find: "      <label>\n        Recurring referral slots per referrer\n",
    replace: "      <label>\n        Referral reward for everyone else (extra days of access, one-time)\n        <input type=\"number\" min=\"0\" value={form.referral_bonus_days} onChange={(e) => setForm({ ...form, referral_bonus_days: e.target.value })} />\n      </label>\n\n      <label>\n        Recurring referral slots per referrer\n" },
]);

// 3. dashboard
patchFile("app/dashboard/page.js", "dashboard", [
  { what: "credits query", done: "const totalDays", find: '    .select("amount")\n    .eq("referrer_id", user.id);\n  const totalEarned = (credits || []).reduce((sum, c) => sum + Number(c.amount), 0);\n',
    replace: '    .select("amount, reward_days")\n    .eq("referrer_id", user.id);\n  const totalEarned = (credits || []).reduce((sum, c) => sum + Number(c.amount), 0);\n  const totalDays = (credits || []).reduce((sum, c) => sum + Number(c.reward_days || 0), 0);\n' },
  { what: "referral card", done: "Bonus access days earned", find: '        <div className="field-row">\n          <span className="field-row__label">Total earned</span>\n          <span className="field-row__value">₦{totalEarned}</span>\n        </div>\n',
    replace: '        {(isTutor || totalEarned > 0) && (\n          <div className="field-row">\n            <span className="field-row__label">Cash bonuses</span>\n            <span className="field-row__value">₦{totalEarned}</span>\n          </div>\n        )}\n        <div className="field-row">\n          <span className="field-row__label">Bonus access days earned</span>\n          <span className="field-row__value">{totalDays}</span>\n        </div>\n        <p style={{ fontSize: 13, margin: "8px 0 0" }}>\n          When someone you refer subscribes, tutors get a cash bonus paid straight to their payout account. Everyone else gets extra days of access.\n        </p>\n' },
]);

// 4. payout save route
patchFile("app/api/payout/save/route.js", "payout save route", [
  { what: "change alert", done: "Payout account changed", find: "  let payoutReady = false;\n  try {\n    const sub = await createSubaccount({",
    replace: "  // A changed account is the signature of a hijacked login: tell the owner.\n  if (before?.payout_verified_at && !unchanged) {\n    await admin.rpc(\"notify\", {\n      p_profile_id: auth.user.id,\n      p_type: \"payment\",\n      p_title: \"Payout account changed\",\n      p_body: `Your earnings will now be sent to ${result.bank.name} ending ${result.accountNumber.slice(-4)}. If this wasn't you, contact an admin right away.`,\n      p_link: \"/wallet\",\n    });\n  }\n\n  let payoutReady = false;\n  try {\n    const sub = await createSubaccount({" },
]);

if (!fs.existsSync("supabase/migrations/28_referral_days_and_fixes.sql")) {
  console.log("\nREMINDER: copy 28_referral_days_and_fixes.sql into supabase/migrations/ and run it in the Supabase SQL editor BEFORE deploying.");
}
