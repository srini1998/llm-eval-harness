# Travel reading and AI-answer checking

The immediate reading challenge uses 33 travel/place questions from the existing SQuAD v2 sample: 15 answerable and 18 deliberately unanswerable. These historical Wikipedia-derived passages are reading tasks, not current destination advice. All 150 original questions remain available under All topics. Source attribution and CC BY-SA notices are retained.

Actual saved Qwen 2.5 3B outputs for grounded-v1/open-v2 are replayed and re-scored. The original recorded prompts differ from the editable optional cloud instructions; replay is labeled explicitly and ignores the edited cloud prompt. All 300 saved answers reproduce the backend EM, token F1 and abstention values exactly. No generated output is claimed to be new during replay.

Fresh cloud paired runs are optional, fail closed without a confirmed Groq Free Plan key, and send passages/questions to that provider. No key/billing/paid fallback configured. Cohort and prompt edits invalidate results; incomplete runs receive no gate verdict. Tiny fixed cohorts remain exploratory, not statistically powered.

Verification: build; 8 original metric checks; 300 replay parity checks; actual Chrome quiz positive/negative, edit invalidation, 4/10-pair replay, cohort invalidation, English-only and 390px. No model-weight requests.

## Fresh cloud runs (Oct 22, 2026)
"Generate a new comparison (optional cloud)" sends each passage+question to openai/gpt-oss-20b on Groq's free plan through server-side api/generate.js (≤72 output tokens per answer, 2 or 4 questions = at most 8 calls per run, per-IP 12/min and 60/day, 300/day per instance, Groq free account quota as hard backstop; 429 with no paid fallback). Every answer is graded by code (src/metrics.ts exact match/F1 against the human SQuAD references plus abstention on unanswerable items) and the release gate decides; the model never grades itself. The status line reports model, call count and total latency. Without GROQ_API_KEY + GROQ_FREE_PLAN_CONFIRMED=true the endpoint returns 503 before any provider call; recorded replay is unaffected.
