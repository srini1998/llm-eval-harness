"""Deterministic metrics: no model is involved, so these are reproducible in CI."""

from __future__ import annotations

import collections
import re
import string

ABSTAIN = "unanswerable"
_ARTICLES = re.compile(r"\b(a|an|the)\b", re.UNICODE)
_PUNCT = set(string.punctuation)
_STOP = {
    "a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or", "is", "was", "were", "are",
    "by", "with", "as", "from", "that", "this", "it", "its", "be", "been",
}


def normalize(text: str) -> str:
    """Official SQuAD normalization: lowercase, drop punctuation and articles, squash spaces."""
    text = text.lower()
    text = "".join(ch for ch in text if ch not in _PUNCT)
    text = _ARTICLES.sub(" ", text)
    return " ".join(text.split())


def is_abstention(answer: str) -> bool:
    a = normalize(answer)
    return a == "" or a == ABSTAIN or a.startswith(ABSTAIN)


def exact_match(prediction: str, golds: list[str]) -> float:
    if not golds:  # unanswerable question: only an abstention is correct
        return float(is_abstention(prediction))
    if is_abstention(prediction):
        return 0.0
    return float(any(normalize(prediction) == normalize(g) for g in golds))


def _f1(pred: str, gold: str) -> float:
    p, g = normalize(pred).split(), normalize(gold).split()
    common = collections.Counter(p) & collections.Counter(g)
    same = sum(common.values())
    if same == 0:
        return 0.0
    precision, recall = same / len(p), same / len(g)
    return 2 * precision * recall / (precision + recall)


def token_f1(prediction: str, golds: list[str]) -> float:
    if not golds:
        return float(is_abstention(prediction))
    if is_abstention(prediction):
        return 0.0
    return max(_f1(prediction, g) for g in golds)


def lexical_support(prediction: str, context: str) -> float | None:
    """Share of the answer's content words that literally occur in the passage.

    A cheap, transparent groundedness proxy: an answer built from words not in the
    passage is likely drawn from the model's memory. Returns None for abstentions.
    """
    if is_abstention(prediction):
        return None
    words = [w for w in normalize(prediction).split() if w not in _STOP]
    if not words:
        return 1.0
    ctx = set(normalize(context).split())
    return sum(w in ctx for w in words) / len(words)


def reference_label(prediction: str, item: dict) -> bool:
    """Ground-truth 'acceptable answer' label used to calibrate the LLM judge.

    Answerable: token F1 >= 0.5 against the human answers. Unanswerable: abstained.
    """
    if not item["answerable"]:
        return is_abstention(prediction)
    return token_f1(prediction, item["answers"]) >= 0.5


def score_item(prediction: str, item: dict) -> dict:
    golds = item["answers"] if item["answerable"] else []
    return {
        "em": exact_match(prediction, golds),
        "f1": token_f1(prediction, golds),
        "abstained": is_abstention(prediction),
        "support": lexical_support(prediction, item["context"]),
        "reference_ok": reference_label(prediction, item),
    }
