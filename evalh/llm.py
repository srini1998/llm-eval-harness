"""Minimal client for a local Ollama server. No hosted APIs, no keys, no cost."""

from __future__ import annotations

import json
import os
import time

import httpx

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")


class LLMError(RuntimeError):
    pass


def model_digest(model: str) -> str:
    r = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=10)
    r.raise_for_status()
    for m in r.json()["models"]:
        if m["name"] == model:
            return m["digest"]
    raise LLMError(f"model {model!r} is not pulled in the local Ollama server")


def chat(model: str, system: str, user: str, *, schema: dict | None = None, temperature: float = 0.0,
         seed: int = 7, max_tokens: int = 200, retries: int = 2) -> tuple[str, float]:
    """Return (content, latency_ms). With ``schema``, Ollama constrains the output to that JSON schema."""
    body = {
        "model": model,
        "stream": False,
        "options": {"temperature": temperature, "seed": seed, "num_predict": max_tokens},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    if schema is not None:
        body["format"] = schema
    last: Exception | None = None
    for attempt in range(retries + 1):
        t0 = time.perf_counter()
        try:
            r = httpx.post(f"{OLLAMA_URL}/api/chat", json=body, timeout=120)
            r.raise_for_status()
            content = r.json()["message"]["content"]
            if schema is not None:
                json.loads(content)  # surface malformed structured output as a retryable error
            return content, (time.perf_counter() - t0) * 1000
        except (httpx.HTTPError, json.JSONDecodeError, KeyError) as exc:
            last = exc
            time.sleep(1 + attempt)
    raise LLMError(f"local model call failed after {retries + 1} attempts: {last}")
