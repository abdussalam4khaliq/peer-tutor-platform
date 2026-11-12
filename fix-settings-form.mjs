// Adds the "recurring referral slots" setting to the admin settings form and clarifies the
// commission and referral labels. Safe to run more than once.
// Usage (from your project root):  node fix-settings-form.mjs
import fs from "node:fs";

const file = "app/admin/overview/settings-form.js";
if (!fs.existsSync(file)) {
  console.log(`SKIP    ${file} not found`);
  process.exit(0);
}

const raw = fs.readFileSync(file, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");

if (s.includes("referral_recurring_limit")) {
  console.log("OK      already applied");
  process.exit(0);
}

const problems = [];
function replaceOnce(label, find, replacement) {
  const i = s.indexOf(find);
  if (i === -1) {
    problems.push(label);
    return;
  }
  s = s.slice(0, i) + replacement + s.slice(i + find.length);
}

replaceOnce(
  "default value",
  "referral_bonus_naira: settings?.referral_bonus_naira ?? 100,",
  "referral_bonus_naira: settings?.referral_bonus_naira ?? 100,\n    referral_recurring_limit: settings?.referral_recurring_limit ?? 5,"
);

replaceOnce(
  "save payload",
  "referral_bonus_naira: Number(form.referral_bonus_naira),",
  "referral_bonus_naira: Number(form.referral_bonus_naira),\n        referral_recurring_limit: Math.max(0, Math.floor(Number(form.referral_recurring_limit) || 0)),"
);

replaceOnce(
  "commission label",
  "Tutor commission per paid student (₦)",
  "Tutor commission (₦ per course, per month of access paid)"
);

// Relabel the referral field and add the new field right after its closing </label>
const refLabel = "Referral bonus (₦, one-time)";
const at = s.indexOf(refLabel);
if (at === -1) {
  problems.push("referral label");
} else {
  s = s.replace(refLabel, "Referral bonus (₦ per month of access for recurring referrals; a flat one-time amount otherwise)");
  const close = s.indexOf("</label>", at);
  if (close === -1) {
    problems.push("referral label end");
  } else {
    const end = close + "</label>".length;
    const block =
      "\n\n      <label>\n" +
      "        Recurring referral slots per referrer\n" +
      '        <input type="number" min="0" value={form.referral_recurring_limit} onChange={(e) => setForm({ ...form, referral_recurring_limit: e.target.value })} />\n' +
      "      </label>\n" +
      '      <p style={{ margin: 0, fontSize: 13, color: "var(--ink-600)" }}>\n' +
      "        A referrer&apos;s first students (up to this number) earn them the bonus on every payment they make. Further students earn a one-time bonus only.\n" +
      "      </p>";
    s = s.slice(0, end) + block + s.slice(end);
  }
}

if (problems.length) {
  console.log("MANUAL  couldn't find: " + problems.join(", ") + ". Nothing was changed; tell Claude and paste the file.");
  process.exit(0);
}

fs.writeFileSync(file, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("PATCHED settings form");
