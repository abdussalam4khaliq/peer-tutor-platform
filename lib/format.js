// The site's users are in Nigeria. Pinning the time zone keeps server-rendered
// dates (which run in UTC on the host) identical to what users expect to see.
const TZ = "Africa/Lagos";

export function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-NG", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-NG", { timeZone: TZ, dateStyle: "medium" });
}

// 5.5 -> "5.5", 6 -> "6"
export function formatPoints(n) {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
}
