"""Systems under test and the LLM judge prompts.

Two QA prompt configurations are evaluated against each other. ``grounded-v1`` is the
baseline. ``open-v2`` is a plausible-looking "simplification" a teammate might ship:
it drops the abstention rule. The harness should catch that as a regression.
"""

from __future__ import annotations

import hashlib
import json

SYSTEMS = {
    "grounded-v1": {
        "system": (
            "You answer questions using only the given passage. Reply with the shortest exact phrase "
            "from the passage that answers the question, with no explanation. If the passage does not "
            "contain the answer, reply with exactly: unanswerable"
        ),
        "template": "Passage:\n{context}\n\nQuestion: {question}\nAnswer:",
    },
    "open-v2": {
        "system": "You are a helpful assistant. Answer the question briefly, in a few words.",
        "template": "Passage:\n{context}\n\nQuestion: {question}\nAnswer:",
    },
}

JUDGE_SYSTEM = (
    "You are a strict grader for reading-comprehension answers. You see a passage, a question and a "
    "candidate answer. Decide two things.\n"
    "supported: true only if the answer is correct according to the passage. If the answer is "
    "'unanswerable', supported is true only if the passage really does not contain the answer.\n"
    "relevant: true if the answer addresses what the question asks (an 'unanswerable' reply counts as "
    "relevant).\n"
    "Give a one-sentence reason first."
)
JUDGE_TEMPLATE = "Passage:\n{context}\n\nQuestion: {question}\n\nCandidate answer: {answer}"
JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "reason": {"type": "string"},
        "supported": {"type": "boolean"},
        "relevant": {"type": "boolean"},
    },
    "required": ["reason", "supported", "relevant"],
}


def config_hash(name: str) -> str:
    return hashlib.sha256(json.dumps(SYSTEMS[name], sort_keys=True).encode()).hexdigest()[:12]


def judge_hash() -> str:
    blob = json.dumps([JUDGE_SYSTEM, JUDGE_TEMPLATE, JUDGE_SCHEMA], sort_keys=True).encode()
    return hashlib.sha256(blob).hexdigest()[:12]


# Variant: the judge also sees the human reference answers (reference-guided grading).
JUDGE_REF_SYSTEM = (
    "You are a strict grader for reading-comprehension answers. You see a passage, a question, the "
    "human reference answer(s) and a candidate answer. supported: true only if the candidate means the "
    "same as a reference answer. If the reference says the passage does not contain the answer, "
    "supported is true only if the candidate says 'unanswerable'. relevant: true if the candidate "
    "addresses the question. Give a one-sentence reason first."
)
JUDGE_REF_TEMPLATE = "Passage:\n{context}\n\nQuestion: {question}\n\nReference answer(s): {reference}\n\nCandidate answer: {answer}"
