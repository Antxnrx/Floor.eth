import type {
  AssetState,
  ControllerState,
  Grade,
  OperatorMap,
  Outcome,
  RouteState,
  RouteVerdict,
  RuleResult,
  UlnConfig,
  Verdict,
} from "./types.js";
import { worst } from "./types.js";

export const RULE_PACK = {
  id: "aave-rf",
  version: "0.1.0",
  framework: "LlamaRisk Aave Risk Framework v1.2 (2026-10-06) + Aave Labs TALF reply #7",
} as const;

const NIL_U8 = 255;
const DAY = 86_400n;
const HOUR = 3_600n;

export interface IndependenceResult {
  /** Minimum number of distinct operators an attacker must compromise to get a message verified. */
  count: number;
  operators: string[];
  /** DVN addresses with no operator mapping (each treated as its own operator). */
  unmapped: string[];
  /** true if the route cannot verify any message (dead DVN required, or optional threshold unreachable). */
  blocked: boolean;
}

const opOf = (dvn: string, map: OperatorMap): { id: string; mapped: boolean; dead: boolean } => {
  const info = map[dvn.toLowerCase()];
  if (!info) return { id: `unmapped:${dvn.toLowerCase()}`, mapped: false, dead: false };
  return { id: info.id, mapped: true, dead: !!info.dead };
};

/**
 * Effective independence of a resolved ULN config.
 * Required DVNs must all sign; `optionalThreshold` of the optional DVNs must also sign.
 * Optional DVNs run by an operator already in the required set are "free" for an attacker.
 * The remaining threshold is covered greedily by the largest same-operator groups (optimal for a count).
 */
export function independence(cfg: UlnConfig, map: OperatorMap): IndependenceResult {
  const required = cfg.requiredDVNCount === NIL_U8 ? [] : cfg.requiredDVNs;
  const unmapped = new Set<string>();
  let blocked = false;

  const reqOps = new Set<string>();
  for (const d of required) {
    const o = opOf(d, map);
    if (o.dead) blocked = true;
    if (!o.mapped) unmapped.add(d.toLowerCase());
    reqOps.add(o.id);
  }

  const threshold = cfg.optionalThreshold === NIL_U8 ? 0 : cfg.optionalThreshold;
  let free = 0;
  const groups = new Map<string, number>();
  for (const d of cfg.optionalDVNs) {
    const o = opOf(d, map);
    if (!o.mapped) unmapped.add(d.toLowerCase());
    if (o.dead) continue; // a dead DVN never signs, so it can't help reach the threshold
    if (reqOps.has(o.id)) free++;
    else groups.set(o.id, (groups.get(o.id) ?? 0) + 1);
  }

  let need = Math.max(0, threshold - free);
  const extra: string[] = [];
  for (const [id, size] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
    if (need <= 0) break;
    extra.push(id);
    need -= size;
  }
  if (need > 0) blocked = true;
  if (required.length === 0 && threshold === 0) blocked = true; // nothing verifies: LZ rejects such configs

  const operators = [...reqOps, ...extra];
  return { count: operators.length, operators, unmapped: [...unmapped], blocked };
}

function rule(rule: string, outcome: Outcome, reason: string, evidence: string[]): RuleResult {
  return { rule, outcome, reason, evidence };
}

export function ruleVerifiers(r: RouteState, map: OperatorMap): { result: RuleResult; ind: IndependenceResult } {
  const ind = independence(r.effective, map);
  const ev = r.evidence;
  if (ind.blocked)
    return { ind, result: rule("AAVE-RF-2.2", "OK", "route cannot verify messages (dead DVN or unreachable threshold): disabled", ev) };
  const mappedCount = ind.operators.filter((o) => !o.startsWith("unmapped:")).length;
  const base = `${ind.count} effective independent verifier(s): ${ind.operators.join(", ")}`;
  if (ind.count >= 3) {
    if (mappedCount < 3)
      return { ind, result: rule("AAVE-RF-2.2", "UNKNOWN", `${base}; ≥3 only by counting unmapped DVNs`, ev) };
    return { ind, result: rule("AAVE-RF-2.2", "OK", base, ev) };
  }
  if (ind.count === 2) return { ind, result: rule("AAVE-RF-2.2", "DEGRADED", `${base} (<3)`, ev) };
  return { ind, result: rule("AAVE-RF-2.2", "BREACHED", `${base} (<3; single effective verifier is below bar)`, ev) };
}

