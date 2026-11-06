import { useState } from "react";
import { GRADES, type Grade } from "@floor/core";
import { ASSETS, HEADLINE, type AssetRow } from "../data/mock";
import { Card, GradeChip, Link, Mock, Real, Stat } from "../components/ui";

/**
 * The constraint that caps the grade, in one line. A grade on its own tells a
 * reader what we decided; this tells them why, which is the part they can argue
 * with. Derived from the row's own counts, so it states no new claim.
 */
const binding = (a: AssetRow) => {
  if (a.singleVerifier > 0) return `${a.singleVerifier} of ${a.receiveRoutes} routes on one effective verifier`;
  if (a.unpinned > 0) return `${a.unpinned} receive librar${a.unpinned === 1 ? "y" : "ies"} unpinned`;
  if (a.controller.includes("no timelock")) return "bridge authority has no timelock";
  if (a.grade === "OK") return "meets every rule in the pack";
  return "see asset detail";
};

/** Screen 1 · Live scan: every graded asset, filterable. */
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
    </>
  );
}
