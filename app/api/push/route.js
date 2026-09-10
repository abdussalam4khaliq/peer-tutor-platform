import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:support@virtualcoursemate.vercel.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export async function POST(request) {
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await request.json();
  const notification = payload.record;

  if (!notification) {
    return new Response("No record", { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("profile_id", notification.profile_id);

  if (!subscriptions || subscriptions.length === 0) {
    return new Response("No subscriptions", { status: 200 });
  }

  const payloadStr = JSON.stringify({
    title: notification.title,
    body: notification.body,
    link: notification.link,
  });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr
        );
      } catch (err) {
        // Subscription is dead (expired/unsubscribed) — clean it up.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );

  return new Response("OK", { status: 200 });
}