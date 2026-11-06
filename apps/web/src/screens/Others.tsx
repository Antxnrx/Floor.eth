import { useEffect, useMemo, useState } from "react";
import { ASSETS, KELP_TIMELINE, RULES } from "../data/mock";
import { LIVE, readLive, STEPS, type LiveState } from "../data/live";
import { Card, GradeChip, Link, Mock, Real } from "../components/ui";

/** Screen 4 · Kelp replay: real timeline + fork replay result (side by side). */
export function Kelp() {
  return (
    <>
      <h1>Kelp replay <Real /></h1>
      <p className="lede">The attacked route sat on one verifier for 12.5 months. Replayed on a mainnet fork at block 24,908,284.</p>
      <div className="grid2">
        <Card title="Without Floor"><p className="big bad">Borrow succeeds</p><p className="muted">Attacker supplies forged rsETH and borrows WETH (block 24,908,307 in reality).</p></Card>
        <Card title="With Floor (fork)"><p className="big ok">Borrow reverts · $0 borrowed on Aave</p><p className="muted">rsETH graded BREACHED → enforcer freezes new borrows. The attacker's real supply transaction reverts with <code>ReserveFrozen()</code>; repay and liquidations still work. Mainnet fork test <code>contracts/test/fork/KelpReplay.t.sol</code>.</p></Card>
      </div>
      <Card title="Timeline (onchain)">
        <table><tbody>{KELP_TIMELINE.map((e) => <tr key={e.block}><td>{e.t}</td><td className="num">{e.block}</td><td>{e.text}</td></tr>)}</tbody></table>
      </Card>
    </>
  );
}

/** Screen 5 · Enforcement: the live testnet loop (CRE → registry → CCIP → mirror on Base → sentinel cuts a real Morpho cap). */
export function Enforcement() {
  const [live, setLive] = useState<LiveState | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { readLive().then(setLive, (e) => setErr(String(e?.message ?? e))); }, []);
  const t = (s: number) => new Date(s * 1000).toISOString().slice(11, 19) + "Z";
  const mins = (a: number, b: number) => ((b - a) / 60).toFixed(1);
  return (
    <>
      <h1>Detected on Ethereum, protection fires on Base <Real /></h1>
      <p className="lede">Live on testnets with real Chainlink CRE, CCIP and a real Morpho Vault V2. Floor only ever lowers risk: caps go down, funds never move.</p>
      <div className="grid2">
        <Card title="Now, read from the chains">
          {err && <p className="bad">Could not read the chains: {err}</p>}
          {!live && !err && <p className="muted">Reading Sepolia and Base Sepolia…</p>}
          {live && (
            <ul>
              <li>FloorRegistry (Ethereum Sepolia): rsETH <GradeChip g={live.registry.grade as never} /> at scan block {live.registry.scanBlock.toLocaleString("en-US")}</li>
              <li>FloorMirror (Base Sepolia, via CCIP): rsETH <GradeChip g={live.mirror.grade as never} />, evidence hash {live.mirror.hash === live.registry.hash ? "identical" : "DIFFERENT"}</li>
              <li>Morpho Vault V2 cap for rsETH collateral: <b className={live.capUsdc === 0 ? "bad" : ""}>{live.capUsdc.toLocaleString("en-US")} USDC</b> (was 1,000,000)</li>
              <li>FloorSentinel holds the vault's sentinel role: {live.sentinelSet ? "yes" : "no"}</li>
            </ul>
          )}
        </Card>
        <Card title="How long it took (block timestamps)">
          <p className="big">{mins(STEPS[0]!.at, STEPS[2]!.at)} min <span className="muted">from the CRE write on Ethereum to the rating on Base</span></p>
          <p className="muted">{mins(STEPS[1]!.at, STEPS[2]!.at)} min of that is CCIP waiting for Ethereum finality before delivering. The cap cut is a permissionless <code>poke</code>; in this run it was sent by hand {mins(STEPS[2]!.at, STEPS[3]!.at)} min after delivery. At Kelp, the attacked route sat on a single verifier for 381 days.</p>
        </Card>
      </div>
      <Card title="What happened, transaction by transaction">
        <table>
          <thead><tr><th>Time</th><th>Chain</th><th>Step</th><th>Detail</th><th>Tx</th></tr></thead>
          <tbody>{STEPS.map((e) => <tr key={e.tx}><td className="num">{t(e.at)}</td><td>{e.chain}</td><td><span className={`chip chip-k-${e.kind}`}>{e.kind}</span> {e.title}</td><td>{e.detail}</td><td><a href={e.link} target="_blank" rel="noopener">{e.tx.slice(0, 10)}…</a></td></tr>)}</tbody>
        </table>
      </Card>
      <Card title="What the sentinel can and cannot do">
        <ul>
          <li>Can: lower the vault's cap for the rated collateral (BREACHED → 0, DEGRADED/UNKNOWN → 10% ceiling).</li>
          <li>Cannot: raise any cap, move funds, block withdrawals, repayments or liquidations. The vault owner opts in with <code>setIsSentinel</code>.</li>
          <li>Contracts: registry <code>{LIVE.registry}</code>, mirror <code>{LIVE.mirror}</code>, vault <code>{LIVE.vault}</code>.</li>
        </ul>
      </Card>
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