export function rulePinned(r: RouteState, block: number): RuleResult | null {
  if (r.direction !== "receive") return null;
  if (r.libraryIsDefault)
    return rule("AAVE-RF-2.4", "BREACHED", "receive library unpinned (follows endpoint default)", r.evidence);
  if (r.timeout && BigInt(r.timeout.expiry) > BigInt(block))
    return rule("AAVE-RF-2.4", "DEGRADED", `grace period: old library ${r.timeout.library} accepted until block ${r.timeout.expiry}`, r.evidence);
  return rule("AAVE-RF-2.4", "OK", "receive library pinned, no grace period", r.evidence);
}

export function ruleInbound(r: RouteState, s: AssetState): RuleResult | null {
  if (r.direction !== "receive") return null;
  const t = s.forkTests.find((f) => f.name === "inbound-limit" && f.eid === r.eid);
  if (!t) return rule("AAVE-RF-2.8", "SKIPPED", "inbound-limit fork test not run", []);
  const ev = [`fork:inbound-limit:${t.eid}@${t.forkBlock}`];
  switch (t.outcome) {
    case "INBOUND_LIMIT":
      return rule("AAVE-RF-2.8", "OK", "app-level inbound limit present (fork-tested)", ev);
    case "NO_INBOUND_LIMIT":
      return rule("AAVE-RF-2.8", "BREACHED", "no app-level inbound limit (fork-tested; not a claim of drainability)", ev);
    default:
      return rule("AAVE-RF-2.8", "UNKNOWN", `fork test inconclusive: ${t.outcome}${t.revert ? ` (${t.revert})` : ""}`, ev);
  }
}

export function ruleController(c: ControllerState): RuleResult | null {
  const id = `AAVE-RF-2.5:${c.role}`;
  const ev = c.evidence;
  switch (c.kind) {
    case "none":
      return c.role === "delegate" ? null : rule(id, "UNKNOWN", "no owner found", ev);
    case "eoa":
      return rule(id, "BREACHED", `${c.role} is an EOA: one key can change bridge config`, ev);
    case "safe": {
      const s = c.safe!;
      const mods = s.modules > 0 ? `; ${s.modules} module(s) can bypass signers and guards` : "";
      if (s.threshold <= 1) return rule(id, "BREACHED", `${c.role} is a 1-of-${s.owners} Safe${mods}`, ev);
      return rule(id, "DEGRADED", `${c.role} is a ${s.threshold}-of-${s.owners} Safe with no timelock${mods}`, ev);
    }
    case "timelock": {
      const d = BigInt(c.timelock!.minDelaySeconds);
      if (d >= DAY) return rule(id, "OK", `${c.role} is a timelock (${d}s ≥ 24h)`, ev);
      if (d >= HOUR) return rule(id, "DEGRADED", `${c.role} is a timelock with ${d}s delay (<24h)`, ev);
      return rule(id, "BREACHED", `${c.role} is a timelock with sub-hour delay (${d}s)`, ev);
    }
    case "contract":
      return rule(id, "UNKNOWN", `${c.role} is an unrecognised contract`, ev);
  }
}

const gradeOf = (rs: RuleResult[]): Grade =>
  worst(rs.filter((r) => r.outcome !== "SKIPPED").map((r) => r.outcome as Grade));

export function evaluate(s: AssetState, map: OperatorMap): Verdict {
  const routes: RouteVerdict[] = s.routes.map((r) => {
    const { result, ind } = ruleVerifiers(r, map);
    const results = [result, rulePinned(r, s.scan.block), ruleInbound(r, s)].filter((x): x is RuleResult => !!x);
    return {
      eid: r.eid,
      direction: r.direction,
      grade: gradeOf(results),
      operators: ind.operators,
      effectiveIndependent: ind.blocked ? null : ind.count,
      results,
    };
  });
  const controllers = s.controllers.map(ruleController).filter((x): x is RuleResult => !!x);
  const grade = worst([...routes.map((r) => r.grade), gradeOf(controllers)]);

  const recv = routes.filter((r) => r.direction === "receive");
  const single = recv.filter((r) => r.effectiveIndependent === 1).length;
  const unpinned = s.routes.filter((r) => r.direction === "receive" && r.libraryIsDefault).length;
  const summary = [
    `${recv.length} receive route(s) at block ${s.scan.block}`,
    `${single} with a single effective verifier`,
    `${unpinned} with an unpinned receive library`,
    ...controllers.map((c) => c.reason),
  ];
  return { grade, rulePack: { ...RULE_PACK }, routes, controllers, summary };
}
