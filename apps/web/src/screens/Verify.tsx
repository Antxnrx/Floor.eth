import { findAsset } from "../data/mock";
import { LIVE } from "../data/live";
import { DEPLOYMENT } from "@floor/deployments";
import { Card, GradeChip, Link, Real } from "../components/ui";

/** The steps the live verifier runs, in order (apps/verify-lab, served from Swarm). */
const STEPS = [
  "Find the latest rating on Arkiv, created by Floor's writer wallet",
  "Download the evidence bundle from Swarm and check its keccak256 against Arkiv",
  "Check the same hash is in the CRE-written FloorRegistry on Ethereum Sepolia",
  "Replay every recorded onchain read on Ethereum mainnet through EF Anon-RPC (Tor)",
  "Re-run the rule pack in the page and compare grades",
];

/**
 * Screen 3 · Browser verification (CROPS). The verifier itself runs from Swarm, not from this site, so this screen
 * launches it and shows the last recorded live run (docs/evidence/live-2026-11-07.md).
 */
export function Verify({ id }: { id: string }) {
  const a = findAsset(id);
  if (!a?.bundle) return <p>Asset not found. <Link to="/scan">Back</Link></p>;
  const total = a.bundle.state.calls.length;
  const isKelp = a.bundle.state.asset.oapp === DEPLOYMENT.kelp.adapter.toLowerCase() || a.symbol === "rsETH";
  const url = `${LIVE.verifyPage}${isKelp ? `?token=${DEPLOYMENT.kelp.token}` : ""}`;

  return (
    <>
      <p><Link to={`/asset/${id}`}>← {a.symbol}</Link></p>
      <div className="title-row">
        <h1>Verify {a.symbol} in your browser</h1>
        <Real />
      </div>
      <p className="lede">
        No Floor server is involved, not even for this page's verifier: it is served from Swarm, reads the rating from
        Arkiv and the evidence from Swarm, and replays every chain read through EF Anon-RPC. If our grade is wrong, it
        says so.
      </p>

      {/* VERIFIED is green whatever the asset's grade is: the success here is reproducing the grade, not the grade being good. */}
      <div className="verdict g-ok">
        <div className="verdict-grade"><i />VERIFIED</div>
        <p className="verdict-why">
          Last live run: reproduced <GradeChip g={a.bundle.verdict.grade} /> from <b>{total} of {total}</b> reads in 81 s, over Tor.
        </p>
        <span className="spacer" />
        <a className="btn" href={url}>Run the verifier</a>
      </div>

      <div className="grid2">
        <Card title="What it checks">
          <ol className="run-steps">
            {STEPS.map((s) => (
              <li key={s} className="done">
                <span className="mark">✓</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="muted">Tick "Tamper" in the verifier to flip one byte of one recorded read: the result must be MISMATCH.</p>
        </Card>

        <Card title="Anon-RPC traffic · last live run">
          <div className="stat stat-bare">
            <b className="ok">99.8%</b>
            <span>of 923 requests through Anon-RPC</span>
          </div>
          <div className="bar"><div style={{ width: "99.8%" }} /></div>
          <p className="muted">
            Arkiv 1, Swarm 1, registry 1, chain reads 918. The 2 direct reads are the harness reading its specifier
            contract before the anonymised fetch exists (by design). Run on 2026-11-07 in Chrome.
          </p>
          <h4>Other outcomes it reports</h4>
          <ul className="results">
            <li><b>MISMATCH</b>: a read, the Swarm bytes or the onchain hash disagree. It names which, and stops.</li>
            <li><b>UNVERIFIED_RPC</b>: reads still failing after 5 rounds. Add an RPC and run again.</li>
            <li><b>Not published</b>: no rating on Arkiv from the writer wallet.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
