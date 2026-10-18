import { createRoot } from "react-dom/client";
import { useState, useRef } from "react";
import { DataField } from "@designcodeio/threeui/components/DataField";
import { ArrowUpRight, CheckSquare } from "@phosphor-icons/react";
import data from "./data/squad.json";
import replay from "./data/replay.json";
import provenance from "./data/provenance.json";
import recorded from "./data/baseline.json";
import { metric, gate } from "./metrics";
import { useModel } from "./ai/useModel";
import { Shell, Trace, ModelControl, useLanguage } from "./ui";
import "./styles.css";
const baselinePrompt =
  "Answer the question using only the passage. Reply with the shortest exact answer span. If the passage does not contain the answer, reply exactly NO_ANSWER. Do not explain.";
type Item = (typeof data)[number];
type Scored = {
  item: Item;
  baseline: string;
  candidate: string;
  b: ReturnType<typeof metric>;
  c: ReturnType<typeof metric>;
};
const percent = (n: number) => (n * 100).toFixed(1) + "%";
function App() {
  const { ja, t, toggle } = useLanguage(),
    ai = useModel();
  const [prompt, setPrompt] = useState(
      "Answer the question concisely. Use your general knowledge if the passage is incomplete.",
    ),
    [count, setCount] = useState(4),
    [tolerance, setTolerance] = useState(0.02),
    [results, setResults] = useState<Scored[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [entries, setEntries] = useState<unknown[]>([]),
    [manual, setManual] = useState("1872");
  const [topic, setTopic] = useState("Travel & places"),
    [quizIndex, setQuizIndex] = useState(0),
    [scored, setScored] = useState(false),
    [mode, setMode] = useState("");
  const travelTitles = [
    "Fresno,_California",
    "Jacksonville,_Florida",
    "Southern_California",
    "Victoria_(Australia)",
    "Warsaw",
    "Rhine",
    "Amazon_rainforest",
  ];
  const pool =
    topic === "All topics"
      ? data
      : data.filter((d) => travelTitles.includes(d.title));
  const quiz = pool[quizIndex] ?? pool[0];
  const stop = useRef(false);
  const sample = Array.from(
    { length: count },
    (_, i) =>
      pool.filter((d) => d.answerable === (i % 2 === 0))[Math.floor(i / 2)],
  );
  const complete = results.length === count && !busy;
  const decision = complete
    ? gate(
        results.map((r) => r.b),
        results.map((r) => r.c),
        results.map((r) => r.item.answerable),
        tolerance,
      )
    : null;
  const log = (entry: unknown) => setEntries((e) => [...e, entry]);
  async function run() {
    setMode("Fresh cloud run");
    stop.current = false;
    setBusy(true);
    setResults([]);
    setMessage("");
    const currentPrompt = prompt;
    try {
      for (const item of sample) {
        if (stop.current) break;
        const outputs: string[] = [];
        for (const [system, instruction] of [
          ["baseline", baselinePrompt],
          ["candidate", currentPrompt],
        ]) {
          if (stop.current) break;
          setMessage(`${system} · ${item.question}`);
          const messages = [
            {
              role: "user",
              content: `${instruction}\n\nPassage: ${item.context}\nQuestion: ${item.question}\nAnswer:`,
            },
          ];
          const r = await ai.generate(messages, undefined, 72);
          outputs.push(r.text.trim());
          log({ system, id: item.id, messages, ...r });
        }
        if (outputs.length === 2) {
          const [b, c] = outputs;
          setResults((rs) => [
            ...rs,
            {
              item,
              baseline: b,
              candidate: c,
              b: metric(b, item.answers),
              c: metric(c, item.answers),
            },
          ]);
        }
      }
      setMessage(
        stop.current
          ? t(
              "Stopped. Incomplete cohorts cannot pass the gate.",
              "停止しました。未完了の評価では合格しません。",
            )
          : t(
              "Paired run complete. Inspect every answer before you release.",
              "比較が完了しました。リリース前に各回答を確認してください。",
            ),
      );
    } catch (e) {
      setMessage(String(e));
      log({ error: String(e) });
    } finally {
      setBusy(false);
    }
  }
  function halt() {
    stop.current = true;
    ai.stop();
  }
  return (
    <Shell name="answer key" number="04" ja={ja} toggle={toggle}>
      <section className="hero">
        <div className="shader" aria-hidden="true">
          <DataField />
        </div>
        <div className="hero-copy">
          <p className="eyebrow reveal">
            {t(
              "A TRAVEL BOT SHOULD KNOW WHEN TO SAY “I DON’T KNOW.”",
              "プロンプトを公開する前に、答えを確かめる。",
            )}
          </p>
          <h1 className="reveal">
            {t("Know the place?", "自信がある？")}
            <br />
            <span>{t("Prove it.", "確かめよう。")}</span>
          </h1>
          <p className="intro reveal">
            {t(
              "Try a travel reading challenge, then see how two AI prompts answered the same questions. The passage is the source of truth for this task. A confident guess still loses points.",
              "親切そうなプロンプトで、かえって精度が下がることがあります。同じ質問で基準と比較し、正解に照らして確認しましょう。",
            )}
          </p>
          <a href="#quiz" className="cta reveal">
            {t("Try the reading challenge", "プロンプトを試す")}
            <ArrowUpRight size={20} />
          </a>
        </div>
        <div className="answer-stamp reveal">
          <CheckSquare size={44} />
          <span>SQuAD 2.0</span>
          <strong>33 questions</strong>
          <p>
            {t(
              "travel questions, including missing answers",
              "回答可能 ＋ 回答不可能",
            )}
          </p>
          <span>{t("A REAL PUBLIC ANSWER KEY", "公開データの実際の正解")}</span>
        </div>
      </section>
      <main id="test">
        <div className="section-head">
          <div>
            <p className="eyebrow">
              {t("YOUR NEXT PROMPT, UNDER TEST", "次のプロンプトをテスト")}
            </p>
            <h2>{t("Would you release it?", "公開しても大丈夫？")}</h2>
          </div>
          <span>
            {t("Same model. Same questions.", "同じモデル。同じ質問。")}
          </span>
        </div>
        <section id="quiz" className="reading-challenge">
          <div>
            <p className="eyebrow">01 / CAN YOU FIND THE ANSWER?</p>
            <h2>A little travel trivia.</h2>
            <p>
              Read the passage and answer from that passage only. If the detail
              is missing, type NO_ANSWER. These are historical
              reading-comprehension passages, not current travel advice.
            </p>
            <label htmlFor="topic">Question collection</label>
            <select
              id="topic"
              disabled={busy}
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                setQuizIndex(0);
                setManual("");
                setScored(false);
                setResults([]);
                setMessage("");
                setMode("");
              }}
            >
              <option>Travel &amp; places</option>
              <option>All topics</option>
            </select>
            <label htmlFor="quiz-question">Choose a question</label>
            <select
              id="quiz-question"
              value={quizIndex}
              onChange={(e) => {
                setQuizIndex(Number(e.target.value));
                setManual("");
                setScored(false);
              }}
            >
              {pool.map((q, i) => (
                <option key={q.id} value={i}>
                  {i + 1}. {q.title.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <article className="quiz-card">
            <p className="eyebrow">{quiz.title.replaceAll("_", " ")}</p>
            <h3>{quiz.question}</h3>
            <p className="passage">{quiz.context}</p>
            <label htmlFor="quiz-answer">Your answer</label>
            <input
              id="quiz-answer"
              value={manual}
              maxLength={1000}
              placeholder="Answer, or NO_ANSWER"
              onChange={(e) => {
                setManual(e.target.value);
                setScored(false);
              }}
            />
            <button className="cta" onClick={() => setScored(true)}>
              Check my answer
            </button>
            {scored && (
              <div className="quiz-score" role="status">
                <strong>
                  Exact match {percent(metric(manual, quiz.answers).em)} · Word
                  overlap {percent(metric(manual, quiz.answers).f1)}
                </strong>
                <p>
                  Reference:{" "}
                  {quiz.answers.join(" / ") ||
                    "NO_ANSWER—this passage does not contain the answer."}
                </p>
                <p>
                  Word overlap gives partial credit; it is not a general truth
                  detector.
                </p>
              </div>
            )}
          </article>
        </section>
        <div className="section-head">
          <div>
            <p className="eyebrow">02 / CHECK THE AI ANSWERS</p>
            <h2>Does the bot know when to stop?</h2>
          </div>
          <span>
            {topic} · {pool.length} questions
          </span>
        </div>
        <div className="replay-start">
          <h3>Explore the real saved experiment</h3>
          <p>
            Load two actual Qwen 2.5 3B outputs per question and score them
            again against the human references. One prompt required passage-only
            answers and abstention; the other asked a helpful assistant for a
            brief answer. This replay does not use the editable cloud prompt
            below.
          </p>
          <label htmlFor="replay-size">Questions to compare</label>
          <select
            id="replay-size"
            disabled={busy}
            value={count}
            onChange={(e) => {
              setCount(Number(e.target.value));
              setResults([]);
              setMessage("");
              setMode("");
            }}
          >
            {[2, 4, 6, 10].map((n) => (
              <option key={n} value={n}>
                {n} paired questions
              </option>
            ))}
          </select>
          <button
            className="cta"
            disabled={busy}
            onClick={() => {
              const rows = sample.map((item) => {
                const r = (
                  replay as Record<
                    string,
                    Record<string, { prediction: string }>
                  >
                )[item.id];
                return {
                  item,
                  baseline: r.baseline.prediction,
                  candidate: r.candidate.prediction,
                  b: metric(r.baseline.prediction, item.answers),
                  c: metric(r.candidate.prediction, item.answers),
                };
              });
              setResults(rows);
              setMode("Recorded Qwen replay / original experiment prompts");
              setMessage(
                "Recorded outputs loaded and re-scored. No new model generation.",
              );
              log({
                action: "re-score-recorded",
                ids: sample.map((i) => i.id),
              });
            }}
          >
            Replay &amp; score saved AI answers
          </button>
        </div>
        <div className="test-grid">
          <section className="prompt-panel">
            <details>
              <summary>Generate a new comparison (optional cloud)</summary>
              <label htmlFor="candidate">
                {t("Your candidate instructions", "候補の指示")}
              </label>
              <textarea
                id="candidate"
                value={prompt}
                disabled={busy}
                maxLength={1500}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setResults([]);
                  setMessage("");
                }}
              />
              <details>
                <summary>
                  {t("See the baseline instructions", "基準の指示を見る")}
                </summary>
                <p>{baselinePrompt}</p>
              </details>
              <div className="options">
                <label>
                  {t("Paired questions", "比較する質問数")}
                  <select
                    disabled={busy}
                    value={count}
                    onChange={(e) => {
                      setCount(Number(e.target.value));
                      setResults([]);
                      setMessage("");
                    }}
                  >
                    {[2, 4, 6, 10].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Allowed F1 drop", "許容 F1 低下")}
                  <select
                    disabled={busy}
                    value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                  >
                    {[0, 0.02, 0.05].map((n) => (
                      <option key={n} value={n}>
                        {percent(n)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <ModelControl
                state={ai.state}
                load={ai.load}
                stop={halt}
                ja={ja}
              />
              <button
                className="cta"
                disabled={busy || ai.state.phase !== "ready"}
                onClick={run}
              >
                {busy
                  ? t("Comparing…", "比較中…")
                  : t("Run paired comparison", "比較を実行")}
              </button>
              {busy && <button onClick={halt}>{t("Stop", "停止")}</button>}
            </details>
            <output role="status">{message}</output>
            <p className="note">
              {t(
                "2–10 questions × two prompts. Replay is immediate. New cloud generations require a free provider connection and send the task text to that provider.",
                "2〜10問×2種類の指示。CPU では数分かかる場合があります。操作するまで生成しません。",
              )}
            </p>
          </section>
          <section className="score-panel">
            <p className="eyebrow">{mode || "THE COMPARISON"}</p>
            <h3>
              {decision
                ? decision.pass
                  ? t("Cleared this small check.", "小規模チェックに合格。")
                  : t("Keep the baseline.", "基準を維持する。")
                : t("Good answers first.", "まず、正しい答えを。")}
            </h3>
            {decision ? (
              <>
                <div className="score-pair">
                  <div>
                    <small>Baseline F1</small>
                    <strong>{percent(decision.baselineF1)}</strong>
                  </div>
                  <div>
                    <small>Candidate F1</small>
                    <strong>{percent(decision.candidateF1)}</strong>
                  </div>
                </div>
                <p>
                  {t("Unanswerable abstention", "回答不可能な問題での棄権")}:{" "}
                  {percent(decision.baselineAbstention ?? 0)} →{" "}
                  {percent(decision.candidateAbstention ?? 0)}
                </p>
                <p>
                  {t(
                    "Pass requires no abstention regression and F1 within your allowed drop. This tiny sample cannot establish statistical significance.",
                    "棄権率の悪化がなく、F1 が許容範囲内なら合格です。少数サンプルで統計的な有意性は示せません。",
                  )}
                </p>
              </>
            ) : (
              <p>
                {t(
                  "We check answer words against human references. A fluent model does not grade itself. Partial or stopped runs never get a release verdict.",
                  "人間の参照回答と単語を照合します。流暢さで AI 自身が採点するわけではありません。途中停止した評価には判定を出しません。",
                )}
              </p>
            )}
            <div className="progress">
              <i style={{ width: (results.length / count) * 100 + "%" }} />
            </div>
            <small>
              {results.length} / {count} {t("pairs complete", "組 完了")}
            </small>
          </section>
        </div>
        <section className="answers">
          <h3>{t("Open the answer book.", "回答をひらく。")}</h3>
          {(results.length ? results.map((r) => r.item) : sample).map(
            (item, i) => {
              const r = results.find((v) => v.item.id === item.id);
              return (
                <article key={item.id}>
                  <span className="number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h4>{item.question}</h4>
                    <p className="passage">{item.context}</p>
                    <div className="answer-columns">
                      <div>
                        <small>{t("Human reference", "参照回答")}</small>
                        <b>{item.answers.join(" / ") || "NO_ANSWER"}</b>
                      </div>
                      <div>
                        <small>Baseline · F1 {r ? percent(r.b.f1) : "—"}</small>
                        <b>{r?.baseline ?? "—"}</b>
                      </div>
                      <div>
                        <small>
                          Candidate · F1 {r ? percent(r.c.f1) : "—"}
                        </small>
                        <b>{r?.candidate ?? "—"}</b>
                      </div>
                    </div>
                  </div>
                </article>
              );
            },
          )}
        </section>
        <section id="how" className="how">
          <p className="eyebrow">{t("WHY THIS EXISTS", "何に役立つか")}</p>
          <h2>
            {t(
              "An assistant that knows when it doesn’t know.",
              "分からないときに、分からないと言える AI。",
            )}
          </h2>
          <p>
            {t(
              "A support assistant should answer from the documentation or admit the answer is missing. Asking it to “use your general knowledge” may turn missing information into a confident mistake. In the full collection, half the questions deliberately have no answer in the passage; the travel subset has 15 answerable and 18 unanswerable questions. You can see the tradeoff before a prompt change reaches users.",
              "サポート AI は文書に基づいて答え、情報がなければ棄権すべきです。一般知識の利用を指示すると、欠落情報を誤って補うことがあります。ここでは半分が回答不可能な質問なので、変更の影響を確認できます。",
            )}
          </p>
          <div className="record">
            <strong>0.715 → 0.380 F1</strong>
            <p>
              {t(
                "Recorded local Qwen 2.5 3B, all 150 original questions. The open-answer prompt regressed; the gate rejected it. The travel replay above uses a subset and computes its own scores. New cloud runs use a different model and are labeled separately.",
                "記録済み Qwen 2.5 3B、150問。一般回答プロンプトは悪化し、ゲートで拒否されました。ブラウザは別の Gemma 3 1B を使用し、新しい結果は上に表示されます。",
              )}
            </p>
            <span>
              {t("Baseline exact match", "基準の完全一致")}:{" "}
              {percent(recorded.summary.exact_match)}
            </span>
          </div>
          <a href="https://github.com/srini1998/llm-eval-harness">
            {t("Source & evaluation methodology", "ソースと評価方法")} ↗
          </a>{" "}
          ·{" "}
          <a href="https://rajpurkar.github.io/SQuAD-explorer/">
            SQuAD v2 · CC BY-SA 4.0 ↗
          </a>
          <details>
            <summary>{t("Source provenance", "データの出典")}</summary>
            <pre>{JSON.stringify(provenance, null, 2)}</pre>
          </details>
        </section>
      </main>
      <Trace ja={ja} entries={entries} />
    </Shell>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
