"""
services/scans/ — evidence-image intake shared by desktop upload-once
capture (api/v1/scans.py) and Mobile QR Handoff (api/v1/mobile_handoff.py).
"""

from app.services.scans.intake import AcceptanceState, EvidenceAcceptance, accept_evidence_image

__all__ = ["AcceptanceState", "EvidenceAcceptance", "accept_evidence_image"]
