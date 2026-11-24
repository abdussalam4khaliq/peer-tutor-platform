"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    // saved course pages belong to this account: remove them from the device
    try {
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n.startsWith("coursemate-pages-")).map((n) => caches.delete(n)));
      }
    } catch {
      // not critical
    }
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button className="btn btn-outline btn-sm" onClick={handleSignOut} disabled={loading}>
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}