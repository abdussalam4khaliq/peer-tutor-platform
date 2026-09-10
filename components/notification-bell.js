"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NotificationBell() {
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    setNotifications(data || []);
    setUnreadCount((data || []).filter((n) => !n.read).length);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClick(n) {
    if (!n.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", n.id);
    }
    setOpen(false);
    if (n.link) router.push(n.link);
    load();
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        style={{ background: "none", border: "none", cursor: "pointer", position: "relative", padding: 6 }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2a5 5 0 00-5 5v3.2l-1.4 2.8A1 1 0 004.5 14.5h11a1 1 0 00.9-1.5L15 10.2V7a5 5 0 00-5-5z" stroke="#16233D" strokeWidth="1.4" fill="none" />
          <path d="M8 16.5a2 2 0 004 0" stroke="#16233D" strokeWidth="1.4" fill="none" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute", top: 0, right: 0, background: "var(--moss)", color: "white",
              borderRadius: "50%", fontSize: 10, width: 16, height: 16, display: "flex",
              alignItems: "center", justifyContent: "center", fontWeight: 600,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute", right: 0, top: 36, width: 300, maxHeight: 400, overflowY: "auto",
            background: "var(--card)", border: "1px solid var(--rule)", borderRadius: 8,
            boxShadow: "0 12px 28px -12px rgba(22,35,61,0.3)", zIndex: 20,
          }}
        >
          {notifications.length === 0 && (
            <p style={{ padding: 14, fontSize: 14, color: "var(--ink-600)" }}>No notifications yet.</p>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleClick(n)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: 12,
                borderBottom: "1px solid var(--rule)", background: n.read ? "transparent" : "var(--moss-light)",
                border: "none", borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--rule)",
                cursor: "pointer",
              }}
            >
              <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 13 }}>{n.title}</p>
              {n.body && <p style={{ margin: 0, fontSize: 12, color: "var(--ink-600)" }}>{n.body}</p>}
            </button>
          ))}
          <a href="/notifications" style={{ display: "block", textAlign: "center", padding: 10, fontSize: 13 }}>
            See all →
          </a>
        </div>
      )}
    </div>
  );
}