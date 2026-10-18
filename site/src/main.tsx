import { createRoot } from "react-dom/client";
import { useState, useRef } from "react";
import { DataField } from "@designcodeio/threeui/components/DataField";
import { ArrowUpRight, CheckSquare } from "@phosphor-icons/react";
import data from "./data/squad.json";
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
  const stop = useRef(false);
  const sample = Array.from(
    { length: count },
    (_, i) =>
      data.filter((d) => d.answerable === (i % 2 === 0))[Math.floor(i / 2)],
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
              "CHECK THE ANSWERS BEFORE YOU SHIP THE PROMPT.",
              "プロンプトを公開する前に、答えを確かめる。",
            )}
          </p>
          <h1 className="reveal">
            {t("Confident?", "自信がある？")}
            <br />
            <span>{t("Check it.", "確かめよう。")}</span>
          </h1>
          <p className="intro reveal">
            {t(
              "A friendlier prompt can quietly make your assistant worse. Put it beside a grounded baseline, ask the same questions, and see which answers survive the answer key.",
              "親切そうなプロンプトで、かえって精度が下がることがあります。同じ質問で基準と比較し、正解に照らして確認しましょう。",
            )}
          </p>
          <a href="#test" className="cta reveal">
            {t("Test your prompt", "プロンプトを試す")}
            <ArrowUpRight size={20} />
          </a>
        </div>
        <div className="answer-stamp reveal">
          <CheckSquare size={44} />
          <span>SQuAD 2.0</span>
          <strong>75 + 75</strong>
          <p>{t("answerable + unanswerable", "回答可能 ＋ 回答不可能")}</p>
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
        <div className="test-grid">
          <section className="prompt-panel">
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
            <ModelControl state={ai.state} load={ai.load} stop={halt} ja={ja} />
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
            <output role="status">{message}</output>
            <p className="note">
              {t(
                "2–10 questions × two prompts. CPU runs may take several minutes. Nothing is generated until you ask.",
                "2〜10問×2種類の指示。CPU では数分かかる場合があります。操作するまで生成しません。",
              )}
            </p>
          </section>
          <section className="score-panel">
            <p className="eyebrow">{t("THE RELEASE GATE", "リリースの判定")}</p>
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
        <section className="try-score">
          <div>
            <h3>
              {t(
                "Try the scorer without a download.",
                "ダウンロードなしで採点を試す。",
              )}
            </h3>
            <p>
              {t(
                "For question 1, type an answer. Exact match ignores punctuation, articles and case; token F1 gives partial credit. It is not a truth detector.",
                "1問目の回答を入力。完全一致は記号・冠詞・大文字を無視し、単語 F1 は部分点を与えます。真実の判定ではありません。",
              )}
            </p>
          </div>
          <div>
            <label>
              {t("Your answer", "あなたの回答")}
              <input
                aria-label="Manual answer"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
            </label>
            <output data-testid="manual-score">
              EM {percent(metric(manual, sample[0].answers).em)} · F1{" "}
              {percent(metric(manual, sample[0].answers).f1)}
            </output>
          </div>
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
              "A support assistant should answer from the documentation or admit the answer is missing. Asking it to “use your general knowledge” may turn missing information into a confident mistake. Here, half the questions deliberately have no answer in the passage. You can see the tradeoff before a prompt change reaches users.",
              "サポート AI は文書に基づいて答え、情報がなければ棄権すべきです。一般知識の利用を指示すると、欠落情報を誤って補うことがあります。ここでは半分が回答不可能な質問なので、変更の影響を確認できます。",
            )}
          </p>
          <div className="record">
            <strong>0.715 → 0.380 F1</strong>
            <p>
              {t(
                "Recorded local Qwen 2.5 3B, 150 questions. The open-answer prompt regressed; the gate rejected it. Same-model judge agreement was weak without references. The browser uses a different model (Gemma 3 1B), and fresh results are shown above.",
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
