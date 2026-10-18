# LLM Evaluation Harness

A regression gate for LLM features. It answers two questions before a prompt or model change ships:

1. **Did quality get worse?** Paired, item-level comparison on a fixed sample, with bootstrap
   confidence intervals, so a noisy one-item flip doesn't block a release but a real drop does.
2. **Can the LLM judge be trusted?** Its verdicts are *calibrated* against human-labeled answers
   before anyone relies on them.

Everything runs on a free local model (Ollama `qwen2.5:3b`). CI re-scores committed run files
deterministically, so it needs no model and no API key.

## The task: grounded question answering

The sample is 150 questions from the **SQuAD v2.0 dev set** (CC BY-SA 4.0): 75 are answerable from
the passage and 75 are deliberately *not*. The unanswerable half is what makes groundedness
measurable. A faithful system must say "unanswerable" instead of answering from memory. The sample
is balanced, seeded, uses one question per passage, and the source file is checksum-pinned
(`data/squad_v2_sample.meta.json`).

Two prompt configurations are compared:

| System | What it does |
|---|---|
| `grounded-v1` (baseline) | Answer with the shortest phrase from the passage, or exactly `unanswerable`. |
| `open-v2` (candidate) | A plausible-looking "simplification": *answer briefly*, with no abstention rule. |

## Metrics

| Metric | Kind | Meaning |
|---|---|---|
| Exact match, token F1 | deterministic | Official SQuAD normalization against the human answers |
| Abstention accuracy | deterministic | On unanswerable questions, did it say so? |
| False-abstention rate | deterministic | On answerable questions, did it wrongly refuse? |
| Lexical support | deterministic | Share of the answer's content words that occur in the passage |
| Judge: supported / relevant | LLM-as-judge | Local model grades correctness against the passage |

## Results (recorded in `runs/` and `docs/`)

| | grounded-v1 | open-v2 |
|---|---|---|
| Token F1 (all 150) | **0.715** | 0.380 |
| F1 on answerable | **0.816** | 0.760 |
| Abstains when unanswerable | **61.3%** | 0.0% |
| False abstentions when answerable | 9.3% | **0.0%** |
| Lexical support | **0.99** | 0.84 |

**Gate (`docs/gate-open-v2.json`): FAILED, as it should.** F1 dropped by 0.33 (95% CI −0.42 to
−0.25) and abstention accuracy by 0.61 (CI −0.72 to −0.51). Both exceed their allowances (0.02 and
0.05) with the whole interval below zero. The baseline gated against itself passes.

### Judge calibration: the important finding

The judge's `supported` verdict is compared with a reference label built from the human SQuAD
answers (token F1 ≥ 0.5, or a correct abstention):

| Judge | Run | Agreement | Cohen's κ | Passes answers the reference fails |
|---|---|---|---|---|
| Passage-only (3B) | grounded-v1 | 72.7% | **0.04** | **95%** |
| Passage-only (3B) | open-v2 | 49.3% | 0.13 | 84% |
| Reference-guided (3B) | grounded-v1 | 90.0% | **0.72** | 37% |
| Reference-guided (3B) | open-v2 | 82.0% | 0.65 | 28% |

A small model grading from the passage alone is **barely better than chance**: it approves almost
everything. Shown the reference answers, it becomes useful but still approves roughly a third of
wrong answers. That's why the gate is built on the deterministic metrics, and the judge is reported
with its calibration instead of being trusted blindly.

## Run it

```bash
ollama pull qwen2.5:3b                 # free, local
uv sync
curl -sSfLo data/raw/dev-v2.0.json https://rajpurkar.github.io/SQuAD-explorer/dataset/dev-v2.0.json
uv run evalh sample                    # rebuilds the identical 150-item sample (checksum-verified)
uv run evalh run grounded-v1           # answers + judge, resumable
uv run evalh run open-v2
uv run evalh rejudge runs/grounded-v1.jsonl     # reference-guided judge variant
uv run evalh summary runs/grounded-v1.jsonl     # metrics + judge calibration
uv run evalh gate runs/grounded-v1.jsonl runs/open-v2.jsonl   # exit 1 on regression
uv run evalh serve                     # http://127.0.0.1:8765 - runs, items, /compare, /docs
uv run pytest
```

To gate a real change: run it locally to produce `runs/candidate.jsonl` and commit it. The
`eval-gate` workflow gates it against the baseline on every push.

## Limits

- 150 items and one 3B model. The numbers describe this setup, not LLMs in general.
- The judge and the system under test are the same model, which is a known source of bias.
- Lexical support is a proxy: a paraphrase built from passage words can still be wrong.
- Model calls run locally, so CI checks recorded outputs and doesn't regenerate them.
