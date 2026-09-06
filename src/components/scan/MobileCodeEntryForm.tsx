"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { TextField } from "@/components/ui/TextField";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * MobileCodeEntryForm — the plain-text fallback path onto the Mobile Capture
 * Companion (03-scan-upload.md §2): an officer types the code shown under the
 * QR rather than scanning it. Landing here with no token in the URL at all.
 */

export interface MobileCodeEntryFormProps {
  labels: {
    heading: string;
    body: string;
    codeLabel: string;
    submit: string;
  };
}

export function MobileCodeEntryForm({ labels }: MobileCodeEntryFormProps) {
  const [code, setCode] = useState("");
  const router = useRouter();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed) router.push(ROUTES.scanMobile(trimmed));
  }

  return (
    <form onSubmit={handleSubmit} className="lmcs-mobile-code-entry">
      <h1 className="ux4g-heading-m-strong">{labels.heading}</h1>
      <p className="ux4g-body-s-default ux4g-text-neutral-secondary">{labels.body}</p>
      <TextField
        id="mobile-code"
        label={labels.codeLabel}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="XXXX-XXXX"
      />
      <button type="submit" className="ux4g-btn ux4g-btn-primary ux4g-btn-lg">
        {labels.submit}
      </button>
    </form>
  );
}
