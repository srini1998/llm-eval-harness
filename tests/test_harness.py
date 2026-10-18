from evalh import metrics, report


def rec(i, answerable, pred, golds, judge_ok, system="s"):
    item = {"answerable": answerable, "answers": golds, "context": "The Normans settled Normandy in 911."}
    return {"id": str(i), "system": system, "config_hash": "x", "model": "m", "answerable": answerable,
            "prediction": pred, "latency_ms": 100, "metrics": metrics.score_item(pred, item),
            "judge": {"supported": judge_ok, "relevant": True, "reason": ""}}


def test_squad_normalization_and_scores():
    assert metrics.normalize("The  Normans!") == "normans"
    assert metrics.exact_match("the Normans", ["Normans"]) == 1.0
    assert round(metrics.token_f1("in Normandy France", ["Normandy"]), 3) == 0.5
    # unanswerable: only an abstention is right, and abstaining on an answerable item scores 0
    assert metrics.exact_match("Unanswerable.", []) == 1.0
    assert metrics.exact_match("911", []) == 0.0
    assert metrics.token_f1("unanswerable", ["911"]) == 0.0


def test_lexical_support_flags_words_missing_from_passage():
    ctx = "The Normans settled Normandy in 911."
    assert metrics.lexical_support("Normandy in 911", ctx) == 1.0
    assert metrics.lexical_support("Vikings from Denmark", ctx) == 0.0
    assert metrics.lexical_support("unanswerable", ctx) is None


def test_judge_calibration_kappa():
    perfect = [rec(1, True, "911", ["911"], True), rec(2, True, "1066", ["911"], False)]
    assert report.calibrate(perfect)["cohen_kappa"] == 1.0
    always_yes = [rec(1, True, "911", ["911"], True), rec(2, True, "1066", ["911"], True)]
    cal = report.calibrate(always_yes)
    assert cal["cohen_kappa"] == 0.0 and cal["judge_pass_when_reference_fails"] == 1.0


def test_gate_fails_on_clear_regression_and_passes_on_noise():
    base = [rec(i, i % 2 == 0, "911" if i % 2 == 0 else "unanswerable", ["911"] if i % 2 == 0 else [], True, "b")
            for i in range(80)]
    # candidate stops abstaining on every unanswerable item
    worse = [rec(i, i % 2 == 0, "911", ["911"] if i % 2 == 0 else [], True, "c") for i in range(80)]
    result = report.gate(base, worse)
    assert not result["passed"] and result["checks"]["abstention_accuracy_unanswerable"]["regressed"]
    # one flipped item out of 80 is within the allowance
    same = [dict(r, system="c") for r in base]
    same[1] = rec(1, False, "911", [], True, "c")
    assert report.gate(base, same)["passed"]


def test_paired_bootstrap_is_deterministic():
    a = report.paired_bootstrap([0, 1, 1, 0], [1, 1, 1, 1], resamples=500, seed=3)
    b = report.paired_bootstrap([0, 1, 1, 0], [1, 1, 1, 1], resamples=500, seed=3)
    assert a == b and a["mean_diff"] == 0.5


def test_api_lists_recorded_runs_and_compares():
    from fastapi.testclient import TestClient

    from evalh.api import app

    client = TestClient(app)
    names = {r["system"] for r in client.get("/runs").json()}
    assert {"grounded-v1", "open-v2"} <= names
    assert client.get("/compare", params={"baseline": "grounded-v1", "candidate": "open-v2"}).json()["passed"] is False
    assert client.get("/runs/../../etc/passwd").status_code == 404
