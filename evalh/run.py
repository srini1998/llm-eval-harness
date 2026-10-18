"""Execute a system and the judge over the sample, writing one JSON line per item.

Runs are resumable: items already present in the output file are skipped, so a long
local run can be interrupted without losing work.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from . import llm, metrics
from .systems import (JUDGE_REF_SYSTEM, JUDGE_REF_TEMPLATE, JUDGE_SCHEMA, JUDGE_SYSTEM, JUDGE_TEMPLATE, SYSTEMS,
                      config_hash, judge_hash)

log = logging.getLogger("evalh")


def _done_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {json.loads(line)["id"] for line in path.read_text().splitlines() if line.strip()}


def answer(system: str, model: str, item: dict) -> tuple[str, float]:
    cfg = SYSTEMS[system]
    text, ms = llm.chat(model, cfg["system"], cfg["template"].format(**item), max_tokens=60)
    return text.strip().splitlines()[0].strip() if text.strip() else "", ms


def judge(model: str, item: dict, prediction: str, reference_guided: bool = False) -> dict:
    fields = {"context": item["context"], "question": item["question"], "answer": prediction or "(empty)"}
    if reference_guided:
        fields["reference"] = " | ".join(item["answers"]) if item["answerable"] else "The passage does not contain the answer."
        system, template = JUDGE_REF_SYSTEM, JUDGE_REF_TEMPLATE
    else:
        system, template = JUDGE_SYSTEM, JUDGE_TEMPLATE
    content, ms = llm.chat(model, system, template.format(**fields), schema=JUDGE_SCHEMA, max_tokens=160)
    verdict = json.loads(content)
    return {"supported": bool(verdict["supported"]), "relevant": bool(verdict["relevant"]),
            "reason": str(verdict["reason"])[:300], "latency_ms": round(ms)}


def run_system(system: str, items: list[dict], out: Path, model: str, judge_model: str) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    done = _done_ids(out)
    header = {
        "system": system,
        "config_hash": config_hash(system),
        "model": model,
        "model_digest": llm.model_digest(model),
        "judge_model": judge_model,
        "judge_digest": llm.model_digest(judge_model),
        "judge_hash": judge_hash(),
    }
    with out.open("a") as f:
        for n, item in enumerate(items, 1):
            if item["id"] in done:
                continue
            prediction, ms = answer(system, model, item)
            record = {
                "id": item["id"],
                **header,
                "answerable": item["answerable"],
                "prediction": prediction,
                "latency_ms": round(ms),
                "metrics": metrics.score_item(prediction, item),
                "judge": judge(judge_model, item, prediction),
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            f.flush()
            if n % 10 == 0:
                log.info("%s: %d/%d", system, n, len(items))
    return out


def load_run(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def rejudge_reference_guided(run_path: Path, items: list[dict], judge_model: str) -> Path:
    """Re-grade a recorded run with the reference-guided judge; answers are not regenerated."""
    by_id = {i["id"]: i for i in items}
    out = run_path.with_name(run_path.stem + ".refjudge.jsonl")
    done = _done_ids(out)
    with out.open("a") as f:
        for rec in load_run(run_path):
            if rec["id"] in done:
                continue
            rec = {**rec, "system": rec["system"] + "+refjudge",
                   "judge": judge(judge_model, by_id[rec["id"]], rec["prediction"], reference_guided=True)}
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            f.flush()
    return out
