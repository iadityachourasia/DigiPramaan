"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

import { usePrefersReducedMotion } from "@/lib/hooks";

/**
 * HomePipeline — how a scan becomes a compliance record.
 *
 * The showpiece section. Drawn as a rail of stages rather than a generic
 * progress bar, because the pipeline in `12-scan-pipeline-history-hierarchy.md`
 * §4.1 is the product's actual differentiator and a judge should be able to see
 * the stages named.
 *
 * The second-opinion stage is marked as conditional rather than shown as an
 * equal peer: it only runs when a field's confidence falls below threshold.
 * Drawing it as one of seven identical boxes would misrepresent the design, and
 * the addendum is explicit that a skipped stage must read as intentional rather
 * than be silently omitted.
 *
 * Brand budget: only the conditional node is tinted. Colouring every node would
 * push this section well past the ~10% brand-ink ceiling in PAGE_COMPOSITION §0
 * and would flatten the one distinction the diagram exists to make.
 *
 * Motion is a single one-shot reveal, honouring `prefers-reduced-motion` via the
 * project's existing hook, per BRD §11.8's Subtle/functional setting.
 */

/*
 * Nodes show the step number rather than an icon.
 *
 * Two reasons. The stages are a strict sequence, and a number states that more
 * plainly than a glyph. And the UX4G Material Icons font is a subset — a
 * ligature it does not carry renders as a stray letter rather than failing
 * visibly, which is a silent way for this diagram to end up looking broken.
 */
const STAGES = [
  { key: "capture", conditional: false },
  { key: "quality", conditional: false },
  { key: "ocr", conditional: false },
  { key: "fallback", conditional: true },
  { key: "structuring", conditional: false },
  { key: "rules", conditional: false },
  { key: "score", conditional: false },
] as const;

export function HomePipeline() {
  const t = useTranslations("home.pipeline");
  const reduceMotion = usePrefersReducedMotion();

  /*
   * The reveal animates position only, never opacity.
   *
   * An earlier version faded in from `opacity: 0`, which meant the whole
   * section was invisible until an IntersectionObserver fired. That is not a
   * cosmetic choice — if the observer is late, the script fails, or the reader
   * is on a browser that never triggers it, the content is simply gone. Content
   * must be readable without JavaScript; motion may only refine how it arrives.
   *
   * Spread conditionally rather than passing `undefined`: the project runs
   * `exactOptionalPropertyTypes`, so an explicit `undefined` is not assignable
   * to an optional prop, and omitting the props is the clearer expression of
   * "do not animate" anyway.
   */
  const reveal = reduceMotion
    ? {}
    : {
        initial: { y: 10 },
        whileInView: { y: 0 },
        viewport: { once: true, amount: 0.2 },
      };

  return (
    <section
      id="how-it-works"
      className="lmcs-section lmcs-section-elevated"
    >
      <div className="ux4g-container">
        <div className="lmcs-section-head">
          <h2 className="ux4g-heading-l-strong">{t("heading")}</h2>
          <p className="ux4g-body-m-default ux4g-text-neutral-secondary">
            {t("body")}
          </p>
        </div>

        {/*
          The connector between stages is drawn by CSS on each item, so it
          cannot compete with the items for flex space and adds no DOM. The
          ordered list already conveys sequence to assistive technology.
        */}
        <ol className="lmcs-pipeline">
          {STAGES.map((stage, index) => (
            <motion.li
              key={stage.key}
              className="lmcs-pipeline-step"
              {...reveal}
              transition={{ duration: 0.35, delay: index * 0.07 }}
            >
              <span className="lmcs-pipeline-marker">
                <span
                  className={`lmcs-pipeline-node${
                    stage.conditional ? " lmcs-pipeline-node-branch" : ""
                  }`}
                >
                  <span className="ux4g-label-l-default" aria-hidden="true">
                    {index + 1}
                  </span>
                </span>
              </span>

              <span className="lmcs-pipeline-text">
                <span className="ux4g-title-s-strong">
                  {t(`steps.${stage.key}.title`)}
                </span>
                <span className="ux4g-body-s-default ux4g-text-neutral-secondary">
                  {t(`steps.${stage.key}.body`)}
                </span>
                {stage.conditional ? (
                  <span className="ux4g-tag ux4g-tag-outline-primary ux4g-tag-s">
                    {t("branchLabel")}
                  </span>
                ) : null}
              </span>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
