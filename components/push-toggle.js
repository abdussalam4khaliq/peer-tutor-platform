"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PushToggle() {
  const supabase = createClient();
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "enabled" : "disabled");
    });
  }, []);

  async function enable() {
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notification permission was denied.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });

      const json = sub.toJSON();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await supabase.from("push_subscriptions").upsert(
        {
          profile_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: "endpoint" }
      );

      setStatus("enabled");
    } catch (err) {
      setError(err.message);
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    setStatus("disabled");
  }

  if (status === "unsupported") return null;
  if (status === "checking") return null;

  return (
    <div className="card">
      {status === "enabled" ? (
        <>
          <p style={{ margin: "0 0 8px" }}>🔔 Push notifications are on.</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={disable}>Turn off</button>
        </>
      ) : (
        <>
          <p style={{ margin: "0 0 8px" }}>Get notified even when Coursemate isn&apos;t open.</p>
          <button type="button" className="btn btn-sm" onClick={enable}>Enable push notifications</button>
        </>
      )}
      {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
    </div>
  );
}