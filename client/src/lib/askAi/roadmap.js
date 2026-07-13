/**
 * Ask AI reliability roadmap (living doc)
 *
 * Phase 1 — Ground truth ✓
 *  - Per-app domain answer engines
 *  - Context quality score; merge client + Mongo hydrate
 *  - Eval harness with fixture Q&A
 *
 * Phase 2 — Server of record (IN PROGRESS)
 *  - Server-built context for Hiring, Post Sales, DM, PreCon, Execution
 *  - Prefer server + Mongo over client snapshots
 *  - Hard refuse when quality < 30 (no guessing)
 *  - Domain engines for DM / Execution / PreConstruction
 *  Success: UI shows refused vs answered; evals cover refuse + new domains
 *
 * Phase 3 — LLM as narrator only
 *  - Claude may only narrate verified evidence[] (already prompted)
 *  - Reject LLM output that introduces numbers not in evidence
 *
 * Phase 4 — Continuous reliability
 *  - Expand golden set; run ask-ai-eval in CI
 */
export const ASK_AI_ROADMAP_VERSION = '2026-07-13-phase2';
