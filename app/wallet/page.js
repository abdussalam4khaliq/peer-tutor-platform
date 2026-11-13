import { redirect } from "next/navigation";

// Old URL: kept so bookmarks and notifications that already point here still work.
export default function WalletRedirect() {
  redirect("/payouts");
}
