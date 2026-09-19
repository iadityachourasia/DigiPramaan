# OpenParser OCR Migration — Golden Evaluation Corpus Specification

**Status:** Definition only, per OP-Phase 0 (`docs/internal/adr/0001-openparser-ocr-migration.md`). **No real images are added in this file or anywhere in Phase 0.** This document defines the corpus and metrics OP-Phase 1+ must populate and evaluate against; threshold tuning happens later, based on this corpus across representative devices and capture conditions, never on a single device. See `docs/internal/OPENPARSER_OCR_MIGRATION_IMPLEMENTATION.md` §17.4 for the source requirements this document expands on.

**Corrected 2026-09-18, first pass** (see ADR 0001's Correction Log): added embossed packaging to the composition checklist (§1); added missing-confidence frequency to the metrics list (§5); added §3 (licensing/source-authorization policy) and §4 (retention/deletion policy); expanded the ground-truth format (§2) from field-level values only to complete line/block transcription, sufficient to actually compute exact and normalized character accuracy against; expanded the review process into an explicit disagreement-resolution and corpus-versioning section (§6).

**Corrected 2026-09-18, second pass** (see ADR 0001's Correction Log): §2's example now actually contains every field §3/§4/§6's prose calls mandatory (`source_authorization`, `provenance`, `reviewer_history`, `disagreement_records`, `adjudication_outcome`, `lifecycle`) — the first pass had declared these in prose without ever showing them in the worked example. §4 no longer implies a specific retention duration; it now explicitly marks `lifecycle.retention_duration` as requiring product/legal/data-owner approval and defines only the engineering-level deletion owner/trigger/verification-record facts. §5a is a new, fully specified character-accuracy definition: bounded `[0,1]` via clamping, deterministic greedy IoU-based line alignment, an explicit empty-ground-truth/empty-prediction table, separate micro- and macro-aggregation, and CER kept as a distinct, intentionally-unbounded metric.

**Corrected 2026-09-18, third pass** (see ADR 0001's Correction Log — documentation-only, no code/fixture/contract/dependency changes): the second pass's micro-average aggregate formula was still unbounded below zero despite the per-line formula being fixed — corrected with the same `max(0.0, ...)` clamp, and a zero-scorable-lines case now explicitly reports "N/A," never an artificial `1.0`. Hallucinated (unmatched predicted) text was previously excluded from accuracy entirely, allowing unlimited invented text to coexist with a reported 100% score — §5a now defines two distinct, clearly-named metrics (matched-line recognition accuracy vs. end-to-end OCR text accuracy, the latter penalizing hallucination as an edit-distance insertion cost) and keeps the hallucinated-element count/rate as an additional diagnostic, never a replacement for the penalty. §2's `full_transcription.lines[]` entries gained `page_number`, `bbox_unit`, `coordinate_origin`, `source_image_width`/`height`, and `exif_orientation_normalized`, with an explicit requirement that provider geometry be proven-transformed into this same coordinate system (ADR 0001 §10) before alignment, or marked unscorable rather than guessed. §5a's alignment algorithm now states its block-vs-line policy explicitly (normalize via `locations[]`-based splitting before matching, falling back to a flagged union-bbox block unit when a clean split isn't possible) rather than silently assuming one provider element equals one ground-truth line.

---

## 1. Corpus composition requirements

The corpus must be privacy-safe (no real production evidence, no real citizen/business data) and cover, as a checklist to be populated in a later phase:

- [ ] English-language labels
- [ ] Hindi-language labels
- [ ] Mixed-script labels (English + Hindi on the same package)
- [ ] Small-font declarations (near the Rule 7 legal minimum)
- [ ] Glossy/reflective packaging surfaces
- [ ] Curved/cylindrical packaging surfaces
- [ ] Embossed/debossed packaging (blown-moulded or stamped text with no ink/contrast — the same category the existing Rule 7 calibration flow already models via `CalibrationData.is_embossed` in `backend/app/services/extraction/schema.py:103`; OCR behavior on embossed text is a distinct failure mode from a flat printed-but-blurred label and must be represented separately, not folded into "low-contrast text" below)
- [ ] Blur (motion and focus)
- [ ] Glare / specular highlights
- [ ] Perspective distortion (off-axis capture)
- [ ] Rotation (non-zero, non-90°-multiple angles)
- [ ] Shadow occlusion
- [ ] Low-contrast text (light text on light background, dark-on-dark)
- [ ] Partial occlusion (finger, price sticker, shrink-wrap seam over declaration text)
- [ ] All required product angles (front, back, side/PDP) represented
- [ ] Full field coverage: MRP, net quantity, manufacture/import date, manufacturer/packer/importer/brand-owner-or-marketer, country of origin, consumer care details
- [ ] Adversarial label text resembling model instructions (e.g. a label printed with text like "ignore previous instructions" or system-prompt-shaped phrasing), to test that OCR output is never treated as anything but untrusted data by the downstream Gemini structuring stage (ADR 0001 §15 trust-boundary discussion)
- [ ] Barcodes present on the same images used for OCR evaluation, to confirm the OCR migration does not regress barcode decode behavior (a separate, independent pipeline stage)
- [ ] Charts/graphs, if any packaged-goods category in scope uses them (e.g. nutrition panels with bar-chart-style RDA graphics)
- [ ] Negative cases: at least one required field genuinely absent from the package (to test `not_detected` handling, not a missed detection)
- [ ] Missing-field cases: an image where a field's expected angle was never captured

## 2. Ground-truth format (proposal)

**Corrected 2026-09-18** (second correction pass, see ADR 0001's Correction Log): the previous version of this section declared several fields mandatory in prose (source authorization, provenance, reviewer identity, disagreement handling) that never actually appeared in the worked JSON example — a reader copying the example would have produced a non-conformant record. The example below is now the single source of truth: every field the prose anywhere in this document calls mandatory is present in it, structured, not just named.

The original proposal also captured only the 7 structured declaration fields' final values — that is sufficient for required-field precision/recall, but NOT sufficient to compute exact or normalized character accuracy, which requires a ground-truth transcription of everything the OCR engine was supposed to read, not just the handful of fields the rule engine happens to consume. The `full_transcription` block exists for exactly that reason.

Each corpus item is a directory or record containing:

```json
{
  "item_id": "string, stable",
  "image_path": "relative path to the (synthetic/approved, non-production) source image",

  "source_authorization": {
    "classification": "synthetic | staged_non_production | licensed_third_party",
    "license_identifier": null,
    "license_evidence_ref": null,
    "authorized_by": "reviewer or corpus-owner identifier who confirmed this item's basis for use",
    "authorized_at": "ISO 8601"
  },

  "provenance": {
    "captured_or_generated_at": "ISO 8601",
    "capture_or_generation_method": "e.g. 'staged photograph, mid-range Android device' or 'synthetic render, tool X vN'",
    "original_source_reference": null
  },

  "capture_metadata": {
    "device_class": "e.g. mid-range-android-camera | desktop-webcam | scanner",
    "capture_method": "file_picker | native_camera_app | canvas_fallback",
    "angle": "front | back | side_pdp",
    "language": "en | hi | mixed",
    "degradation_tags": ["blur", "glare", "perspective", "embossed"]
  },

  "full_transcription": {
    "description": "Complete line/block-level ground truth of every piece of legible text on the image, in reading order — this, not the 7-field summary below, is what exact/normalized character accuracy (§5) is computed against. Every geometry field below is required per §5a's implementability rule (corrected 2026-09-18, third pass) — geometry-based alignment cannot be implemented from a bare bbox alone.",
    "lines": [
      {
        "line_id": "line-001",
        "text": "the exact transcribed text of this line, preserving original casing/punctuation/spacing",
        "page_number": 1,
        "bbox": {"left": 0, "top": 0, "right": 0, "bottom": 0},
        "bbox_unit": "pixel",
        "coordinate_origin": "top_left",
        "source_image_width": 0,
        "source_image_height": 0,
        "exif_orientation_normalized": true,
        "script": "latin | devanagari | mixed",
        "legible": true,
        "transcription_confidence": "high | medium | low — the HUMAN reviewer's own confidence in their transcription, never confused with a model confidence score"
      }
    ]
  },

  "ground_truth_fields": {
    "manufacturerDetails": {"value": "...", "present_on_image": true, "source_line_ids": ["line-003"]},
    "genericName": {"value": "...", "present_on_image": true, "source_line_ids": ["line-001"]},
    "netQuantity": {"value": "...", "present_on_image": true, "source_line_ids": ["line-005"]},
    "manufactureDate": {"value": "...", "present_on_image": false, "source_line_ids": []},
    "retailSalePrice": {"value": "...", "present_on_image": true, "source_line_ids": ["line-006"]},
    "countryOfOrigin": {"value": null, "present_on_image": false, "source_line_ids": []},
    "consumerCareDetails": {"value": "...", "present_on_image": true, "source_line_ids": ["line-008"]}
  },

  "reviewer_history": [
    {
      "reviewer_id": "reviewer identifier",
      "role": "primary",
      "action": "transcribed",
      "at": "ISO 8601",
      "transcription_ref": "identifier/hash of the transcription this reviewer produced"
    },
    {
      "reviewer_id": "second reviewer identifier, present only if this item was sampled for the second pass (§6)",
      "role": "secondary",
      "action": "re-transcribed",
      "at": "ISO 8601",
      "transcription_ref": "identifier/hash of this reviewer's independent transcription"
    }
  ],

  "disagreement_records": [
    {
      "line_id": "line-004",
      "reviewer_a_id": "...",
      "reviewer_a_text": "...",
      "reviewer_b_id": "...",
      "reviewer_b_text": "...",
      "flagged_at": "ISO 8601"
    }
  ],

  "adjudication_outcome": {
    "adjudicator_id": null,
    "adjudicated_line_ids": [],
    "resolved_at": null,
    "rationale": null
  },

  "corpus_version": "e.g. 2026-09-v1",

  "lifecycle": {
    "status": "active",
    "retention_duration": "UNDECIDED — requires product/legal/data-owner approval; see §4, no default is assumed by this document",
    "deletion_owner": "the named role or person accountable for executing deletion when triggered — see §4",
    "deletion_trigger": "the specific event that causes this item to be deleted — see §4's candidate triggers",
    "deletion_verification": {
      "deleted": false,
      "deleted_at": null,
      "deleted_by": null,
      "verification_ref": null
    }
  }
}
```

`ground_truth_fields[*].source_line_ids` links each structured field back to the specific `full_transcription.lines[]` entries it was read from — this is what lets the evidence-citation-validity metric (§5) be checked against real ground truth (did the model's cited element actually correspond to the same line a human transcriber used?), not just checked for internal self-consistency.

**Each line's geometry fields, explained (added 2026-09-18, third correction pass — a bare `bbox` with no stated unit, origin, image size, or orientation cannot actually be compared against provider geometry; §5a's alignment algorithm was unimplementable without these):**

- `page_number`: every corpus item is a single captured image (one product angle), never a multi-page document — `page_number` is therefore always `1` for every line in every item. It is still included explicitly (rather than assumed implicitly) because the OpenAPI contract's own `Geometry` schema carries a `page_number` on every location, and the alignment algorithm (§5a) restricts candidate pairs to matching page numbers; a ground-truth line with no `page_number` field would force the alignment code to special-case "ground truth has no page concept" separately from "provider geometry always has one," which is exactly the kind of implicit assumption item 3 of this correction exists to remove.
- `bbox_unit`: fixed at `"pixel"` for every ground-truth line in this corpus — ground truth is defined directly against the stored image's own pixel grid, never point/inch/normalized units. This matters because the OpenAPI contract's `CoordinateUnit` enum (`pixel | point | inch | normalized`) does NOT guarantee `pixel` for provider-returned geometry (ADR 0001 §14 Q9, still unanswered) — see the transform rule below.
- `coordinate_origin`: fixed at `"top_left"` (x increases rightward, y increases downward — the same convention `backend/app/services/ocr/paddle.py`'s existing bbox handling already uses) for every ground-truth line. Stated explicitly rather than assumed, since "origin" is a real degree of freedom some imaging/PDF coordinate systems get wrong by defaulting to bottom-left.
- `source_image_width` / `source_image_height`: the pixel dimensions of the exact stored image this line's `bbox` is relative to — required to convert between pixel and normalized coordinates, and to validate that no `bbox` value exceeds the image bounds (a validation §5a's alignment code should run before trusting any geometry).
- `exif_orientation_normalized`: `true` means the stored image's pixel data has already been physically re-oriented (rotated/flipped) to match its original EXIF `Orientation` tag, so `bbox` is relative to the image the way a human actually views it, and the EXIF tag itself is no longer load-bearing. This corpus requires `true` for every accepted item — normalization happens at capture/staging time, before an item is added, so `false` is a defect blocking acceptance, not a state the alignment algorithm needs to branch on. (A corpus that instead shipped un-normalized images with `exif_orientation_normalized: false` would need every consumer of `bbox` to also read and apply the raw EXIF tag correctly, which is exactly the class of "silently guessed" geometry handling item 3 exists to rule out.)

Though repeated identically across every line of the same item, these five fields are still stored per-line (rather than once per `full_transcription` block) so a single line record is fully self-contained for spot-auditing (e.g. pulling one random line for a QA check) without also having to fetch and cross-reference a sibling record — deliberate redundancy, not an oversight.

**Provider-geometry transform requirement (ADR 0001 §10 cross-reference):** before any predicted element's geometry is compared against a ground-truth line's `bbox` for alignment (§5a), it must first be transformed into this SAME coordinate system — pixel units, top-left origin, relative to the same `source_image_width`/`source_image_height`, on an already-EXIF-normalized image — exactly as ADR 0001 §10 (Coordinate policy) already requires for this codebase's existing Rule 7/evidence-crop/report code. **If that transform cannot be proven for a given predicted element** (the provider's `CoordinateUnit` is not `pixel`, or the necessary page-dimension/rotation/crop-offset facts aren't available to construct the transform), that element is marked `alignment: unscorable_geometry` and is excluded from IoU-based alignment entirely — never guessed into a match by, for example, assuming `normalized` coordinates are already `pixel` or ignoring a nonzero `rotation_degrees`. An `unscorable_geometry` element is reported as its own diagnostic count, distinct from a genuinely unmatched (hallucinated) element (§5a) — the two are different failure modes (geometry couldn't be trusted vs. geometry was trusted and simply didn't overlap anything) and conflating them would hide which one is actually happening.

`reviewer_history`, `disagreement_records`, and `adjudication_outcome` are populated per §6's review process — an item that never triggered a second-pass review (§6's sampling/low-confidence criteria) legitimately has a `reviewer_history` of length 1 and empty `disagreement_records`/`adjudication_outcome`; that is a valid, complete record, not a partially-filled one.

## 3. Licensing / source-authorization policy

Every image entering this corpus must have a recorded, checkable basis for use — this section exists because "privacy-safe" and "properly licensed to use" are two different questions, and the composition checklist (§1) only addresses the former. Required per item, structured as the `source_authorization` object in §2's example (not asserted informally):

- `source_authorization.classification`: one of `synthetic` (generated, not a photograph of a real product), `staged_non_production` (a real photograph taken specifically for this corpus, of a product the team has the right to photograph, with no real citizen/business submission involved), or `licensed_third_party` (obtained under an explicit license permitting this use).
- `source_authorization.license_identifier` / `license_evidence_ref`: required (non-null) when `classification == licensed_third_party` — the license identifier and a reference to the actual license text/grant record, not just an asserted category. Both stay `null` for `synthetic`/`staged_non_production` items, since there is no third-party license to cite.
- `source_authorization.authorized_by` / `authorized_at`: who confirmed this specific item's basis for use, and when — a per-item fact, not a one-time corpus-wide sign-off, since a mixed-source corpus (plausible — some staged photos, some licensed stock packaging images) needs per-item traceability to answer "was this specific image's use ever actually authorized" on demand.
- **Never accepted into this corpus, regardless of any other property**: an image sourced from a real citizen grievance submission, a real officer scan of an actual inspection, or any other production evidence path — this is the same non-negotiable the OP-Phase 0 instructions and ADR 0001 §15 both state, restated here because the corpus is the one artifact most likely to accidentally accumulate a "just this once" real image if this policy isn't recorded next to the format itself.
- `provenance.captured_or_generated_at` / `capture_or_generation_method` / `original_source_reference` (§2's example) record HOW the item came to exist, distinct from `source_authorization`'s WHETHER its use was authorized — a synthetic image still needs a provenance record (which tool, when) even though it has no license to track.

## 4. Retention / deletion policy

**No specific retention duration is decided or assumed by this document.** `lifecycle.retention_duration` in §2's per-item example is deliberately left as literal text ("UNDECIDED — requires product/legal/data-owner approval") rather than populated with a number of days/months — this document is an engineering specification for a test corpus, not a data-governance policy, and it is not this document's place to invent a retention period a product owner, legal reviewer, or data owner has not actually approved. Whoever populates a real `lifecycle.retention_duration` value for an actual corpus must get that number from that approval process, not from this file.

What this document DOES define, since these are engineering/process facts rather than legal ones:

- **Deletion owner**: the role or named person accountable for actually executing a deletion once triggered (`lifecycle.deletion_owner` in §2's example) — proposed default: the same role that owns the corpus version changelog (§6), since they already have to touch every corpus-version transition. A specific name/role must be assigned before this corpus is populated with real items; this document does not assign one.
- **Deletion trigger**: the specific event that causes a given item to be deleted (`lifecycle.deletion_trigger`). Candidate triggers this document proposes (still subject to the same approval as retention duration, since "how long after a trigger" is a retention question): a corpus version being superseded by at least one full phase cycle (engineering trigger, no legal question — see the versioning rule in §6); an explicit takedown request from whoever holds `source_authorization` rights over that specific item (e.g., a licensor revokes a license, or a staged-photo subject withdraws consent); a `licensed_third_party` item's license expiring.
- **Deletion-verification record**: `lifecycle.deletion_verification` in §2's example (`deleted`, `deleted_at`, `deleted_by`, `verification_ref`) — populated only once deletion has actually happened, recording who did it, when, and a reference to how it was confirmed (e.g., a storage-deletion job's own log entry or manifest diff). An item claimed deleted with no populated verification record is not considered deleted for corpus-integrity purposes.
- Deletion of a corpus item must remove both the image and its full ground-truth record together — a ground-truth record with no backing image (or vice versa) is a broken corpus item, not a smaller valid one.
- Because no production evidence is ever in this corpus (§3), the corpus itself carries none of the citizen-data retention/deletion LEGAL obligations that apply to real evidence elsewhere in this system (F-012, ADR 0001 §14 Q3) — only the engineering process above. The two must not be conflated when this document is read alongside the production data-handling policy; if a future reviewer decides the corpus itself needs a legally-mandated retention period regardless (e.g. for audit purposes), that determination and its resulting number belong to that approval process, not to this document.

## 5. Metrics (verbatim list from spec §17.4)

### 5a. Character-accuracy definition (corrected 2026-09-18 — see ADR 0001's Correction Log, third pass)

The first-pass version of this definition was unbounded below zero for a sufficiently wrong prediction and left alignment informal. The second-pass fix bounded the PER-LINE formula but left the MICRO-AVERAGE aggregate formula still unbounded, left hallucinated (unmatched predicted) text completely unpenalized — a model could emit unlimited extra invented text alongside perfect matched-line transcription and still report 100% accuracy — and never stated whether a provider element spanning multiple visual lines is handled at all. All three are corrected below, together with the geometry-implementability fields §2 gained in the same pass.

**Two distinct accuracy metrics are reported, never conflated into one:**

1. **Matched-line recognition accuracy** — how accurately the OCR system transcribed the ground-truth lines it actually found and attempted. Computed only over matched and missed ground-truth lines (per the alignment algorithm below); says nothing about hallucinated (unmatched predicted) text.
2. **End-to-end OCR text accuracy** — the true end-to-end quality signal. Starts from matched-line recognition accuracy's same per-line edit distances, then ADDS an insertion-cost penalty for every hallucinated predicted element, so invented text cannot hide behind good performance on the lines that were genuinely there. End-to-end accuracy is always ≤ matched-line recognition accuracy for the same result set (equal only when there is no hallucination).

Reporting only metric 1 was the second-pass version's actual bug: it let "excessive hallucinated text coexist with 100% reported accuracy," exactly as this correction's own brief states. Metric 2 exists specifically to close that gap; metric 1 is kept because it remains useful in isolation (it isolates recognition quality on real content from the separate question of over-generation), so long as it is never reported alone as if it were the whole picture.

**Deterministic line/element alignment, and the block-vs-line policy (item 4):** predicted OCR elements are matched to `full_transcription.lines[]` (§2) by **greedy bounding-box IoU matching** over a normalized set of "predicted line units," derived from raw provider elements as follows — this corpus does NOT assume every provider element corresponds to exactly one ground-truth line:

- **Normalization policy: split provider elements into line units before matching, using the element's own geometry — never silently assume one element = one line.** A `TextElement`'s `locations[]` (the OpenAPI contract's own array-of-`Geometry` field) can carry more than one region for a single element that visually spans multiple lines (e.g. a wrapped paragraph). For each predicted element:
  - If `locations[]` has exactly one entry, the element is already one predicted line unit — no split needed.
  - If `locations[]` has N > 1 entries AND the element's `text`, split on newline characters, yields exactly N non-empty segments, split the element into N predicted line units, pairing segment *i* with `locations[i]`'s geometry, in order.
  - If `locations[]` has N > 1 entries but `text` does NOT cleanly split into N segments (provider text doesn't preserve line breaks, or the count doesn't match), the element is NOT auto-split. It is kept as ONE predicted line unit spanning the union bounding box of all its `locations[]` entries, and tagged `alignment_granularity: "block"` (versus `"line"` for every cleanly-split or already-single-location unit) in evaluation output — so a block-vs-line mismatch is a visible, reported fact, never a silent guess.
- Geometry used for matching is post-transform (ADR 0001 §10 / §2's transform-requirement note) pixel-space geometry only; any element whose transform can't be proven is `alignment: unscorable_geometry` (§2) and takes no part in matching, on either side of the pairing.
- Restrict candidate pairs to the same `page_number` (§2 — always `1` in this single-image corpus, included for schema symmetry with the multi-page-capable contract).
- Compute IoU (intersection-over-union) between every remaining (ground-truth line, predicted line unit) candidate pair.
- Sort all candidate pairs by IoU descending; break ties by `line_id` ascending, then by the predicted line unit's own stable id ascending (a fixed, fully deterministic sort key — no dependency on dict/set iteration order).
- Walk the sorted list once, greedily assigning a pair unless either side is already assigned to a prior pair; skip pairs with IoU `== 0` (never force-assign a non-overlapping pair just because it's next in sort order).
- Any ground-truth line left unassigned after this pass is a **missed line**. Any predicted line unit left unassigned is a **hallucinated element** (§5a's insertion-penalty rule below).

This is a greedy approximation of optimal bipartite matching (not the Hungarian algorithm) — deliberately: simple enough to specify exactly, fully deterministic (fixed sort key, no randomness, no solver-version-dependent tie-breaking), and reproducible by any later implementer from this description alone. The block-splitting step above is the one part of the pipeline that is NOT purely geometric matching — it is stated as its own explicit, ordered rule set (clean split / union-with-flag) specifically so it can't be silently reinterpreted differently by different implementers.

**Per-line accuracy (bounded [0, 1]), feeding matched-line recognition accuracy:** for one matched (ground-truth line, predicted line unit) pair, or a missed/hallucinated line per the table below,

```
edit_distance = Levenshtein(ground_truth_text, predicted_text)
accuracy = max(0.0, 1.0 - edit_distance / max(len(ground_truth_text), 1))
```

The `max(0.0, ...)` clamp floors every per-line score at 0; the formula's own structure caps it at 1 (an exact match has `edit_distance = 0`) — bounded `[0, 1]` by construction, not by convention.

**Empty ground truth / empty prediction (per-line table, feeds matched-line recognition accuracy):**

| Ground truth | Prediction | Accuracy | Notes |
|---|---|---|---|
| empty | empty | 1.0 | Both agree there is nothing here — a legitimate, if unusual, match. |
| empty | non-empty | 0.0 | A matched (aligned) line whose ground truth is an empty string but the prediction isn't — distinct from a hallucinated (unmatched) element, which has no ground-truth line at all and is handled below, not here. |
| non-empty | empty (missed line, no aligned element) | 0.0 | Per the alignment algorithm's "missed line" case above. |
| non-empty | non-empty | per the formula above | Normal case. |

A ground-truth line marked `legible: false` (§2) is excluded from BOTH accuracy metrics' computation entirely, not scored as a 0 — the corpus must not penalize a model for failing at something a human also could not do. This is a third state, distinct from "empty" (a legible line with no text is unusual but scorable; an illegible line is unscorable by definition).

**Character error rate (CER) — kept deliberately separate, NOT bounded to [0, 1]:**

```
CER = edit_distance / max(len(ground_truth_text), 1)
```

CER is per-line accuracy's unclamped complement (`CER = 1 - accuracy` only while the raw ratio stays ≤ 1) and is allowed to exceed 1.0 when a prediction is substantially longer or more garbled than the ground truth — a real, useful signal a clamped `[0,1]` accuracy metric alone would flatten away. CER is reported alongside both accuracy metrics; it is never itself clamped or renamed "accuracy," and an end-to-end CER (defined analogously to end-to-end accuracy below, using the same extended numerator) is also reported, kept equally unbounded.

**Hallucination / insertion-penalty treatment (item 2 — the core of this correction pass):** every predicted line unit left unassigned by the alignment algorithm above (a hallucinated element) contributes an INSERTION cost to the end-to-end numerator equal to its own predicted text length — the standard Levenshtein insertion-cost model (inserting `len(predicted_text)` characters that have no corresponding ground truth costs exactly `len(predicted_text)` edits). Formally, for one scoring unit (a single line, an item, or the whole corpus, per the aggregation scope in effect):

```
matched_edit_distance_sum = sum(edit_distance for every matched + missed ground-truth line)
hallucination_insertion_sum = sum(len(predicted_text) for every hallucinated element in scope)
end_to_end_edit_distance_sum = matched_edit_distance_sum + hallucination_insertion_sum

ground_truth_char_sum = sum(len(ground_truth_text) for every scored ground-truth line)
   # NOTE: hallucinated elements contribute ZERO to this denominator — there is no
   # ground truth for them to lengthen; only the numerator grows.

matched_line_recognition_accuracy = max(0.0, 1.0 - matched_edit_distance_sum / max(ground_truth_char_sum, 1))
end_to_end_ocr_text_accuracy      = max(0.0, 1.0 - end_to_end_edit_distance_sum / max(ground_truth_char_sum, 1))
```

Both formulas share the same `max(0.0, ...)` clamp and the same denominator; `end_to_end_ocr_text_accuracy` differs only in that its numerator also counts hallucinated insertions, which is exactly what makes it strictly ≤ `matched_line_recognition_accuracy` and therefore genuinely penalize over-generation rather than being able to reach 1.0 alongside unlimited hallucinated text.

**Hallucinated-element count/rate remains a separate diagnostic metric, in addition to (never instead of) the insertion penalty above:** report the raw count of hallucinated elements and the rate (hallucinated elements ÷ total predicted elements) per item and pooled across the corpus — this stays useful for triage (WHICH capture conditions produce hallucination) even though its cost is now also folded into `end_to_end_ocr_text_accuracy`'s numerator. Removing the diagnostic count in favor of the insertion penalty (or vice versa) would lose information the other doesn't carry: the count/rate answers "how often," the accuracy penalty answers "how much did it cost."

**Micro- and macro-aggregation — both reported, never only one, and both bounded [0, 1] for every accuracy metric (CER remains unbounded at every aggregation level):**

- **Micro-average (character-count-weighted, pooled globally)**, corrected to be bounded:

  ```
  micro_matched_line_accuracy = max(0.0, 1.0 - matched_edit_distance_sum   / max(ground_truth_char_sum, 1))
  micro_end_to_end_accuracy   = max(0.0, 1.0 - end_to_end_edit_distance_sum / max(ground_truth_char_sum, 1))
  ```

  computed once across the entire evaluation run (or, when reported per-item, once across every scored line within that item). The `max(0.0, ...)` clamp is this correction's fix — the second-pass version omitted it at the aggregate level even though it was already present at the per-line level, which was itself capable of driving the pooled ratio negative when enough badly-misread long lines outweighed the rest. Dominated by long lines/items — a single long, badly-misread line can swamp many short, correctly-read ones.

- **Zero scorable ground-truth lines → "not applicable / no measurement," never an artificial 1.0.** If `ground_truth_char_sum == 0` because there are zero non-`legible:false` ground-truth lines in scope (every line was illegible, or the item/corpus has no lines at all), BOTH micro-average formulas above MUST report `null`/`"N/A"` and must NOT fall through to computing `1.0 - 0/max(0,1) = 1.0`. A "perfect accuracy" score on an item with nothing measurable is not a real result and must never be presented as one; downstream aggregation (e.g. averaging item-level scores into a corpus-level number) excludes `N/A` items from its own denominator rather than treating them as `1.0` or `0.0`.

- **Macro-average (line-level, unweighted)**: the arithmetic mean of the already-computed per-line `accuracy` values (matched-line formula above) across every scored line, every line counted equally regardless of length — reported for `matched_line_recognition_accuracy` only, since "per-line" has no natural per-hallucinated-element analogue to average in (a hallucinated element has no ground-truth line to attach a line-level score to; its cost is captured by the diagnostic rate and by the micro-averaged end-to-end metric instead). If there are zero scorable lines, the macro-average is likewise `N/A`, for the same reason as the micro case — the mean of an empty set is undefined, not zero and not one.

- These answer different questions and are reported together, not collapsed into one number: micro-average approximates "what fraction of all characters, in aggregate, were read correctly," while macro-average approximates "on a typical line, how accurate was the model" — a corpus with mostly-short, mostly-correct lines and one very long, badly-misread line can show a high macro-average alongside a much lower micro-average, and that divergence is itself diagnostic, not noise to be averaged away.

- All aggregations exclude `legible: false` lines from their denominators, and are computed identically whether "normalized" (lowercased, whitespace-collapsed on both sides before the edit-distance computation) or "exact" (raw strings) character accuracy is being reported — normalization changes what `ground_truth_text`/`predicted_text` mean going into the formula, not the aggregation or bounding rules layered on top.

**Summary of every reported "accuracy"-named metric and its bound (item 5):**

| Metric | Bounded? |
|---|---|
| Per-line accuracy | `[0, 1]` (clamped) |
| Matched-line recognition accuracy (any aggregation) | `[0, 1]` (clamped) |
| End-to-end OCR text accuracy (any aggregation) | `[0, 1]` (clamped) |
| Character error rate (CER), per-line or end-to-end | **Unbounded above** — by design, see above |
| Hallucinated-element rate | `[0, 1]` (it's a fraction of a count, not an edit-distance ratio, so it's naturally bounded — no clamp needed, but confirmed in-range by construction) |

No metric whose name contains the word "accuracy" is ever reported unbounded; CER is the sole, clearly-named exception, and is never itself called "accuracy."

### 5b. The rest of the metrics list

- Matched-line recognition accuracy, exact and normalized variants (§5a — recognition quality on lines the model actually attempted, silent on hallucination)
- End-to-end OCR text accuracy, exact and normalized variants (§5a — the true end-to-end signal; penalizes hallucinated text as insertions; always ≤ matched-line recognition accuracy)
- Character error rate, CER, per-line and end-to-end (§5a — kept separate from both accuracy metrics, unbounded above)
- Hallucinated-element count and rate (§5a — diagnostic, reported alongside, never instead of, the end-to-end insertion penalty)
- Required-field precision
- Required-field recall
- Evidence citation validity (does every non-null extracted field cite a real, matching OCR element?)
- Per-angle coverage (fraction of required angles with at least one field successfully read)
- Latency percentiles (p50/p95/p99, first-pass OCR completion)
- Retry rate (fraction of images needing a second OCR pass)
- Cost per completed scan
- **Missing-confidence frequency**: the fraction of OCR elements (and, separately, the fraction of extracted required fields) whose `confidence` is absent entirely — per ADR 0001 §3, this is expected, valid data for PaddleOCR-VL, not an error, so it must be tracked and reported as its own rate rather than silently defaulting to zero or being excluded from the denominator of other metrics. Reported broken down by `confidence.scope` where present (detection vs. recognition vs. other scopes) and by capture condition (e.g. is missing-recognition-confidence correlated with blur/glare/embossed text?), since that correlation is exactly what would justify or invalidate using presence/absence of confidence as a quality signal in a later phase.

Explicitly **not** used as a quality signal on its own: raw "number of blocks/elements detected" — a high element count with low field accuracy is a worse outcome than a low element count with correct fields, and reporting block count alone would reward the wrong thing.

**Capture/quality-gate metrics (from the same corpus, evaluated against the advisory/authoritative quality split OP-Phase 1 introduces):**
- Browser-advisory-check latency (target sub-200ms per ADR 0001 §4/§5.2's advisory-check requirement)
- Server (authoritative) quality-check latency
- False-recapture rate (a genuinely usable image incorrectly forced to RECAPTURE_REQUIRED)
- False-pass rate (a genuinely unusable image incorrectly marked PASS)
- Override rate (fraction of RECAPTURE_REQUIRED images an officer explicitly overrides — a high rate here is itself a signal the thresholds are miscalibrated, not just an audit fact)
- Duplicate-upload count (images rejected as content-hash duplicates)
- Image dimensions/bytes by capture path (file-picker vs. native camera vs. canvas fallback) — to confirm the canvas fallback really is degraded relative to a real still capture, not assumed to be
- Downstream OCR quality bucketed by the quality decision that admitted the image (PASS vs. PASS_WITH_WARNINGS vs. OVERRIDDEN) — this is what eventually validates or invalidates the four-state model itself

## 6. Reviewer disagreement and corpus versioning rules

**Review process:** each item is reviewed by at least one human against the actual (synthetic/approved) image before being added to the corpus, transcribing `full_transcription` in full and deriving `ground_truth_fields` from it (never the reverse — a reviewer must not transcribe only the 7 fields and skip the rest of the label).

**Disagreement resolution:**
- A second, independent reviewer re-transcribes any item where the first reviewer recorded any `transcription_confidence: "low"` line, or any item selected at random for routine quality auditing (a fixed sampling rate, e.g. 10% of all items, independent of confidence — this catches a confidently-wrong first pass that low-confidence spot-checking alone would miss). This second pass appends a `role: "secondary"` entry to `reviewer_history` (§2's example).
- If the two reviewers' transcriptions of a line disagree, the disagreement is recorded as its own entry in `disagreement_records` (§2 — `line_id`, both reviewers' ids and texts, when flagged), and a **third** reviewer resolves it by independently transcribing that line without seeing either prior transcription. The outcome is recorded in `adjudication_outcome` (§2 — `adjudicator_id`, `adjudicated_line_ids`, `resolved_at`, `rationale`), and the majority (or, on a 3-way split, the third reviewer's own best judgment, recorded as such in `rationale`) becomes ground truth. Two-reviewer majority vote alone is never used to resolve a disagreement — with only two opinions, "majority" is really just picking one arbitrarily, which silently launders a genuine ambiguity into false certainty.
- `disagreement_records` and `adjudication_outcome` are retained on the item permanently, not cleared once resolved — an unusually high disagreement rate on a particular degradation category (e.g. embossed text) is itself a useful signal about where human ground truth is inherently shaky, and that signal is lost if resolutions aren't kept.

**Corpus versioning:**
- The corpus is versioned as a whole (`corpus_version`, e.g. `2026-09-v1`) — not per item. A threshold, an accuracy number, or a pass/fail evaluation result is only ever compared against another result computed on the *same* corpus version; comparing across versions without re-running both sides is treated as an invalid comparison, not a shortcut.
- A new corpus version is cut whenever items are added, removed, or have their ground truth corrected (including a disagreement resolution changing a previously-recorded value) — never edited in place under the same version string, so a past evaluation result stays reproducible against the exact corpus it was run on.
- Each corpus version records what changed from the prior version (items added/removed, ground-truth corrections, and why) in a short changelog, so a metric regression between two evaluation runs can be checked against "did the corpus change" before being attributed to a real model/pipeline regression.

## 7. Explicit non-goals for this document

- No real captured images are added here or anywhere in OP-Phase 0.
- No production evidence, real citizen submissions, or real business data may ever enter this corpus — synthetic or explicitly approved non-sensitive images only.
- No threshold values are proposed or tuned here — thresholds are set later, from real corpus results across representative devices, never from a single device or a single capture session.
- This document does not itself gate OP-Phase 0's acceptance — it defines a format and a metric list for a future phase to populate and evaluate against.
