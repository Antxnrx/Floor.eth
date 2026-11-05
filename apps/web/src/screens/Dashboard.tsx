import { useState } from "react";
import { GRADES, type Grade } from "@floor/core";
import { ASSETS, HEADLINE } from "../data/mock";
import { Card, GradeChip, Link, Mock, Real, Stat } from "../components/ui";

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
                <td><b>{a.symbol}</b> <span className="muted">{a.label}</span> {a.mock ? <Mock /> : <Real />}</td>
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
