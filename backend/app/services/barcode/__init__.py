"""
services/barcode/ — deterministic barcode/GTIN detection, decoding,
validation and merge. Never Gemini/LLM-decided (see resolve.py's docstring).
"""

from app.services.barcode.detect import detect_barcodes
from app.services.barcode.normalize import normalize_gtin
from app.services.barcode.resolve import resolve_barcode_analysis
from app.services.barcode.types import BarcodeAnalysis, BarcodeDecodeResult, barcode_analysis_to_frontend

__all__ = [
    "BarcodeAnalysis",
    "BarcodeDecodeResult",
    "barcode_analysis_to_frontend",
    "detect_barcodes",
    "normalize_gtin",
    "resolve_barcode_analysis",
]
