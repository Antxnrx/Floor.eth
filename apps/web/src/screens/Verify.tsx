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
  if (!a?.bundle) return <p>Asset not found. <Link to="/">Back</Link></p>;
  const done = step >= STEPS.length;
  return (
    <>
      <p><Link to={`/asset/${id}`}>← {a.symbol}</Link></p>
      <h1>Verify {a.symbol} in your browser <Mock /></h1>
      <p className="lede">No Floor server involved. Data comes from Arkiv and Swarm; chain reads go through EF Anon-RPC.</p>
      <div className="grid2">
        <Card title="Steps">
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? "ok" : i === step ? "run" : ""}>{s}{i === 3 && step > 3 ? ` (${total}/${total} matched)` : ""}</li>
            ))}
          </ol>
          <button className="btn" onClick={() => setStep(0)}>{step < 0 ? "Start verification" : "Run again"}</button>
        </Card>
        <Card title="Result">
          {done ? (
            <p className="big">Verified ✓ <GradeChip g={a.bundle.verdict.grade} /><br /><span className="muted">{total}/{total} calls matched · grade reproduced</span></p>
          ) : (
            <p className="muted">Waiting…</p>
          )}
          <h4>Anon-RPC traffic share</h4>
          <div className="meter"><div style={{ width: done ? "100%" : `${Math.max(0, step) * 16}%` }} /></div>
          <p className="muted">{done ? "100% of chain reads via Anon-RPC (0 direct)" : "counting…"}</p>
          <h4>Failure states to design</h4>
          <ul>
            <li><b>Mismatch</b>: show which call or hash disagrees</li>
            <li><b>Evidence unavailable</b>: Swarm unreachable → grade shows UNKNOWN</li>
            <li><b>Unverified (RPC)</b>: Anon-RPC failed; say if any direct read was used</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
