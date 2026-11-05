# 05 · Product

## Modules

| Module | What it does | Web2 analogy | Hackathon (M0) | Startup |
|---|---|---|---|---|
| **Floor Graph** (resolver) | Maps each asset's dependency tree across chains: bridges, verifier operators, owners, Safe thresholds/modules/guards, timelocks, proxy admin + implementation, oracles, mint authorities | Wiz security graph | LayerZero (+ CCIP 2.0 read) for rsETH and Aave-exposed adapters | Every major bridge stack, every listed collateral |
| **Policy + drift engine** | Compares actual state to lender rules and the issuer's manifest; versioned rule packs; output = grade + reasons + evidence | Terraform plan + OPA | Aave rule pack v0 ([04](04-aave-framework.md)) | Per-lender packs, custom policies |
| **Inbound-limit test** | Fork-simulates a max-size forged inbound message per adapter to see if the app layer bounds it | Chaos test / pentest | 39 Aave-exposed adapters ([09](09-inbound-limit-test.md)) | Continuous, every bridge |
| **Floor Rating** | Signed ratings via Chainlink CRE, mirrored cross-chain with CCIP, history on Arkiv, evidence on Swarm; recomputable in the browser | SSL Labs grade + audit log | CRE simulation, CCIP lane, Arkiv testnet | Production DON, public API |
| **Floor Enforcers** | Bounded adapters that only reduce risk | Admission controller | Morpho Vault V2 Sentinel (mainnet, our vault); Aave freeze on a fork | Aave (via governance), Morpho curators, Euler hooks, Spark, Compound, Fluid |
| **Floor Check** (shift-left) | Pre-sign simulation of a Safe tx on a fork + diff of effective state; CI gate | CI gate / pre-commit hook | CLI | GitHub Action, Safe app |
| **Floor Guard** | Fail-open, post-state Safe guard (seatbelt, not a lock) | Admission webhook (fail-open) | Fork/testnet only ([08](08-safe-guard-findings.md)) | Audited release |
| **Blast radius** | "What depends on component X?" across lenders, in one query | Service dependency map | Query over the M0 graph | Full graph |
| **Floor Manifest** | Open standard (ERC draft) where an issuer signs intended posture ("≥3 DVNs per route, Safe 4-of-7, 48h timelock") | Desired-state file | Draft schema | ERC + tooling |
| **Floor Attest** | Issuer dashboard: continuous compliance, evidence pack for listing proposals, drift alerts | Vanta | — | Paid product |
| **API and feeds** | For insurers, exchanges, custodians, wallets | Data licensing | Read API | Paid tiers |

## Grades

| Grade | Meaning | Example lender action |
|---|---|---|
| `OK` | Meets the lender's rules and the issuer's manifest | Normal lending |
| `DEGRADED` | Weaker than required but not trivially breakable (e.g. 2 verifiers, Safe without timelock, outbound-only rate limit) | Lower caps / borrow limit |
| `BREACHED` | One effective verifier, EOA controls settings, unpinned receive library on exposed route, mint/upgrade by one key | Freeze new supply/borrow, LTV 0 (Aave) or cap → 0 (Morpho Sentinel). Repay, withdraw, liquidations continue |
| `UNKNOWN` | Data unavailable or unmapped component | Lender's choice; default treat as DEGRADED |

## What Floor never does (enforced by invariant tests)

- Never moves funds.
- Never pauses a protocol.
- Never blocks repayment or withdrawal.
- Never blocks liquidations.
- Never touches price feeds.
- Never re-enables by itself (re-enable is governance/curator only).
- Never claims to stop a malicious signing quorum.

## Product principles

1. **Effective state, not declared state.** Resolve defaults, thresholds and operators before scoring.
2. **Evidence on every grade.** Block number, call, return value.
3. **Recomputable by anyone.** Deterministic from public chain data; browser verifier via Anon-RPC.
4. **Fail-safe enforcement.** Only reduce risk; graded responses; humans re-enable.
5. **Neutral and cross-lender.** No lender owns the map of what it shares with competitors.
