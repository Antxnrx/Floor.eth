import type { Address, Hex } from "viem";

export type { Address, Hex };

/** Grades, ordered by severity for "worst result wins". UNKNOWN ranks above DEGRADED: we can't vouch for it. */
export const GRADES = ["OK", "DEGRADED", "UNKNOWN", "BREACHED"] as const;
export type Grade = (typeof GRADES)[number];
/** Outcome of a single rule. SKIPPED = no data yet; shown, but excluded from the grade. */
export type Outcome = Grade | "SKIPPED";

export const severity = (g: Grade): number => GRADES.indexOf(g);
export const worst = (gs: Grade[]): Grade =>
  gs.reduce<Grade>((a, b) => (severity(b) > severity(a) ? b : a), "OK");

/** Resolved (effective) ULN config: defaults already merged by the message library. */
export interface UlnConfig {
  confirmations: string; // uint64 as decimal string (JSON-safe)
  requiredDVNCount: number; // raw field (255 = NIL)
  optionalDVNCount: number;
  optionalThreshold: number;
  requiredDVNs: Address[];
  optionalDVNs: Address[];
}

export type Direction = "receive" | "send";

export interface RouteState {
  eid: number;
  direction: Direction;
  /** Remote OApp configured as peer (bytes32). */
  peer: Hex;
  library: Address;
  /** true = OApp follows the endpoint default library (unpinned). */
  libraryIsDefault: boolean;
  /** Receive-library grace period: old library still accepted until `expiry` (block number). */
  timeout: { library: Address; expiry: string } | null;
  effective: UlnConfig;
  /** App-level config as set by the OApp (0 fields mean "inherit default"). */
  app: UlnConfig | null;
  /** Evidence call ids that produced this route's values. */
  evidence: string[];
}

export type ControllerKind = "eoa" | "safe" | "timelock" | "contract" | "none";

export interface ControllerState {
  role: "owner" | "delegate";
  address: Address;
  kind: ControllerKind;
  safe?: { threshold: number; owners: number; modules: number; guard: Address | null; version: string | null };
  timelock?: { minDelaySeconds: string };
  evidence: string[];
}

export interface ForkTestResult {
  name: "inbound-limit";
  eid: number;
  forkBlock: number;
  outcome: "NO_INBOUND_LIMIT" | "INBOUND_LIMIT" | "PAUSED" | "TEST_ERROR" | "UNKNOWN";
  revert: string | null;
  /** Escrow (adapters) in shared decimals at forkBlock; null for mint-class OFTs. */
  escrowSD?: string | null;
  /** Largest inbound amount (shared decimals) the app layer accepted, found by binary search. */
  maxAcceptedSD?: string | null;
  /** How the result was proven, e.g. "small ok · full ok · full+1 reverts (balance)". */
  proof?: string;
}

/** One raw onchain read. The browser verifier replays these via eth_call and compares `result`. */
export interface EvidenceCall {
  id: string;
  to: Address;
  sig: string;
  data: Hex;
  block: number;
  result: Hex;
  ok: boolean;
}

export interface AssetState {
  asset: { symbol: string; chainId: number; oapp: Address; token: Address | null };
  scan: { chainId: number; block: number; blockHash: Hex; timestamp: number; rpcProviders: string[]; rpcAgreement: boolean };
  routes: RouteState[];
  controllers: ControllerState[];
  forkTests: ForkTestResult[];
  calls: EvidenceCall[];
}

export interface OperatorInfo {
  /** Stable operator id; DVNs sharing an id are one trust domain. */
  id: string;
  name: string;
  dead?: boolean;
}
/** lowercase DVN address -> operator */
export type OperatorMap = Record<string, OperatorInfo>;

export interface RuleResult {
  rule: string;
  outcome: Outcome;
  reason: string;
  evidence: string[];
}

export interface RouteVerdict {
  eid: number;
  direction: Direction;
  grade: Grade;
  operators: string[];
  effectiveIndependent: number | null;
  results: RuleResult[];
}

export interface Verdict {
  grade: Grade;
  rulePack: { id: string; version: string; framework: string };
  routes: RouteVerdict[];
  controllers: RuleResult[];
  summary: string[];
}
