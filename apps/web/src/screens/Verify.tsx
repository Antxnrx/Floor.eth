import { useEffect, useState } from "react";
import { findAsset } from "../data/mock";
import { Card, GradeChip, Link, Mock } from "../components/ui";

const STEPS = [
  "Find the latest rating on Arkiv (owned by Floor's writer wallet)",
  "Download the evidence bundle from Swarm",
  "Check keccak256(bundle) equals the hash on Arkiv and in the CRE report",
  "Replay every onchain read through Anon-RPC",
  "Re-run the rule pack in this page",
  "Compare grades",
];

/** Screen 3 · Browser verification (CROPS moment). Prototype simulates progress; real flow: docs/20 §Browser verification. */
export function Verify({ id }: { id: string }) {
  const a = findAsset(id);
  const [step, setStep] = useState(-1);
  const total = a?.bundle?.state.calls.length ?? 0;
  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return;
    const t = setTimeout(() => setStep(step + 1), 700);
    return () => clearTimeout(t);
  }, [step]);
  if (!a?.bundle) return <p>Asset not found. <Link to="/scan">Back</Link></p>;

  const done = step >= STEPS.length;
  const running = step >= 0 && !done;
  const pct = done ? 100 : Math.max(0, (step / STEPS.length) * 100);

  return (
    <>
      <p><Link to={`/asset/${id}`}>← {a.symbol}</Link></p>
      <div className="title-row">
        <h1>Verify {a.symbol} in your browser</h1>
        <Mock />
      </div>
      <p className="lede">
        No Floor server is involved. The rating comes from Arkiv, the evidence from Swarm, and every chain read is
        replayed through EF Anon-RPC. If our grade is wrong, this page says so.
      </p>

      {/* VERIFIED is green whatever the asset's grade is: the success here is
          reproducing the grade, not the grade being good. */}
      <div className={`verdict g-${done ? "ok" : "unknown"}`}>
        <div className="verdict-grade"><i />{done ? "VERIFIED" : running ? "RUNNING" : "NOT RUN"}</div>
        <p className="verdict-why">
          {done ? (
            <>Reproduced <GradeChip g={a.bundle.verdict.grade} /> from <b>{total} of {total}</b> reads, every one through Anon-RPC.</>
          ) : running ? (
            <>Replaying the evidence bundle. Nothing is taken on our word.</>
          ) : (
            <>Run the check and reproduce the grade yourself from the raw onchain reads.</>
          )}
        </p>
        <span className="spacer" />
        <button className="btn" onClick={() => setStep(0)} disabled={running}>
          {step < 0 ? "Run verification" : running ? "Running…" : "Run again"}
        </button>
      </div>

      <div className="bar"><div style={{ width: `${pct}%` }} /></div>

      <div className="grid2">
        <Card title="Steps">
          <ol className="run-steps">
            {STEPS.map((s, i) => {
              const state = i < step || done ? "done" : i === step ? "run" : "wait";
              return (
                <li key={s} className={state}>
                  <span className="mark">{state === "done" ? "✓" : state === "run" ? "▸" : "·"}</span>
                  <span>{s}{i === 3 && (done || step > 3) ? ` — ${total}/${total} matched` : ""}</span>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card title="Anon-RPC traffic">
          {/* The dash holds the figure's slot at full size so the panel does
              not reflow when the run lands. The label carries the state, which
              a bare dash on its own could not. */}
          <div className="stat stat-bare">
            <b className={done ? "ok" : "pending"}>{done ? "100%" : "—"}</b>
            <span>{done ? "of chain reads via Anon-RPC (0 direct)" : "no chain reads replayed yet"}</span>
          </div>
          <h4>Failure states this screen must handle</h4>
          <ul className="results">
            <li><b>Mismatch</b> — name the call or hash that disagrees, and stop.</li>
            <li><b>Evidence unavailable</b> — Swarm unreachable, so the grade shows UNKNOWN rather than stale.</li>
            <li><b>Unverified (RPC)</b> — Anon-RPC failed; say plainly if any read fell back to a direct provider.</li>
          </ul>
          <p className="muted">Progress above is simulated in this prototype. The real flow is docs/20 § Browser verification.</p>
        </Card>
      </div>
    </>
  );
}
