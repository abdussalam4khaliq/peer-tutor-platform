"use client";

import { useState } from "react";

export default function NavMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="nav__toggle"
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

      <nav className="nav__links nav__links--desktop">
        <a href="#how-it-works">How it works</a>
        <a href="#why">Why Coursemate</a>
        <a href="/login">Log in</a>
      </nav>
      <a className="nav__cta nav__cta--desktop" href="/signup">Sign up</a>

      {open && (
        <div className="nav__drawer">
          <a href="#how-it-works" onClick={() => setOpen(false)}>How it works</a>
          <a href="#why" onClick={() => setOpen(false)}>Why Coursemate</a>
          <a href="/login" onClick={() => setOpen(false)}>Log in</a>
          <a className="nav__cta" href="/signup" onClick={() => setOpen(false)}>Sign up</a>
        </div>
      )}
    </>
  );
}