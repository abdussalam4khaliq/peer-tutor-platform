"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NotificationsList({ initialNotifications }) {
  const supabase = createClient();
  const [notifications, setNotifications] = useState(initialNotifications);

  async function markRead(id) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div>
      {hasUnread && (
        <button type="button" className="btn btn-outline btn-sm" onClick={markAllRead} style={{ marginBottom: 16 }}>
          Mark all as read
        </button>
      )}

      {notifications.length === 0 && <p>No notifications yet.</p>}

      {notifications.map((n) => (
        
        <a
          key={n.id}
          href={n.link || "#"}
          onClick={() => markRead(n.id)}
          className="card"
          style={{ display: "block", textDecoration: "none", color: "inherit", background: n.read ? undefined : "var(--moss-light)" }}
        >
          <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{n.title}</p>
          {n.body && <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--ink-600)" }}>{n.body}</p>}
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-400)" }}>{new Date(n.created_at).toLocaleString()}</p>
        </a>
      ))}
    </div>
  );
}