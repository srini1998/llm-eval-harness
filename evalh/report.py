"""Summaries, judge calibration and the regression gate. All deterministic given a run file."""

from __future__ import annotations

import random
from statistics import mean


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return round(mean(xs), 4) if xs else None


def summarize(records: list[dict]) -> dict:
    ans = [r for r in records if r["answerable"]]
    unans = [r for r in records if not r["answerable"]]
    m = lambda rs, k: _mean([r["metrics"][k] for r in rs])
    return {
        "system": records[0]["system"] if records else None,
        "config_hash": records[0]["config_hash"] if records else None,
        "model": records[0]["model"] if records else None,
        "items": len(records),
        "exact_match": m(records, "em"),
        "f1": m(records, "f1"),
        "f1_answerable": m(ans, "f1"),
        "abstention_accuracy_unanswerable": m(unans, "em"),
        "false_abstention_rate_answerable": _mean([float(r["metrics"]["abstained"]) for r in ans]),
        "lexical_support": m(records, "support"),
        "judge_supported_rate": _mean([float(r["judge"]["supported"]) for r in records]),
        "judge_relevant_rate": _mean([float(r["judge"]["relevant"]) for r in records]),
        "median_latency_ms": sorted(r["latency_ms"] for r in records)[len(records) // 2] if records else None,
    }


def calibrate(records: list[dict]) -> dict:
    """How far can the LLM judge be trusted? Compare its 'supported' verdict with the
    reference label derived from human SQuAD answers (F1 >= 0.5, or correct abstention)."""
    tp = sum(r["judge"]["supported"] and r["metrics"]["reference_ok"] for r in records)
    tn = sum(not r["judge"]["supported"] and not r["metrics"]["reference_ok"] for r in records)
    fp = sum(r["judge"]["supported"] and not r["metrics"]["reference_ok"] for r in records)
    fn = sum(not r["judge"]["supported"] and r["metrics"]["reference_ok"] for r in records)
    n = tp + tn + fp + fn
    if n == 0:
        return {"items": 0}
    po = (tp + tn) / n
    p_yes = ((tp + fp) / n) * ((tp + fn) / n)
    p_no = ((tn + fn) / n) * ((tn + fp) / n)
    pe = p_yes + p_no
    kappa = (po - pe) / (1 - pe) if pe < 1 else 0.0
    return {
        "items": n,
        "agreement": round(po, 4),
        "cohen_kappa": round(kappa, 4),
        "judge_pass_when_reference_fails": round(fp / (fp + tn), 4) if fp + tn else None,
        "judge_fail_when_reference_passes": round(fn / (fn + tp), 4) if fn + tp else None,
        "confusion": {"tp": tp, "tn": tn, "fp": fp, "fn": fn},
    }


def paired_bootstrap(base: list[float], cand: list[float], resamples: int = 10_000, seed: int = 0) -> dict:
    """95% CI for mean(candidate - baseline) over the same items."""
    diffs = [c - b for b, c in zip(base, cand)]
    rng = random.Random(seed)
    n = len(diffs)
    stats = sorted(sum(diffs[rng.randrange(n)] for _ in range(n)) / n for _ in range(resamples))
    return {
        "mean_diff": round(sum(diffs) / n, 4),
        "ci95": [round(stats[int(0.025 * resamples)], 4), round(stats[int(0.975 * resamples) - 1], 4)],
    }


GATES = {
    # metric key -> (per-item extractor, allowed drop in the mean)
    "f1": (lambda r: r["metrics"]["f1"], 0.02),
    "abstention_accuracy_unanswerable": (lambda r: r["metrics"]["em"] if not r["answerable"] else None, 0.05),
}


def gate(baseline: list[dict], candidate: list[dict]) -> dict:
    """Fail when a metric drops by more than its allowance AND the drop is statistically
    clear (the whole 95% CI is below zero). Both conditions guard against noise."""
    b_by_id = {r["id"]: r for r in baseline}
    pairs = [(b_by_id[r["id"]], r) for r in candidate if r["id"] in b_by_id]
    checks = {}
    for key, (get, allowed) in GATES.items():
        b_vals, c_vals = [], []
        for b, c in pairs:
            bv, cv = get(b), get(c)
            if bv is None or cv is None:
                continue
            b_vals.append(float(bv))
            c_vals.append(float(cv))
        if not b_vals:
            continue
        boot = paired_bootstrap(b_vals, c_vals)
        regressed = boot["mean_diff"] < -allowed and boot["ci95"][1] < 0
        checks[key] = {"items": len(b_vals), "allowed_drop": allowed, **boot, "regressed": regressed}
    return {
        "paired_items": len(pairs),
        "baseline": baseline[0]["system"] if baseline else None,
        "candidate": candidate[0]["system"] if candidate else None,
        "checks": checks,
        "passed": not any(c["regressed"] for c in checks.values()),
    }
