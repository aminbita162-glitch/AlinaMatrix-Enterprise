"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker so that the web app can be
 * installed via Add to Home Screen (Phase C: Phone Test Surface).
 * No-op when the service worker API is unavailable (SSR, older browsers).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {
          // Registration failure is non-fatal — the app still works online.
        });
    }
  }, []);
  return null;
}
