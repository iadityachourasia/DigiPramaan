"use client";

import { useState, type ReactNode } from "react";

import { SessionExpiryWarning } from "@/components/shared";

import { Footer } from "./Footer";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

/**
 * AppShell — the authenticated chrome: sidebar, header, content, footer.
 *
 * Extracted from `(auth)/layout.tsx` so that the layout itself can go back to
 * being a Server Component. Only this node needs to be a client component, and
 * only because it owns the mobile drawer's open state. A layout marked
 * `"use client"` cannot be `async`, cannot call `setRequestLocale`, and cannot
 * export `generateMetadata` — so pushing the state down one level buys all
 * three back.
 */

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="lmcs-app-shell">
      <Sidebar
        mobileOpen={sidebarOpen}
        onClose={() => {
          setSidebarOpen(false);
        }}
      />

      <div className="lmcs-app-main">
        <Header
          onMenuToggle={() => {
            setSidebarOpen((prev) => !prev);
          }}
        />

        <SessionExpiryWarning />

        <div className="lmcs-app-content">{children}</div>

        <Footer />
      </div>
    </div>
  );
}
