import type { AssetState, Verdict } from "./types.js";
import { bundleHash } from "./canonical.js";

/** Evidence bundle v0 (docs/20-swarm-design.md). Stored on Swarm; hash stored on Arkiv and in the CRE report. */
export interface EvidenceBundle {
  schema: "floor.evidence/v0";
  state: AssetState;
  verdict: Verdict;
  generator: { name: string; version: string; commit: string | null };
}

export function makeBundle(state: AssetState, verdict: Verdict, commit: string | null = null): { bundle: EvidenceBundle; hash: `0x${string}` } {
  const bundle: EvidenceBundle = {
    schema: "floor.evidence/v0",
    state,
    verdict,
    generator: { name: "floor-resolver", version: "0.1.0", commit },
  };
  return { bundle, hash: bundleHash(bundle) };
}
