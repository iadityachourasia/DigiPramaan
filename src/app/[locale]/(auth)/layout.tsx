"use client";

import { useState, type ReactNode } from "react";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { AuthProvider } from "@/providers/AuthProvider";

/**
 * Authenticated layout — wraps every page behind login.
 *
 * This is the "app shell" built during the Dashboard page (page 2 in build
 * order). It provides:
 *   - AuthProvider for session state
 *   - Header with skip link, emblem, user info
 *   - Sidebar navigation
 *   - Main content area with #main-content target
 *   - Footer with GIGW-mandatory links
 *
 * On mobile the sidebar is a slide-out drawer; on desktop it's always visible.
 */

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AuthProvider>
      <div className="lmcs-app-shell">
        <Sidebar
          mobileOpen={sidebarOpen}
          onClose={() => { setSidebarOpen(false); }}
        />

        <div className="lmcs-app-main">
          <Header
            onMenuToggle={() => { setSidebarOpen((prev) => !prev); }}
          />

          <div className="lmcs-app-content">
            {children}
          </div>

          <Footer />
        </div>
      </div>
    </AuthProvider>
  );
}
