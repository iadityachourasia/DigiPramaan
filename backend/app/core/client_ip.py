"""
client_ip.py — P2 hardening (2026-09-19, F-010): trusted-proxy-hop-aware
client IP resolution for rate limiting.

Deliberately NOT the pattern `src/app/api/grievances/route.ts`'s own
`clientKey()` uses (a bare `x-forwarded-for` first entry) — that header's
leftmost entries are exactly what an attacker can freely set themselves;
that helper's own comment already calls it "demo-grade... trivially
forged," not something to mirror for a real abuse-prevention control.

The correct algorithm: `X-Forwarded-For` is a comma-separated chain that
each hop APPENDS to (never rewrites), so the rightmost `trusted_proxy_
hop_count` entries are the ones this deployment's own trusted infra
added, and the next entry to their left is the earliest hop this
deployment can vouch for — never anything further left, which the
client could have pre-populated itself. Azure App Service's own front
end typically adds exactly one hop, hence the default of 1.
"""

from __future__ import annotations

from fastapi import Request

from app.core.config import Settings


def resolve_client_ip(request: Request, settings: Settings) -> str:
    peer = request.client.host if request.client else "unknown"
    hop_count = settings.trusted_proxy_hop_count
    if hop_count <= 0:
        return peer

    forwarded_for = request.headers.get("x-forwarded-for")
    if not forwarded_for:
        return peer

    hops = [h.strip() for h in forwarded_for.split(",") if h.strip()]
    if len(hops) <= hop_count:
        # Fewer hops than this deployment claims to trust means the
        # header's shape doesn't match what's configured — never trust it
        # blindly when there's no guarantee a real proxy chain produced it.
        return peer

    return hops[-(hop_count + 1)]
