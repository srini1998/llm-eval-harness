# Answer Key
An end-user prompt release check. Run `npm ci && npm run dev`. Same on-device Gemma3 1B model, same SQuAD v2 questions, two prompts. English answers are compared with human reference spans using the standard English article/punctuation/case normalization and token-overlap F1. `NO_ANSWER` is exact and case-sensitive. Scoring does not use model self-judgment.

Visitors choose a balanced paired cohort (2–10 questions), edit the candidate instructions and tolerance, download the model explicitly, then run both prompts. The gate requires F1 within tolerance and no drop in abstention on unanswerable items. Partial/stopped cohorts never get a gate verdict. One generation at a time, cancellable worker. Inputs stay on-device; remote requests only download packages and public model weights.

This deliberately tiny, fixed exploratory sample is not a statistically powered release study; repeated tuning on visible references invalidates claims of unseen generalization. Recorded 150-item local Qwen results are clearly separate. The live browser model is Gemma3 1B. References are visible for inspection, not hidden.

Dataset: SQuAD2 dev sample, Rajpurkar/Jia/Liang (2018), CC BY-SA4.0. Full source SHA/seed/attribution in src/data/provenance.json. ThreeUI Community DataField (MIT); self-hosted OFL fonts; GSAP with reduced-motion support. `node tests-metrics.mjs` verifies real normalization, F1 and gate negative cases. No paid API/provider is used.
