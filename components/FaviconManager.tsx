"use client";

import { useEffect } from "react";
import { loadPortalSettings } from "@/lib/settings-client";

// Applies a custom favicon from Settings (settings.faviconUrl). When set, it
// replaces the default browser-tab icon everywhere. No-op when unset.
export default function FaviconManager() {
  useEffect(() => {
    loadPortalSettings()
      .then((s) => {
        const url = s?.faviconUrl;
        if (!url || typeof url !== "string" || !url.trim()) return;
        // Remove existing icon links, then add ours.
        document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((el) => el.parentElement?.removeChild(el));
        const link = document.createElement("link");
        link.rel = "icon";
        link.href = url.trim();
        document.head.appendChild(link);
        const apple = document.createElement("link");
        apple.rel = "apple-touch-icon";
        apple.href = url.trim();
        document.head.appendChild(apple);
      })
      .catch(() => {});
  }, []);
  return null;
}
