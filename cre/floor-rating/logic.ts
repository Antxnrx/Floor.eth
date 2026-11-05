/**
 * Pure workflow logic for the Floor rating CRE workflow. No CRE SDK, no Node APIs, so it runs unchanged
 * inside the Javy/QuickJS WASM runtime and in unit tests.
 *
 * Trust model: the feed (published by Floor's resolver) is NOT trusted. Each DON node
 *   1. re-executes every listed evidence read at the feed's pinned scan block and requires byte-equality, and
 *   2. derives a lower-bound grade from those raw bytes; a feed entry that claims a better grade is rejected.
 * Only entries that pass both are signed into the report for FloorRegistry.
 */
import { decodeFunctionResult, encodeAbiParameters, parseAbi, type Address, type Hex } from "viem";
import { z } from "zod";

export const GRADE = { OK: 0, DEGRADED: 1, UNKNOWN: 2, BREACHED: 3 } as const;
export type GradeName = keyof typeof GRADE;

const hex = z.string().regex(/^0x[0-9a-fA-F]*$/);
const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const checkSchema = z.object({
  id: z.string(),
  to: addr,
  sig: z.enum(["getUlnConfig", "getReceiveLibrary"]),
  data: hex,
  result: hex,
});
export const entrySchema = z.object({
  asset: addr,
  grade: z.enum(["OK", "DEGRADED", "UNKNOWN", "BREACHED"]),
  scanBlock: z.number().int().positive(),
  ruleVersion: z.number().int().nonnegative(),
  bundleHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  checks: z.array(checkSchema).max(14),
});
export const feedSchema = z.object({ schema: z.literal("floor.feed/v0"), entries: z.array(entrySchema) });
export type Feed = z.infer<typeof feedSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type Check = z.infer<typeof checkSchema>;

/** CRE quota: 15 EVM reads per execution (docs.chain.link/cre/service-quotas). */
export const MAX_EVM_READS = 15;

const evidenceAbi = parseAbi([
  "function getUlnConfig(address oapp, uint32 eid) view returns ((uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs))",
  "function getReceiveLibrary(address receiver, uint32 srcEid) view returns (address lib, bool isDefault)",
]);

/**
 * Lower-bound grade implied by one verified raw result, without any operator map:
 * nominal verifier quorum (required + optional threshold) <= 1 => at most one party must agree => BREACHED.
 * Unpinned receive library => BREACHED (Aave RF §2.4). Anything else implies nothing (OK as a lower bound).
 */
export function impliedFloor(check: Check): number {
  if (check.sig === "getUlnConfig") {
    const c = decodeFunctionResult({ abi: evidenceAbi, functionName: "getUlnConfig", data: check.result as Hex });
    const required = c.requiredDVNCount === 255 ? 0 : c.requiredDVNCount;
    const threshold = c.optionalDVNThreshold === 255 ? 0 : c.optionalDVNThreshold;
    return required + threshold <= 1 ? GRADE.BREACHED : GRADE.OK;
  }
  const [, isDefault] = decodeFunctionResult({ abi: evidenceAbi, functionName: "getReceiveLibrary", data: check.result as Hex });
  return isDefault ? GRADE.BREACHED : GRADE.OK;
}

export interface EntryVerdict {
  asset: string;
  accepted: boolean;
  reason: string;
}

/**
 * @param observed observed[i] = raw bytes this node read for entry.checks[i] at entry.scanBlock (null = read failed)
 */
export function verifyEntry(entry: Entry, observed: (Hex | null)[]): EntryVerdict {
  if (observed.length !== entry.checks.length) return { asset: entry.asset, accepted: false, reason: "observation count mismatch" };
  let floor: number = GRADE.OK;
  for (let i = 0; i < entry.checks.length; i++) {
    const c = entry.checks[i]!;
    const o = observed[i];
    if (o == null) return { asset: entry.asset, accepted: false, reason: `read ${c.id} failed` };
    if (o.toLowerCase() !== c.result.toLowerCase()) return { asset: entry.asset, accepted: false, reason: `read ${c.id} mismatch at block ${entry.scanBlock}` };
    floor = Math.max(floor, impliedFloor(c));
  }
  const claimed = GRADE[entry.grade];
  // UNKNOWN (2) is not "better" than BREACHED for enforcement purposes, so compare by severity order.
  if (claimed < floor) return { asset: entry.asset, accepted: false, reason: `feed understates risk: claims ${entry.grade}, raw evidence implies BREACHED` };
  return { asset: entry.asset, accepted: true, reason: `${entry.checks.length} read(s) matched; lower bound respected` };
}

/** Selects entries so the total number of EVM reads stays within the CRE quota (keeps the worst grades first). */
export function planReads(feed: Feed, budget = MAX_EVM_READS): Entry[] {
  const sorted = [...feed.entries].sort((a, b) => GRADE[b.grade] - GRADE[a.grade]);
  const out: Entry[] = [];
  let used = 0;
  for (const e of sorted) {
    if (used + e.checks.length > budget) continue;
    out.push(e);
    used += e.checks.length;
  }
  return out;
}

/** abi.encode(FloorTypes.Update[]) for FloorRegistry.onReport. */
export function encodeReport(entries: Entry[]): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { name: "asset", type: "address" },
          { name: "grade", type: "uint8" },
          { name: "scanBlock", type: "uint64" },
          { name: "ruleVersion", type: "uint32" },
          { name: "bundleHash", type: "bytes32" },
        ],
      },
    ],
    [entries.map((e) => ({ asset: e.asset as Address, grade: GRADE[e.grade], scanBlock: BigInt(e.scanBlock), ruleVersion: e.ruleVersion, bundleHash: e.bundleHash as Hex }))],
  );
}
