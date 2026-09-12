import posthog from "posthog-js";

let initialized = false;

export function initPostHog() {
  if (initialized || typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    person_profiles: "identified_only",
    capture_pageview: false, // we capture pageviews manually on route change
    disable_session_recording: true, // never record the screen — protects bank details on /wallet etc.
    autocapture: false, // only track events we explicitly name, not every click
  });

  initialized = true;
}

export { posthog };