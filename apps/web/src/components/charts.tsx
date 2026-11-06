/**
 * Two charts over the scan this page is showing.
 *
 * Both are computed from the evidence bundles in `data/mock.ts` at render time,
 * not written down: a number on a chart has the same burden as a number in
 * prose (docs/00-evidence-policy.md), so the only way to draw one honestly is
 * to derive it from the scan it claims to describe. A row with no bundle — a
 * MOCK row — is not chartable and is not charted.
 *
 * Plain markup and CSS. A chart library here would be ~40kB to draw bars whose
 * widths are percentages, and the shapes it produces are not ones the landing
 * page would have drawn.
 */
import type { EvidenceBundle, Outcome, RouteVerdict } from "@floor/core";
import { RULES } from "../data/mock";

/** The pack minimum this chart measures against: LlamaRisk §2.2. */
const MIN_VERIFIERS = 3;

/** Inbound routes only. Send-side config cannot forge a message into Aave. */
const inbound = (b: EvidenceBundle): RouteVerdict[] => b.verdict.routes.filter((r) => r.direction === "receive");

export interface ScanSeries {
  label: string;
  block: number;
  bundle: EvidenceBundle;
}

/* ---------- distance from the verifier bar ---------- */

/**
 * Buckets of effective independent verifier count. The top bucket is open so
 * the axis cannot grow a tail of empty columns when one route is well
 * configured, and `null` (verifier count not resolvable) gets its own bucket
 * rather than being folded into zero — not knowing is not the same as none.
 */
const BUCKETS = [
  { key: "1", label: "1 verifier", hit: (n: number) => n === 1 },
  { key: "2", label: "2 verifiers", hit: (n: number) => n === 2 },
  { key: "3", label: "3 verifiers", hit: (n: number) => n === 3 },
  { key: "4", label: "4 or more", hit: (n: number) => n >= 4 },
] as const;

/**
 * The outcome the pack gives a route in this bucket, so the bar is coloured by
 * the rule rather than by taste: 1 is below the bar, 2 is under it, 3 and up
 * clear it (packages/core/src/rules.ts).
 */
const bucketOutcome = (key: string): Outcome => (key === "1" ? "BREACHED" : key === "2" ? "DEGRADED" : "OK");

function VerifierScan({ scan }: { scan: ScanSeries }) {
  const routes = inbound(scan.bundle);
  const total = routes.length;
  const counts = routes.map((r) => r.effectiveIndependent);
  const unresolved = counts.filter((n) => n === null).length;
  const resolved = counts.filter((n): n is number => n !== null);

  return (
    <div className="vbar">
      <div className="vbar-h">
        <b>{scan.label}</b>
        <span>block {scan.block.toLocaleString()}</span>
      </div>
      {BUCKETS.map((b) => {
        const n = resolved.filter((v) => b.hit(v)).length;
        const outcome = bucketOutcome(b.key);
        // The bar is a share of this scan's own inbound routes, which is the
        // question being asked — "how much of the surface clears the bar" —
        // and makes a 26-route scan comparable with a 1-route one.
        const share = total ? (n / total) * 100 : 0;
        return (
          <div key={b.key} className={`vbar-row g-${outcome.toLowerCase()}${n ? "" : " is-empty"}`}>
            {/* The rule line falls between 2 and 3, so it is drawn as the top
                edge of the first bucket that passes rather than as a tick on an
                axis nothing else uses. */}
            {b.key === String(MIN_VERIFIERS) && <span className="vbar-rule">pack minimum · {MIN_VERIFIERS}</span>}
            <span className="vbar-label">{b.label}</span>
            <span className="vbar-track">
              <span className="vbar-fill" style={{ width: `${share}%` }} />
            </span>
            <span className="vbar-n">
              {n} <small>/ {total}</small>
            </span>
          </div>
        );
      })}
      {unresolved > 0 && (
        <p className="chart-note">
          {unresolved} of {total} routes have no resolvable verifier count and are not bucketed.
        </p>
      )}
    </div>
  );
}

/** How far each scan's inbound routes sit from the three-verifier minimum. */
export function VerifierChart({ scans }: { scans: ScanSeries[] }) {
  // The whole chart turns on this: the bucket is the *effective* count, not
  // the number of DVNs the route is configured with. Without it a reader
  // reasonably assumes the x-axis is the config, which is the mistake the Kelp
  // route made legible in the first place.
  const collapse = RULES.find((r) => r.id === "AAVE-TALF-R7");
  return (
    <div className="chart">
      {scans.map((s) => (
        <VerifierScan key={s.block} scan={s} />
      ))}
      {collapse && (
        <p className="chart-note">
          Effective, not configured. {collapse.source}: “{collapse.quote}”
        </p>
      )}
    </div>
  );
}

/* ---------- which rule is doing the failing ---------- */

const OUTCOMES = ["OK", "DEGRADED", "UNKNOWN", "BREACHED", "SKIPPED"] as const;

const tally = (routes: RouteVerdict[], ruleId: string): Map<Outcome, number> => {
  const out = new Map<Outcome, number>();
  for (const r of routes) {
    for (const res of r.results) {
      if (res.rule !== ruleId) continue;
      out.set(res.outcome, (out.get(res.outcome) ?? 0) + 1);
    }
  }
  return out;
};

/**
 * Per-rule outcome mix across each scan's inbound routes.
 *
 * SKIPPED is a segment, not an omission. A rule that never ran is the most
 * misreadable state on the page — it looks like a pass if you hide it — so it
 * is drawn at full width with no fill, which is what "no evidence either way"
 * looks like.
 */
export function RuleMixChart({ scans }: { scans: ScanSeries[] }) {
  // Only rules the pack actually returned for these routes; the pack carries
  // controller rules too, and those are not per-route.
  const ruleIds = [...new Set(scans.flatMap((s) => inbound(s.bundle).flatMap((r) => r.results.map((x) => x.rule))))];

  return (
    <div className="chart">
      {ruleIds.map((id) => {
        const meta = RULES.find((r) => r.id === id);
        return (
          <div key={id} className="mix">
            <div className="mix-h">
              <b>{id}</b>
              <span>{meta?.title ?? "rule"}</span>
            </div>
            {scans.map((s) => {
              const routes = inbound(s.bundle);
              const counts = tally(routes, id);
              const total = [...counts.values()].reduce((a, b) => a + b, 0);
              const present = OUTCOMES.filter((o) => (counts.get(o) ?? 0) > 0);
              return (
                <div key={s.block} className="mix-row">
                  <span className="mix-when">{s.label}</span>
                  <span
                    className="mix-track"
                    role="img"
                    aria-label={present.map((o) => `${o} ${counts.get(o)} of ${total}`).join(", ")}
                  >
                    {present.map((o) => (
                      <span
                        key={o}
                        className={`mix-seg g-${o.toLowerCase()}`}
                        style={{ width: `${((counts.get(o) ?? 0) / total) * 100}%` }}
                      />
                    ))}
                  </span>
                  <span className="mix-legend">
                    {present.map((o) => (
                      <span key={o} className={`g-${o.toLowerCase()}`}>
                        {o} {counts.get(o)}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
            {meta && (
              <p className="chart-note">
                {meta.source}: “{meta.quote}”
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
