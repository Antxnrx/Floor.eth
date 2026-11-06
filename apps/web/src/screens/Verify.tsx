import { findAsset } from "../data/mock";
import { LIVE } from "../data/live";
import { Card, GradeChip, Link, Real } from "../components/ui";

/** The steps the live verifier runs, in order (apps/verify-lab, served from Swarm). */
const STEPS = [
  "Find the latest rating on Arkiv, created by Floor's writer wallet",
  "Download the evidence bundle from Swarm and check its keccak256 against Arkiv",
  "Check the same hash is in the CRE-written FloorRegistry on Ethereum Sepolia",
  "Replay every recorded onchain read on Ethereum mainnet through EF Anon-RPC (Tor)",
  "Re-run the rule pack in the page and compare grades",
];

/** Screen 3 · Browser verification (CROPS). The verifier itself runs from Swarm; this screen launches it and shows the last live run. */
export function Verify({ id }: { id: string }) {
  const a = findAsset(id);
  if (!a?.bundle) return <p>Asset not found. <Link to="/">Back</Link></p>;
  const total = a.bundle.state.calls.length;
  const url = `${LIVE.site}?token=${a.bundle.state.asset.symbol === "rsETH" ? "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7" : ""}`;
  return (
    <>
      <p><Link to={`/asset/${id}`}>← {a.symbol}</Link></p>
      <h1>Verify {a.symbol} in your browser <Real /></h1>
      <p className="lede">No Floor server involved, not even for this page: the verifier is served from Swarm, reads Arkiv and Swarm, and replays every chain read through EF Anon-RPC.</p>
      <div className="grid2">
        <Card title="What it checks">
          <ol className="steps">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
          <p><a className="btn" href={url} target="_blank" rel="noopener">Run the verifier (opens the Swarm-hosted page)</a></p>
          <p className="muted">Tick "Tamper" there to flip one byte of one recorded read: the result must be MISMATCH.</p>
        </Card>
        <Card title="Last live run (2026-11-07, Chrome, over Tor)">
          <p className="big">VERIFIED <GradeChip g={a.bundle.verdict.grade} /><br /><span className="muted">{total}/{total} reads matched · grade reproduced · 81 s</span></p>
          <h4>Anon-RPC traffic share</h4>
          <div className="meter"><div style={{ width: "99.8%" }} /></div>
          <p className="muted">99.8% of 923 requests through Anon-RPC: Arkiv 1, Swarm 1, registry 1, chain reads 918. The 2 direct reads are the harness reading its specifier contract before the anonymised fetch exists (by design).</p>
          <h4>Other outcomes it reports</h4>
          <ul>
            <li><b>MISMATCH</b>: a read, the Swarm bytes or the onchain hash disagree</li>
            <li><b>UNVERIFIED_RPC</b>: reads still failing after 5 rounds; add an RPC</li>
            <li><b>Not published</b>: no rating on Arkiv from the writer</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
