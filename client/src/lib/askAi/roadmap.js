/**
 * Ask AI reliability roadmap (living doc)
 *
 * Phase 1 — Ground truth (IN PROGRESS)
 *  - Per-app domain answer engines (not generic keyword soup)
 *  - Context quality score; merge client + Mongo hydrate
 *  - Eval harness with fixture Q&A
 *  Success: eval script green; answers name real projects/metrics
 *
 * Phase 2 — Server of record
 *  - Prefer server-built context for apps with app_states / APIs
 *  - Hard refuse when quality < threshold (honest “no data” vs fiction)
 *  Success: UI always shows evidence count + quality; no silent empty answers
 *
 * Phase 3 — LLM as narrator only
 *  - Build structured evidence[] first; Claude may only narrate those facts
 *  - Reject LLM output that introduces numbers not in evidence
 *  Success: spot-check 20 prompts — zero invented figures
 *
 * Phase 4 — Continuous reliability
 *  - Expand golden set per app; run eval in CI
 *  - Logging of question → evidence IDs → answer for audits
 *  Success: regressions fail the pipeline
 */
export const ASK_AI_ROADMAP_VERSION = '2026-07-13-phase1';
