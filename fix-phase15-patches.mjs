// Adds three small things to files you already had before Paystack:
//   1. a "Pay / renew" link in the top navigation (students and tutors)
//   2. a "Pay or renew" link on course pages for students on trial or already paid
//   3. a "Paystack payments" card on the admin hub
// Safe to run more than once. If a spot can't be found it tells you what to add by hand.
// Usage (from your project root):  node fix-phase15-patches.mjs
import fs from "node:fs";

function patch(file, label, alreadyMarker, apply, manualHint) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP    ${label}: ${file} not found`);
    return;
  }
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const src = raw.replace(/\r\n/g, "\n");
  if (src.includes(alreadyMarker)) {
    console.log(`OK      ${label}: already applied`);
    return;
  }
  const out = apply(src);
  if (out === null || out === src) {
    console.log(`MANUAL  ${label}: couldn't find the spot in ${file}. Add it by hand: ${manualHint}`);
    return;
  }
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, "\r\n") : out);
  console.log(`PATCHED ${label}`);
}

patch("components/app-header.js", "nav link", '"/payment-info"', (s) => {
  const anchor = "  return links;\n};";
  if (!s.includes(anchor)) return null;
  const add =
    '  if (profile?.role !== "admin" && profile?.role !== "super_admin") {\n' +
    '    links.splice(1, 0, { href: "/payment-info", label: "Pay / renew" });\n' +
    "  }\n\n";
  return s.replace(anchor, add + anchor);
}, 'just before "return links;" add: if (profile?.role !== "admin" && profile?.role !== "super_admin") { links.splice(1, 0, { href: "/payment-info", label: "Pay / renew" }); }');

patch("app/courses/[id]/page.js", "course page link", 'Pay or renew', (s) => {
  const anchor = "Go to course forum →</a></p>}";
  const i = s.indexOf(anchor);
  if (i === -1) return null;
  const end = i + anchor.length;
  const add =
    "\n\n      {enrollment && !isAdmin && entitled && (\n" +
    '        <p><a href="/payment-info">Pay or renew →</a></p>\n' +
    "      )}";
  return s.slice(0, end) + add + s.slice(end);
}, 'under the "Go to course forum" line add: {enrollment && !isAdmin && entitled && (<p><a href="/payment-info">Pay or renew →</a></p>)}');

patch("app/admin/page.js", "admin hub card", "/admin/payments", (s) => {
  const marker = "mark bank transfers as paid.</p>";
  const i = s.indexOf(marker);
  if (i === -1) return null;
  const close = s.indexOf("</a>", i);
  if (close === -1) return null;
  const end = close + "</a>".length;
  const add =
    '\n\n        <a href="/admin/payments" className="card admin-link-card">\n' +
    '          <div className="admin-link-card__top">\n' +
    "            <strong>Paystack payments</strong>\n" +
    "          </div>\n" +
    "          <p>See every card payment, and handle mismatches, refunds and disputes.</p>\n" +
    "        </a>";
  return s.slice(0, end) + add + s.slice(end);
}, 'after the "Enrollments & payments" card add a card linking to /admin/payments');
