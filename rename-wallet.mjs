// Renames the "wallet" page to "payouts". Safe to run more than once.
//   - moves app/wallet/ -> app/payouts/  (page + its forms)
//   - leaves a small page at /wallet that redirects to /payouts, so old links, bookmarks and
//     notifications that were already sent keep working
//   - nav, dashboard button, page heading and the "payout account changed" notification say Payouts
// Stop `npm run dev` first (Windows can't move a folder that is in use).
// Usage (from your project root):  node rename-wallet.mjs
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

// 1. move the folder
if (fs.existsSync("app/wallet/bank-details-form.js") && !fs.existsSync("app/payouts")) {
  fs.renameSync("app/wallet", "app/payouts");
  console.log("MOVED   app/wallet -> app/payouts");
} else {
  console.log(fs.existsSync("app/payouts") ? "OK      app/payouts already exists" : "MANUAL  app/wallet not found");
}

// 2. redirect page at the old URL
if (!fs.existsSync("app/wallet/page.js")) {
  fs.mkdirSync("app/wallet", { recursive: true });
  fs.writeFileSync(
    "app/wallet/page.js",
    'import { redirect } from "next/navigation";\n\n// Old URL: kept so bookmarks and notifications that already point here still work.\nexport default function WalletRedirect() {\n  redirect("/payouts");\n}\n'
  );
  console.log("CREATED app/wallet/page.js (redirects to /payouts)");
}

// 3. wording and links
patchFile("components/app-header.js", "nav link", [
  { what: "nav link", done: '{ href: "/payouts", label: "Payouts" }', find: '{ href: "/wallet", label: "Wallet" }', replace: '{ href: "/payouts", label: "Payouts" }' },
]);
patchFile("app/dashboard/page.js", "dashboard button", [
  { what: "button", done: 'href="/payouts">Payouts</a>', find: 'href="/wallet">Wallet</a>', replace: 'href="/payouts">Payouts</a>' },
]);
patchFile("app/payouts/page.js", "page heading", [
  { what: "heading", done: "<h1>Payouts</h1>", find: "<h1>Earnings</h1>", replace: "<h1>Payouts</h1>" },
]);
patchFile("app/api/payout/save/route.js", "notification link", [
  { what: "link", done: 'p_link: "/payouts"', find: 'p_link: "/wallet"', replace: 'p_link: "/payouts"' },
]);
patchFile("lib/posthog.js", "comment", [
  { what: "comment", done: "bank details on /payouts etc.", find: "bank details on /wallet etc.", replace: "bank details on /payouts etc." },
]);
