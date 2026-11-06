import { useEffect, useMemo, useState } from "react";
import { MARKETS, readMarket, type MarketState, type Reserve } from "@floor/live";
import aaveMarkets from "@floor/deployments/aave-markets.json";
import { Card, Stat } from "../components/ui";

/**
 * Live market: every Aave V3 market read straight from its chain every minute (packages/live), joined with the
 * inbound-limit probe of LayerZero adapters (docs/evidence/inbound, also published on Arkiv as floor.adapter).
 * No Floor server: the browser reads the chains itself.
 */
type ProbeRow = { oapp: string; outcome?: string; eids?: number[]; results?: { outcome: string; maxAcceptedSD: string | null; proof: string }[]; sharedDecimals?: number };
const evidence = import.meta.glob("../../../../docs/evidence/inbound/2026-11-07-*.json", { eager: true, import: "default" }) as Record<string, { block: number; rows: ProbeRow[] }>;
const PROBE = new Map<string, { outcome: string; routes: number; block: number }>();
for (const d of Object.values(evidence)) for (const r of d.rows) PROBE.set(r.oapp.toLowerCase(), { outcome: r.outcome ?? "ERROR", routes: r.eids?.length ?? 0, block: d.block });

/** Adapters with no active route (no peers, or LayerZero v1 outside the v2 probe) do not bridge anything today. */
const INACTIVE = new Set(["NO_PEERS", "LZ_V1", "ERROR"]);
const activeAdapter = (oapp?: string) => { const p = oapp ? PROBE.get(oapp.toLowerCase()) : undefined; return p && !INACTIVE.has(p.outcome) ? p : undefined; };
/** Home-chain adapters per LayerZero token symbol: what backs an OFT minted on another chain. */
const HOME = new Map<string, string[]>();
for (const tokens of Object.values(aaveMarkets.bridged as Record<string, Record<string, { kind: string; oapp: string; symbol: string }>>))
  for (const t of Object.values(tokens)) if (t.kind === "layerzero-adapter") HOME.set(t.symbol, [...(HOME.get(t.symbol) ?? []), t.oapp]);
/** Worst probe outcome among the active home adapters behind an OFT symbol. */
function homeOutcome(lzSymbol?: string) {
  const outs = (lzSymbol ? HOME.get(lzSymbol) ?? [] : []).map((o) => activeAdapter(o)?.outcome).filter(Boolean) as string[];
  return outs.includes("NO_INBOUND_LIMIT") ? "NO_INBOUND_LIMIT" : outs.includes("INBOUND_LIMIT") ? "INBOUND_LIMIT" : outs[0];
}
type Exposure = "minted" | "home-escrow" | "none";
function exposure(r: Reserve): Exposure {
  if (r.bridge.kind === "layerzero-oft") return "minted";
  if (r.bridge.kind === "layerzero-adapter" && activeAdapter(r.bridge.oapp)) return "home-escrow";
  return "none";
}

