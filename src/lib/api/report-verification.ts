/**
 * report-verification.ts — the public QR-verification page's one data
 * call. Deliberately NOT built on `reports.ts`'s `requestJson`/`apiGet`
 * (both of which are for the AUTHENTICATED report endpoints) — this hits
 * `GET /verify/reports/{id}` directly, which takes no session token at
 * all and returns a deliberately minimal, non-sensitive shape.
 */

const REAL_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export interface ReportVerification {
  reportId: string;
  inspectionId: string | null;
  generatedAt: string | null;
  status: string | null;
  pdfSha256: string | null;
  authenticity: "VALID" | "NOT_FOUND";
}

export async function fetchReportVerification(reportId: string): Promise<ReportVerification | null> {
  try {
    const response = await fetch(`${REAL_API_BASE}/verify/reports/${encodeURIComponent(reportId)}`);
    if (!response.ok) return null;
    return (await response.json()) as ReportVerification;
  } catch {
    return null;
  }
}
