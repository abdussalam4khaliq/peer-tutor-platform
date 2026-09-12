"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { initPostHog, posthog } from "@/lib/posthog";

export default function AnalyticsProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    initPostHog();

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, school")
        .eq("id", user.id)
        .maybeSingle();

      // Deliberately not sending email or full_name — only enough for
      // cohort analysis (role, school), not enough to identify someone by name.
      posthog.identify(user.id, {
        role: profile?.role,
        school: profile?.school,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!posthog.__loaded) return;
    posthog.capture("$pageview", { path: pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return null;
}