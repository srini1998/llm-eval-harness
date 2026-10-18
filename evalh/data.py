"""Build a fixed, balanced evaluation sample from the SQuAD v2.0 dev set.

SQuAD v2.0 (Rajpurkar et al., 2018) is CC BY-SA 4.0. Half of the sample is answerable
from the passage, half is deliberately unanswerable. The unanswerable half is what
makes groundedness measurable: a faithful system must say the passage doesn't say.
"""

from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path

SOURCE_URL = "https://rajpurkar.github.io/SQuAD-explorer/dataset/dev-v2.0.json"
SOURCE_SHA256 = "80a5225e94905956a6446d296ca1093975c4d3b3260f1d6c8f68bc2ab77182d8"
ATTRIBUTION = "SQuAD v2.0 dev set, Rajpurkar, Jia & Liang (2018), CC BY-SA 4.0"


def build_sample(raw_path: Path, out_path: Path, per_class: int = 75, seed: int = 2026) -> dict:
    blob = raw_path.read_bytes()
    digest = hashlib.sha256(blob).hexdigest()
    if digest != SOURCE_SHA256:
        raise ValueError(f"unexpected SQuAD file digest {digest}; refusing to build a sample from it")
    data = json.loads(blob)
    answerable, unanswerable = [], []
    for article in data["data"]:
        for para in article["paragraphs"]:
            if len(para["context"]) > 1500:
                continue  # keep prompts short enough for a 3B model's comfortable context
            for qa in para["qas"]:
                item = {
                    "id": qa["id"],
                    "title": article["title"],
                    "context": para["context"],
                    "question": qa["question"],
                    "answers": sorted({a["text"] for a in qa["answers"]}),
                    "answerable": not qa.get("is_impossible", False),
                }
                (answerable if item["answerable"] else unanswerable).append(item)
    rng = random.Random(seed)
    # one question per passage per class keeps the sample from clustering on a few articles
    def pick(pool):
        rng.shuffle(pool)
        seen, chosen = set(), []
        for item in pool:
            if item["context"] in seen:
                continue
            seen.add(item["context"])
            chosen.append(item)
            if len(chosen) == per_class:
                break
        return chosen

    sample = pick(answerable) + pick(unanswerable)
    rng.shuffle(sample)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        for item in sample:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    meta = {
        "source": SOURCE_URL,
        "source_sha256": SOURCE_SHA256,
        "attribution": ATTRIBUTION,
        "seed": seed,
        "items": len(sample),
        "answerable": sum(i["answerable"] for i in sample),
        "unanswerable": sum(not i["answerable"] for i in sample),
        "articles": len({i["title"] for i in sample}),
    }
    out_path.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return meta


def load(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
