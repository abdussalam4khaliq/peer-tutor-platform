"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import SignOutButton from "@/app/dashboard/sign-out-button";
import NotificationBell from "@/components/notification-bell";
import { SUPPORT_MAILTO } from "@/lib/site";

// An item is either a link ({ href, label }) or a dropdown ({ label, children: [links] }).
function buildNav(profile) {
  const role = profile?.role;
  const isAdmin = role === "admin" || role === "super_admin";
  const isTutor = role === "tutor";

  const student = {
    key: "student",
    label: "Student",
    items: [
      { href: "/courses", label: "Courses" },
      { href: "/progress", label: "My progress" },
      {
        label: "Compete",
        children: [
          { href: "/leaderboards", label: "Leaderboards" },
          { href: "/leagues", label: "Leagues" },
          { href: "/tournaments", label: "Tournaments" },
        ],
      },
      ...(!isAdmin ? [{ href: "/payment-info", label: "Pay / renew" }] : []),
    ],
  };

  const sections = [student];

  if (isTutor) {
    sections.push({
      key: "tutor",
      label: "Tutor",
      items: [
        { href: "/tutor/courses", label: "My courses" },
        {
          label: "Rankings",
          children: [
            { href: "/tutor/leaderboards", label: "My leaderboard" },
            { href: "/tutor/leagues", label: "My leagues" },
          ],
        },
      ],
    });
  }

  if (isAdmin) {
    sections.push({ key: "admin", label: "Admin", items: [{ href: "/admin", label: "Admin panel" }] });
  }

  const account = [
    { href: "/profile", label: "Profile" },
    { href: "/payouts", label: "Payouts" },
    { href: "/request-course", label: "Request a course" },
    { href: "/report", label: "Report a user" },
    { href: "/report-bug", label: "Report a bug" },
    { href: SUPPORT_MAILTO, label: "Contact support" },
  ];

  return { sections, account };
}

function useActive() {
  const pathname = usePathname() || "";
  return (href) => !!href && !href.startsWith("mailto:") && (pathname === href || pathname.startsWith(href + "/"));
}

function Dropdown({ label, active, align = "left", children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="nav-dropdown" ref={ref}>
      <button
        type="button"
        className={`nav-link nav-dropdown__button${active ? " nav-link--active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <span aria-hidden="true" className="nav-caret">▾</span>
      </button>
      {open && (
        <div className={`nav-dropdown__menu${align === "right" ? " nav-dropdown__menu--right" : ""}`} role="menu">
          {children}
        </div>
      )}
    </div>
  );
}

export default function AppHeader({ profile }) {
  const [open, setOpen] = useState(false);
  const isActive = useActive();
  const { sections, account } = buildNav(profile);
  const multi = sections.length > 1;

  const flat = (items) => items.flatMap((i) => (i.children ? i.children : [i]));

  return (
    <header className="app-header">
      <a href="/dashboard" className="app-header__brand">
        <svg width="20" height="20" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="16" height="20" rx="2" fill="#16233D" />
          <rect x="8" y="0" width="16" height="20" rx="2" fill="#2F6B52" fillOpacity="0.85" />
        </svg>
        Coursemate
      </a>

      <nav className={`app-nav ${multi ? "app-nav--multi" : "app-nav--single"}`} aria-label="Main">
        {sections.map((section) => (
          <div key={section.key} className={`nav-section nav-section--${section.key}`}>
            {multi && <span className="nav-chip">{section.label}</span>}
            {section.items.map((item) =>
              item.children ? (
                <Dropdown key={item.label} label={item.label} active={item.children.some((c) => isActive(c.href))}>
                  {item.children.map((c) => (
                    <a
                      key={c.href}
                      href={c.href}
                      role="menuitem"
                      className="nav-dropdown__item"
                      aria-current={isActive(c.href) ? "page" : undefined}
                    >
                      {c.label}
                    </a>
                  ))}
                </Dropdown>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  className={`nav-link${isActive(item.href) ? " nav-link--active" : ""}`}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  {item.label}
                </a>
              )
            )}
          </div>
        ))}
      </nav>

      <div className="app-header__actions">
        <NotificationBell />
        <span className="app-header__desktop-actions">
          <Dropdown label="Account" align="right" active={account.some((a) => isActive(a.href))}>
            {account.map((a) => (
              <a
                key={a.href}
                href={a.href}
                role="menuitem"
                className="nav-dropdown__item"
                aria-current={isActive(a.href) ? "page" : undefined}
              >
                {a.label}
              </a>
            ))}
            <div className="nav-dropdown__footer">
              <SignOutButton />
            </div>
          </Dropdown>
        </span>
      </div>

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

          {sections.map((section) => (
            <div key={section.key} className={`drawer-group drawer-group--${section.key}`}>
              {multi && <p className="drawer-group__title">{section.label}</p>}
              {flat(section.items).map((l) => (
                <a key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined} onClick={() => setOpen(false)}>
                  {l.label}
                </a>
              ))}
            </div>
          ))}

          <div className="drawer-group drawer-group--account">
            <p className="drawer-group__title">Account</p>
            {account.map((a) => (
              <a key={a.href} href={a.href} aria-current={isActive(a.href) ? "page" : undefined} onClick={() => setOpen(false)}>
                {a.label}
              </a>
            ))}
          </div>

          <SignOutButton />
        </div>
      )}
    </header>
  );
}
