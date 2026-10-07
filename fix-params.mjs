// Next.js 15 makes `params` (and `searchParams`) asynchronous.
// This script changes `const { id } = params;` into `const { id } = await params;`
// in every file under ./app. It is safe to run more than once.
// Usage (from your project root):  node fix-params.mjs
import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

let changed = 0;
for (const file of walk("app")) {
  const before = fs.readFileSync(file, "utf8");
  // matches "= params;" but not "= await params;" or "= useParams()"
  const after = before.replace(/=\s+params\s*;/g, "= await params;");
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log("updated", file);
    changed++;
  }
}
console.log(changed === 0 ? "Nothing to change." : `Done. ${changed} file(s) updated.`);
