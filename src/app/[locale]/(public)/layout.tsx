import { getTranslations } from "next-intl/server";
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

export default async function PublicLayout({ children }: PublicLayoutProps) {
  const t = await getTranslations("accessibility");

  return (
    <div className="lmcs-public-shell">
      {/*
        A raw anchor is correct here and is not a locale-routing bug: the target
        is an in-page fragment, not a route, so there is no locale to carry.
      */}
      <a href="#main-content" className="lmcs-skip-link ux4g-btn ux4g-btn-primary">
        {t("skipToMain")}
      </a>

      <div className="lmcs-public-content">
        {children}
      </div>

      <Footer />
    </div>
  );
}
