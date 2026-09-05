import type { ReactNode } from "react";

import { Footer } from "@/components/layout/Footer";

/**
 * Public layout — wraps pages that do not require authentication.
 *
 * Login (page 1) and Citizen Grievance Portal (page 11) use this layout.
 * It has no sidebar, no header with user info — just a minimal branded
 * wrapper and the GIGW footer.
 */

interface PublicLayoutProps {
  children: ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <div className="lmcs-public-shell">
      <a href="#main-content" className="lmcs-skip-link ux4g-btn ux4g-btn-primary">
        Skip to main content
      </a>

      <div className="lmcs-public-content">
        {children}
      </div>

      <Footer />
    </div>
  );
}
