"use client";

import { useState } from "react";
import SignOutButton from "@/app/dashboard/sign-out-button";
import NotificationBell from "@/components/notification-bell";

const LINKS = (profile) => {
  const links = [
    { href: "/courses", label: "Courses" },
    { href: "/profile", label: "Profile" },
    { href: "/leaderboards", label: "Leaderboards" },
    { href: "/leagues", label: "Leagues" },
  ];

  if (profile?.role === "tutor") {
    links.push(
      { href: "/tutor/courses", label: "My courses" },
      { href: "/tutor/leaderboards", label: "My leaderboard" },
      { href: "/tutor/leagues", label: "My leagues" }
    );
  }
  if (profile?.role === "admin" || profile?.role === "super_admin") {
    links.push({ href: "/admin", label: "Admin" });
  }

    links.push({ href: "/tournaments", label: "Tournaments" }, { href: "/wallet", label: "Wallet" }, { href: "/report", label: "Report a user" }, { href: "/report-bug", label: "Report a bug" });

  return links;
};

export default function AppHeader({ profile }) {
  const [open, setOpen] = useState(false);
  const links = LINKS(profile);

  return (
    <header className="app-header">
      <a href="/dashboard" className="app-header__brand">
        <svg width="20" height="20" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="16" height="20" rx="2" fill="#16233D" />
          <rect x="8" y="0" width="16" height="20" rx="2" fill="#2F6B52" fillOpacity="0.85" />
        </svg>
        Coursemate
      </a>

      <nav className="app-header__links app-header__links--desktop">
        {links.map((l) => (
          <a key={l.href} href={l.href}>{l.label}</a>
        ))}
      </nav>

      <span className="app-header__desktop-actions">
        <NotificationBell />
        <SignOutButton />
      </span>

      <button
        type="button"
        className="app-header__toggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path d="M4 4L18 18M18 4L4 18" stroke="#16233D" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path d="M3 6H19M3 11H19M3 16H19" stroke="#16233D" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open && (
        <div className="app-header__drawer--open">
          <a href="/notifications" onClick={() => setOpen(false)}>Notifications</a>
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
          ))}
          <SignOutButton />
        </div>
      )}
    </header>
  );
}