const REFRESH_MS = 60_000;
const usd = (n: number | null | undefined) => (n == null ? "—" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`);
const tokens = (n: number | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 0 }));
const ago = (t: number, now: number) => `${Math.max(0, Math.round((now - t) / 1000))} s ago`;

type Row = Reserve & { market: string; chainId: number };

const outcomeText = (o?: string) =>
  o === "NO_INBOUND_LIMIT" ? <b className="bad">one message can release all escrow</b>
  : o === "INBOUND_LIMIT" ? <b className="ok">rate-limited per message</b>
  : o ? <span className="muted">{o.toLowerCase().replace(/_/g, " ")}</span>
  : <span className="muted">home adapter not probed</span>;

function bridgeCell(r: Row) {
  const e = exposure(r);
  if (e === "minted") return <span>Minted here by LayerZero messages. Backing adapter: {outcomeText(homeOutcome(r.bridge.lzSymbol))}</span>;
  if (e === "home-escrow") return <span>Home chain; its adapter backs other chains: {outcomeText(activeAdapter(r.bridge.oapp)?.outcome)}</span>;
  return <span className="muted">{r.bridge.kind === "layerzero-adapter" ? "inactive LayerZero adapter only" : "no LayerZero bridge found"}</span>;
}

export function LiveMarket() {
  const [states, setStates] = useState<Record<string, MarketState>>({});
  const [now, setNow] = useState(Date.now());
  const [market, setMarket] = useState("all");
  const [bridgedOnly, setBridgedOnly] = useState(false);

  useEffect(() => {
    let stop = false;
    const tick = () => {
      for (const m of MARKETS) readMarket(m).then((s) => !stop && setStates((prev) => ({ ...prev, [m.id]: s.ok || !prev[m.id]?.ok ? s : prev[m.id]! })));
    };
    tick();
    const t = setInterval(tick, REFRESH_MS);
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => { stop = true; clearInterval(t); clearInterval(c); };
  }, []);

  const all = Object.values(states);
  const rows: Row[] = useMemo(
    () => all.flatMap((s) => s.reserves.filter((r) => r.collateral).map((r) => ({ ...r, market: s.name, chainId: s.chainId }))),
    [states],
  );
  const shown = rows
    .filter((r) => (market === "all" || r.market === market) && (!bridgedOnly || exposure(r) !== "none"))
    .sort((a, b) => (b.suppliedUsd ?? 0) - (a.suppliedUsd ?? 0));
  const minted = rows.filter((r) => exposure(r) === "minted");
  const mintedDrainable = minted.filter((r) => homeOutcome(r.bridge.lzSymbol) === "NO_INBOUND_LIMIT");
  const homeDrainable = rows.filter((r) => exposure(r) === "home-escrow" && activeAdapter(r.bridge.oapp)?.outcome === "NO_INBOUND_LIMIT");
  const live = all.filter((s) => s.ok).length;
  const oldest = all.filter((s) => s.ok).reduce((m, s) => Math.min(m, s.readAt), Infinity);
  const stale = oldest !== Infinity && now - oldest > 3 * REFRESH_MS;

  return (
    <>
      <h1>Live market</h1>
      <p className="lede">
        Every Aave V3 market, read straight from its chain by this page every minute: which assets are accepted as collateral, how much is supplied, and
        which of them are bridged by LayerZero. <span className={stale ? "warn" : "muted"}>Markets live: {live}/{MARKETS.length}{oldest !== Infinity ? ` · oldest read ${ago(oldest, now)}` : " · reading…"}</span>
      </p>
      <div className="stats">
        <Stat value={String(rows.length)} label="collateral assets" source={`${live} markets`} />
        <Stat value={usd(rows.reduce((s, r) => s + (r.suppliedUsd ?? 0), 0))} label="supplied as collateral" source="Aave oracle prices" />
        <Stat value={`${minted.length} · ${usd(minted.reduce((s, r) => s + (r.suppliedUsd ?? 0), 0))}`} label="collateral minted by LayerZero messages on its chain" source="LayerZero OFT registry" />
        <Stat value={`${mintedDrainable.length} · ${usd(mintedDrainable.reduce((s, r) => s + (r.suppliedUsd ?? 0), 0))}`} label="of which the backing adapter can release all escrow in one message (the Kelp pattern)" source="inbound probe, 2026-11-07" />
        <Stat value={String(homeDrainable.length)} label="home-chain collateral whose adapter (backing other chains) can be emptied in one message" source="inbound probe, 2026-11-07" />
      </div>
      <Card
        title={`Collateral (${shown.length})`}
        right={
          <div className="row">
            <select value={market} onChange={(e) => setMarket(e.target.value)}>
              <option value="all">All markets</option>
              {MARKETS.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            <label><input type="checkbox" checked={bridgedOnly} onChange={(e) => setBridgedOnly(e.target.checked)} /> LayerZero exposure only</label>
          </div>
        }
      >
        <div className="tablebox">
          <table>
            <thead><tr><th>Market</th><th>Asset</th><th>Supplied</th><th>Bridge</th><th>Adapter escrow (live)</th><th>Liq. threshold</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.market}-${r.asset}`}>
                  <td>{r.market}</td>
                  <td><b>{r.symbol}</b></td>
                  <td className="num">{usd(r.suppliedUsd)}</td>
                  <td>{bridgeCell(r)}</td>
                  <td className="num">{r.bridge.escrow != null ? `${tokens(r.bridge.escrow)} ${r.symbol}` : "—"}</td>
                  <td className="num">{r.collateralViaEModeOnly ? "E-mode only" : `${(r.liquidationThresholdBps / 100).toFixed(0)}%`}</td>
                  <td>{r.frozen ? <span className="warn">frozen</span> : r.active ? "active" : "inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Markets">
        <div className="tablebox">
          <table>
            <thead><tr><th>Market</th><th>Chain</th><th>Block</th><th>Read</th><th>Collateral assets</th></tr></thead>
            <tbody>
              {MARKETS.map((m) => {
                const s = states[m.id];
                return (
                  <tr key={m.id}>
                    <td>{m.name}</td><td className="num">{m.chainId}</td>
                    <td className="num">{s?.block?.toLocaleString("en-US") ?? "—"}</td>
                    <td>{!s ? "reading…" : s.ok ? ago(s.readAt, now) : <span className="bad">failed: {s.error}</span>}</td>
                    <td className="num">{s?.reserves.filter((r) => r.collateral).length ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="muted">
        Sources: Aave V3 address book (markets), each market's Pool, AaveProtocolDataProvider and AaveOracle (live), LayerZero's OFT registry (bridging), Floor's inbound probe of
        LayerZero adapters (docs/evidence/inbound; also on Arkiv as floor.adapter). Grades for LayerZero OFT routes come from the scheduled scan.
      </p>
    </>
  );
}
