import { useState } from "react";
import { chainName } from "@floor/core";
import { binding, findAsset } from "../data/mock";
import { Card, GradeChip, Link, Real, short } from "../components/ui";

/** Screen 2 · Asset detail: grade, controllers, per-route rule results, raw evidence calls. */
export function Asset({ id }: { id: string }) {
  const a = findAsset(id);
  const [dir, setDir] = useState<"receive" | "send">("receive");
  const [showCalls, setShowCalls] = useState(false);
  if (!a?.bundle) return <p>Asset not found. <Link to="/scan">Back</Link></p>;
  const { state, verdict } = a.bundle;
  const routes = verdict.routes.filter((r) => r.direction === dir);
  const stateRoute = (eid: number) => state.routes.find((r) => r.eid === eid && r.direction === dir)!;
  return (
    <>
      <p><Link to="/scan">← Live scan</Link></p>
      <div className="title-row">
        {/* No grade chip here: the verdict banner below states it far louder. */}
        <h1>{a.symbol} <span className="muted">{a.label}</span></h1>
        <Real />
        <span className="spacer" />
        <a className="btn" href={`#/verify/${a.key}`}>Verify in browser</a>
      </div>
      <div className={`verdict g-${verdict.grade.toLowerCase()}`}>
        <div className="verdict-grade"><i />{verdict.grade}</div>
        <p className="verdict-why">Capped because <b>{binding(a)}</b>.</p>
      </div>

      <div className="meta">
        <div><label>OApp</label><span>{short(state.asset.oapp)}</span></div>
        <div><label>Block</label><span>{state.scan.block.toLocaleString()}</span></div>
        <div><label>Scanned</label><span>{new Date(state.scan.timestamp * 1000).toUTCString()}</span></div>
        <div>
          <label>RPCs</label>
          <span>{state.scan.rpcProviders.length} · {state.scan.rpcAgreement ? "all agree" : "NOT cross-checked"}</span>
        </div>
        <div><label>Rule pack</label><span>{verdict.rulePack.id}@{verdict.rulePack.version}</span></div>
      </div>

      <div className="grid2">
        <Card title="Summary"><ul>{verdict.summary.map((s) => <li key={s}>{s}</li>)}</ul></Card>
        <Card title="Who can change the bridge settings">
          <table>
            <tbody>
              {state.controllers.map((c) => (
                <tr key={c.role}>
                  <td>{c.role}</td>
                  <td><code>{short(c.address)}</code></td>
                  <td>{c.kind === "safe" ? `Safe ${c.safe!.threshold}-of-${c.safe!.owners} · v${c.safe!.version} · modules ${c.safe!.modules} · guard ${c.safe!.guard ? short(c.safe!.guard) : "none"}` : c.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="results">{verdict.controllers.map((r) => <li key={r.rule}><GradeChip g={r.outcome} /> <code>{r.rule}</code> {r.reason}</li>)}</ul>
        </Card>
      </div>

      <Card
        title={`Routes (${routes.length})`}
        right={<div className="seg">{(["receive", "send"] as const).map((d) => <button key={d} className={dir === d ? "on" : ""} onClick={() => setDir(d)}>{d}</button>)}</div>}
      >
        <table>
          <thead><tr><th>Remote chain</th><th>eid</th><th>Grade</th><th>Independent</th><th>Operators</th><th>Confirmations</th><th>Library</th><th>Rule results</th></tr></thead>
          <tbody>
            {routes.map((r) => {
              const s = stateRoute(r.eid);
              return (
                <tr key={r.eid}>
                  <td>{chainName(r.eid)}</td>
                  <td className="num">{r.eid}</td>
                  <td><GradeChip g={r.grade} /></td>
                  <td className="num">{r.effectiveIndependent ?? "disabled"}</td>
                  <td>{r.operators.join(", ")}</td>
                  <td className="num">{s.effective.confirmations}</td>
                  <td className="nowrap"><code>{short(s.library)}</code> {s.libraryIsDefault ? <span className="warn">default</span> : <span className="muted">pinned</span>}</td>
                  <td className="results-cell">{r.results.map((x) => <div key={x.rule} title={x.reason}><GradeChip g={x.outcome} /> <code>{x.rule}</code></div>)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title={`Evidence: ${state.calls.length} raw onchain reads`} right={<button onClick={() => setShowCalls(!showCalls)}>{showCalls ? "Hide" : "Show"}</button>}>
        <p className="muted">Every value above comes from one of these calls at block {state.scan.block}. The browser verifier replays them through Anon-RPC.</p>
        {showCalls && (
          <table className="mono">
            <thead><tr><th>id</th><th>to</th><th>call</th><th>ok</th><th>result</th></tr></thead>
            <tbody>{state.calls.slice(0, 300).map((c) => <tr key={c.id}><td>{c.id}</td><td>{short(c.to)}</td><td>{c.sig}</td><td>{c.ok ? "✓" : "✗"}</td><td>{short(c.result)}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}
