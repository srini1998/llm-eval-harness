# Travel reading and AI-answer checking

The immediate reading challenge uses 33 travel/place questions from the existing SQuAD v2 sample: 15 answerable and 18 deliberately unanswerable. These historical Wikipedia-derived passages are reading tasks, not current destination advice. All 150 original questions remain available under All topics. Source attribution and CC BY-SA notices are retained.

Actual saved Qwen 2.5 3B outputs for grounded-v1/open-v2 are replayed and re-scored. The original recorded prompts differ from the editable optional cloud instructions; replay is labeled explicitly and ignores the edited cloud prompt. All 300 saved answers reproduce the backend EM, token F1 and abstention values exactly. No generated output is claimed to be new during replay.

Fresh cloud paired runs are optional, fail closed without a confirmed Groq Free Plan key, and send passages/questions to that provider. No key/billing/paid fallback configured. Cohort and prompt edits invalidate results; incomplete runs receive no gate verdict. Tiny fixed cohorts remain exploratory, not statistically powered.

Verification: build; 8 original metric checks; 300 replay parity checks; actual Chrome quiz positive/negative, edit invalidation, 4/10-pair replay, cohort invalidation, English-only and 390px. No model-weight requests.
