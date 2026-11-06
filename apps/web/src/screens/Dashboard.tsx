import { useState } from "react";
import { GRADES, type Grade } from "@floor/core";
import { ASSETS, HEADLINE, binding } from "../data/mock";
import { Card, GradeChip, Link, Mock, Panel, Real, Stat } from "../components/ui";
import { RuleMixChart, VerifierChart, type ScanSeries } from "../components/charts";

/**
 * The scans the charts below are drawn from: every row that carries a real
 * evidence bundle, oldest first. MOCK rows have no bundle and so cannot appear
 * in a chart — the invented numbers exist to exercise UI states, and a bar is
 * exactly the kind of thing a reader would take at face value.
 */
const SCANS: ScanSeries[] = ASSETS.flatMap((a) =>
  // The symbol is already the section heading, so the row label drops it and
  // keeps the part that distinguishes the two scans: "day before the hack".
  a.bundle ? [{ label: a.label.replace(/^[^·]*·\s*/, ""), block: a.block, bundle: a.bundle }] : [],
).sort((a, b) => a.block - b.block);

/** Screen 1 · Live scan: every graded asset, filterable, then the shape of the failure. */
export function Dashboard() {
  const [filter, setFilter] = useState<Grade | "ALL">("ALL");
  const rows = ASSETS.filter((a) => filter === "ALL" || a.grade === filter);
  return (
    <>
      <h1>Live scan</h1>
      <p className="lede">Effective security of collateral, graded against Aave's DAO-approved rules. Every grade links to its evidence.</p>
      <div className="stats">{HEADLINE.map((h) => <Stat key={h.value} {...h} />)}</div>
      <Card
        title="Assets"
        right={
          <div className="seg">
            {(["ALL", ...GRADES] as const).map((g) => (
              <button key={g} className={filter === g ? "on" : ""} onClick={() => setFilter(g)}>{g}</button>
            ))}
          </div>
        }
      >
        <table>
          <thead>
            <tr><th>Asset</th><th>Grade</th><th>Receive routes</th><th>Single-verifier</th><th>Unpinned lib</th><th>Controller</th><th>Block</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.key}>
                <td>
                  <div className="title-row"><b>{a.symbol}</b> <span className="muted">{a.label}</span> {a.mock ? <Mock /> : <Real />}</div>
                  <div className="why">{binding(a)}</div>
                </td>
                <td><GradeChip g={a.grade} /></td>
                <td className="num">{a.receiveRoutes}</td>
                <td className="num">{a.singleVerifier}</td>
                <td className="num">{a.unpinned}</td>
                <td>{a.controller}</td>
                <td className="num">{a.block.toLocaleString()}</td>
                <td>{a.bundle ? <Link to={`/asset/${a.key}`}>Open →</Link> : <span className="muted">mock</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/*
        The table answers "what grade"; these answer "how far off, and because
        of which rule" — the two questions a risk reviewer asks next. Both are
        computed from the rsETH bundles above, so the section is REAL throughout
        and says so once, in each panel's header.
      */}
      <h4>The shape of the failure · rsETH</h4>
      <div className="panels">
        <Panel
          mark="sphere"
          title="Distance from the verifier bar"
          lede="Inbound routes by how many independent verifiers a forged message would have to get past. The pack requires three."
          badge={<Real />}
        >
          <VerifierChart scans={SCANS} />
        </Panel>
        <Panel
          mark="cube"
          title="Which rule is binding"
          lede="Every rule in the pack, against every inbound route. A rule that never ran is drawn empty, not as a pass."
          badge={<Real />}
        >
          <RuleMixChart scans={SCANS} />
        </Panel>
      </div>

      <Panel
        flat
        mark="octahedron"
        title="Do not take our word for it"
        lede="Every number above comes from a bundle of raw eth_call results. The verifier replays them against your own RPC in the browser and tells you if anything disagrees."
      >
        <div className="panel-cta">
          <a className="btn" href="#/verify/rseth-prehack">Replay the pre-hack scan</a>
          <span className="muted">26 inbound routes · block 24,908,284 · 3 RPC providers agreed at scan time</span>
        </div>
      </Panel>
    </>
  );
}
