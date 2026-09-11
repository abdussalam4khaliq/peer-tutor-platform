"use client";

import { useState } from "react";

export default function ReferralShare({ referralCode }) {
  const [copied, setCopied] = useState(false);

  if (!referralCode) return null;

  const link = typeof window !== "undefined" ? `${window.location.origin}/signup?ref=${referralCode}` : "";
  const message = `Hey! I've been using Coursemate to study with notes from students who already aced my courses — thought you'd find it useful too. Sign up with my link: ${link}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function handleCopy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card">
      <p style={{ fontSize: 13, color: "var(--ink-600)", margin: "0 0 6px" }}>Your referral link</p>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, wordBreak: "break-all", margin: "0 0 12px" }}>
        {link}
      </p>
      <div className="action-row">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm"
          style={{ background: "#25D366", borderColor: "#25D366" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 004.79 1.22h.01c5.52 0 10-4.48 10-10s-4.49-9.84-10.01-9.84zm5.85 14.24c-.25.7-1.45 1.34-2 1.43-.51.08-1.15.11-1.86-.12-.43-.14-.98-.32-1.69-.63-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.61-1.21-3.07 0-1.46.77-2.18 1.04-2.48.27-.3.6-.37.8-.37h.57c.18 0 .43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.09.2-.14.32-.28.5-.14.17-.29.38-.42.51-.14.14-.28.29-.12.57.15.28.68 1.13 1.47 1.83 1.01.9 1.87 1.18 2.14 1.32.28.14.44.12.6-.07.17-.2.72-.84.91-1.13.18-.28.37-.24.62-.14.25.09 1.6.75 1.87.89.28.14.46.2.53.32.07.12.07.68-.18 1.38z" />
          </svg>
          Share on WhatsApp
        </a>
        <button type="button" className="btn btn-outline btn-sm" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}