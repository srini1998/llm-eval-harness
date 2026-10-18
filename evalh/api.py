"""Read-only HTTP view over recorded runs: summaries, judge calibration and gate results."""

from __future__ import annotations

import html
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse

from . import report
from .run import load_run

RUNS = Path("runs")
app = FastAPI(title="LLM evaluation harness", version="0.1.0")


def _run(name: str) -> list[dict]:
    path = RUNS / f"{name}.jsonl"
    if not name.replace("-", "").replace(".", "").isalnum() or not path.exists():
        raise HTTPException(404, f"no recorded run named {name!r}")
    return load_run(path)


@app.get("/runs")
def list_runs() -> list[dict]:
    return [report.summarize(load_run(p)) for p in sorted(RUNS.glob("*.jsonl"))]


@app.get("/runs/{name}")
def get_run(name: str) -> dict:
    records = _run(name)
    return {"summary": report.summarize(records), "judge_calibration": report.calibrate(records)}


@app.get("/runs/{name}/items")
def get_items(name: str, disagreements_only: bool = False) -> list[dict]:
    records = _run(name)
    if disagreements_only:
        records = [r for r in records if r["judge"]["supported"] != r["metrics"]["reference_ok"]]
    return records


@app.get("/compare")
def compare(baseline: str, candidate: str) -> dict:
    return report.gate(_run(baseline), _run(candidate))


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    rows = []
    for s in list_runs():
        cells = "".join(f"<td>{html.escape(str(s[k]))}</td>" for k in
                        ("system", "items", "f1", "abstention_accuracy_unanswerable",
                         "false_abstention_rate_answerable", "judge_supported_rate", "median_latency_ms"))
        rows.append(f"<tr>{cells}</tr>")
    return (
        "<!doctype html><meta charset=utf-8><title>LLM eval harness</title>"
        "<style>body{font:15px system-ui;margin:2rem;max-width:960px}table{border-collapse:collapse}"
        "td,th{border:1px solid #ccc;padding:.4rem .6rem;text-align:left}</style>"
        "<h1>Recorded evaluation runs</h1><table><tr><th>system</th><th>items</th><th>F1</th>"
        "<th>abstains when unanswerable</th><th>false abstentions</th><th>judge: supported</th>"
        "<th>median ms</th></tr>" + "".join(rows) + "</table>"
        "<p>JSON: <a href=/runs>/runs</a>, <code>/runs/{name}</code>, "
        "<code>/compare?baseline=grounded-v1&candidate=open-v2</code>, <a href=/docs>/docs</a></p>"
    )
