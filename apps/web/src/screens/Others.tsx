import { useMemo, useState } from "react";
import { ASSETS, EVENTS, KELP_TIMELINE, RULES } from "../data/mock";
import { Card, GradeChip, Link, Mock, Real } from "../components/ui";

/** Screen 4 · Kelp replay: real timeline + fork replay result (side by side). */
export function Kelp() {
  return (
    <>
      <h1>Kelp replay <Real /></h1>
      <p className="lede">The attacked route sat on one verifier for 12.5 months. Replayed on a mainnet fork at block 24,908,284.</p>
      <div className="grid2">
        <Card title="Without Floor"><p className="big bad">Borrow succeeds</p><p className="muted">Attacker supplies forged rsETH and borrows WETH (block 24,908,307 in reality).</p></Card>
        <Card title="With Floor (fork)"><p className="big ok">Borrow reverts · $0 borrowed on Aave</p><p className="muted">rsETH graded BREACHED → enforcer freezes new borrows. Repay and liquidations still work. <Mock /> until the fork replay is wired.</p></Card>
      </div>
      <Card title="Timeline (onchain)">
        <table><tbody>{KELP_TIMELINE.map((e) => <tr key={e.block}><td>{e.t}</td><td className="num">{e.block}</td><td>{e.text}</td></tr>)}</tbody></table>
      </Card>
    </>
  );
}

/** Screen 5 · Enforcement log: the live mainnet loop (rating → CRE → Sentinel → CCIP). */
export function Enforcement() {
  return (
    <>
      <h1>Enforcement log <Mock /></h1>
      <p className="lede">Our own TEST token and Morpho vault on mainnet. Floor only ever lowers risk: caps down, never funds moved.</p>
      <Card title="Events">
        <table>
          <thead><tr><th>Time</th><th>Type</th><th>Event</th><th>Detail</th><th>Tx</th></tr></thead>
          <tbody>{EVENTS.map((e) => <tr key={e.time + e.title}><td>{e.time}</td><td><span className={`chip chip-k-${e.kind}`}>{e.kind}</span></td><td>{e.title}</td><td>{e.detail}</td><td>{e.tx ?? "—"}</td></tr>)}</tbody>
        </table>
      </Card>
      <Card title="Caught in"><p className="big">12 seconds <span className="muted">vs 12.5 months at Kelp</span></p></Card>
    </>
  );
}

/** Screen 6 · Blast radius: "what depends on this operator?" across assets. Computed from the asset list. */
export function Blast() {
  const ops = useMemo(() => [...new Set(ASSETS.flatMap((a) => a.operators))].sort(), []);
  const [op, setOp] = useState("layerzero-labs");
  const hits = ASSETS.filter((a) => a.operators.includes(op));
  return (
    <>
      <h1>Blast radius</h1>
      <p className="lede">If a verifier operator is compromised, which collateral depends on it?</p>
      <Card title="Component">
        <select value={op} onChange={(e) => setOp(e.target.value)}>{ops.map((o) => <option key={o}>{o}</option>)}</select>
      </Card>
      <Card title={`Exposed assets (${hits.length})`}>
        <table><tbody>{hits.map((a) => <tr key={a.key}><td><b>{a.symbol}</b> {a.label} {a.mock ? <Mock /> : <Real />}</td><td><GradeChip g={a.grade} /></td><td>{a.receiveRoutes} routes</td></tr>)}</tbody></table>
      </Card>
    </>
  );
}

/** Screen 7 · Rule pack with verbatim citations. */
export function Rules() {
  return (
    <>
      <h1>Rule pack <code>aave-rf@0.1.0</code></h1>
      <p className="lede">Aave's DAO-approved framework (Snapshot passed Jul 9 2026), as code. Quotes are verbatim.</p>
      {RULES.map((r) => (
        <Card key={r.id} title={`${r.id} · ${r.title}`}><blockquote>“{r.quote}”</blockquote><p className="muted">{r.source}</p></Card>
      ))}
    </>
  );
}

/** Screen 8 · Issuer pre-sign check: paste a Safe tx, see the effective-state diff before signing. */
export function Check() {
  const [ran, setRan] = useState(false);
  return (
    <>
      <h1>Pre-sign check <Mock /></h1>
      <p className="lede">Simulate a Safe transaction on a fork and see what it changes before anyone signs.</p>
      <Card title="Safe transaction">
        <textarea rows={5} placeholder="Paste Safe tx JSON or calldata (to, value, data, operation)" defaultValue={'{"to":"0x1a44…728c","data":"0x6dbd9f90…","operation":0}'} />
        <button className="btn" onClick={() => setRan(true)}>Simulate</button>
      </Card>
      {ran && (
        <Card title="Effective-state diff">
          <table>
            <thead><tr><th>Route</th><th>Before</th><th>After</th><th>Result</th></tr></thead>
            <tbody>
              <tr><td>Unichain → Ethereum (receive)</td><td>4 independent</td><td>1 independent</td><td><GradeChip g="BREACHED" /> would break AAVE-RF-2.2</td></tr>
              <tr><td>Receive library</td><td>pinned</td><td>pinned</td><td><GradeChip g="OK" /></td></tr>
            </tbody>
          </table>
          <p className="bad">Do not sign: this transaction lowers the floor.</p>
        </Card>
      )}
    </>
  );
}

/** Screen 9 · About / CROPS. */
export function About() {
  return (
    <>
      <h1>About Floor</h1>
      <p className="lede">Floor doesn't ask you to trust Floor. Every grade carries its proof, and your browser can check it.</p>
      <Card title="CROPS">
        <ul>
          <li><b>C</b>: no Floor server on the verification path. Data from Arkiv + Swarm, reads via Anon-RPC; site mirrored on Swarm.</li>
          <li><b>O</b>: open-source licence (TBD); build and run from the repo alone.</li>
          <li><b>P</b>: Anon-RPC hides which assets you check from RPC providers. No trackers or analytics.</li>
          <li><b>S</b>: no keys in the browser; evidence hashes match the CRE-signed report.</li>
        </ul>
      </Card>
      <Card title="Links"><ul><li><Link to="/rules">Rule pack</Link></li><li><Link to="/kelp">Kelp replay</Link></li></ul></Card>
    </>
  );
}
