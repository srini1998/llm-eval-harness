"""evalh: build the sample, run systems, summarize, calibrate the judge and gate regressions."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from . import data, report
from .run import load_run, rejudge_reference_guided, run_system

SAMPLE = Path("data/squad_v2_sample.jsonl")


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    p = argparse.ArgumentParser(prog="evalh")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sample", help="build the balanced SQuAD v2 sample")
    s.add_argument("--raw", default="data/raw/dev-v2.0.json")
    s.add_argument("--per-class", type=int, default=75)

    s = sub.add_parser("run", help="run a system + judge with the local Ollama model")
    s.add_argument("system")
    s.add_argument("--model", default="qwen2.5:3b")
    s.add_argument("--judge-model", default="qwen2.5:3b")
    s.add_argument("--limit", type=int)

    s = sub.add_parser("rejudge", help="re-grade a recorded run with the reference-guided judge")
    s.add_argument("run")
    s.add_argument("--judge-model", default="qwen2.5:3b")

    s = sub.add_parser("summary", help="metrics and judge calibration for a recorded run")
    s.add_argument("run")

    s = sub.add_parser("gate", help="exit 1 if the candidate regresses against the baseline")
    s.add_argument("baseline")
    s.add_argument("candidate")
    s.add_argument("--report")

    s = sub.add_parser("serve", help="browse recorded runs over HTTP")
    s.add_argument("--port", type=int, default=8765)

    args = p.parse_args(argv)
    if args.cmd == "sample":
        print(json.dumps(data.build_sample(Path(args.raw), SAMPLE, args.per_class), indent=2))
    elif args.cmd == "run":
        items = data.load(SAMPLE)[: args.limit]
        out = run_system(args.system, items, Path(f"runs/{args.system}.jsonl"), args.model, args.judge_model)
        print(json.dumps(report.summarize(load_run(out)), indent=2))
    elif args.cmd == "rejudge":
        out = rejudge_reference_guided(Path(args.run), data.load(SAMPLE), args.judge_model)
        print(json.dumps(report.calibrate(load_run(out)), indent=2))
    elif args.cmd == "summary":
        records = load_run(Path(args.run))
        print(json.dumps({"summary": report.summarize(records), "judge_calibration": report.calibrate(records)}, indent=2))
    elif args.cmd == "gate":
        result = report.gate(load_run(Path(args.baseline)), load_run(Path(args.candidate)))
        text = json.dumps(result, indent=2)
        if args.report:
            Path(args.report).write_text(text + "\n")
        print(text)
        print("GATE PASSED" if result["passed"] else "GATE FAILED: candidate regressed", file=sys.stderr)
        sys.exit(0 if result["passed"] else 1)
    elif args.cmd == "serve":
        import uvicorn

        uvicorn.run("evalh.api:app", host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
