"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "coursemate_install_dismissed_until";
const INSTALLED_KEY = "coursemate_installed";
const DISMISS_DAYS = 7;

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosInstructions, setIosInstructions] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(INSTALLED_KEY) === "true") return;

    const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() < dismissedUntil) return;

    if (isIOS()) {
      setIosInstructions(true);
      setVisible(true);
      return;
    }

    function handleBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    function handleAppInstalled() {
      localStorage.setItem(INSTALLED_KEY, "true");
      setVisible(false);
    }
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      localStorage.setItem(INSTALLED_KEY, "true");
    }
    setDeferredPrompt(null);
    setVisible(false);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="install-banner">
      <div className="install-banner__icon">
        <svg width="28" height="28" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="16" height="20" rx="2" fill="#16233D" />
          <rect x="8" y="0" width="16" height="20" rx="2" fill="#2F6B52" fillOpacity="0.85" />
        </svg>
      </div>
      <div className="install-banner__text">
        <p className="install-banner__title">Install Coursemate</p>
        {iosInstructions ? (
          <p className="install-banner__body">
            Tap the Share icon, then &quot;Add to Home Screen&quot; for quick access and notifications.
          </p>
        ) : (
          <p className="install-banner__body">Add it to your home screen for quick access and notifications.</p>
        )}
      </div>
      <div className="install-banner__actions">
        {!iosInstructions && (
          <button type="button" className="btn btn-sm" onClick={handleInstall}>Install</button>
        )}
        <button type="button" className="btn btn-outline btn-sm" onClick={handleDismiss}>
          {iosInstructions ? "Got it" : "Not now"}
        </button>
      </div>
    </div>
  );
}