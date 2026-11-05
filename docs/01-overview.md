# 01 · Overview: the idea in three languages

**One line:** Floor is "Wiz + Vanta for onchain collateral". It continuously grades the *effective* security of every collateral asset (who can create or release it, how many independent parties must agree, how fast settings can change) and lets lenders enforce that grade automatically, with bounded authority.

**Pitch line:** "Kelp's attacked bridge route had one checker for 12.5 months. Every lender accepted rsETH anyway."

---

## Plain words

A lending app is like a pawn shop. You hand over something valuable (collateral) and borrow money against it. Many of those valuables are "chips" that stand for an asset kept somewhere else, like a casino chip stands for cash at the cashier. A chip is only worth something if nobody can print fake ones.

Each chip is protected by a few things: how many people must check a transfer, who is allowed to change those settings, and whether changes come with a waiting period.

In rsETH's case, one checker approved transfers on the attacked route. A single wallet set it up that way in April 2025. Control later moved to a 3-of-6 multisig, but nobody changed the single checker. An attacker fooled that one checker, got 116,500 rsETH (about $292M at the time) released, and borrowed real money against it. ([03-kelp-onchain-timeline.md](03-kelp-onchain-timeline.md))

Floor is the inspector. It reads each chip's real protection every few minutes and gives it a grade. When a chip drops below the minimum, the pawn shop automatically stops *new* loans against it. Nobody's money is moved, people can still repay, and bad loans can still be liquidated. Humans turn lending back on once the chip is fixed.

**Example (scoped):** On the day before the hack, Floor would have graded rsETH **BREACHED**: 24 of 26 Ethereum routes, including the attacked one, had a single verifier; the attacked route's receive library was not pinned; and the controlling multisig had no timelock. In our Aave Ethereum fork replay, the attacker's borrow reverts: **$0 borrowed on Aave**. (The Arbitrum, Compound III and Euler legs are separate.)

## Web2 / DevOps terms

| Floor piece | Web2 analogy |
|---|---|
| Dependency graph of every bridge, verifier, owner, Safe, timelock, proxy admin, oracle, mint key | **Wiz / CSPM** security graph |
| Issuer declares intended setup in a signed manifest; Floor diffs against chain | **Terraform drift** (desired vs actual state) |
| Each lender's listing rules as versioned policy; collateral "admitted" only if it passes | **OPA / Kubernetes admission controller** |
| Aave DAO approved a collateral security standard (Jul 2026); issuers must prove they pass, continuously | **SOC 2 → Vanta** |
| "Which reserves depend on this verifier / RPC fleet / custodian?" | **Blast-radius / service dependency map** |
| `floor check` in issuer CI + pre-sign simulation + a Safe guard | **Shift-left: pre-commit hooks, CI gates** |
| Continuous collectors over many chains with reorg handling, retries, history | **Observability pipeline (ELK / Loki-style)** |
| Never pause, never block repay/liquidation; only reduce risk; humans re-enable | **Fail-safe automation with bounded blast radius** |

## Web3 terms

- **Resolver.** For each asset: OApp/OFT adapter → peers per endpoint ID → effective ULN config per route via `EndpointV2.getConfig` (which resolves app config against the endpoint default: `0` = inherit default, `255` = NIL) → required/optional DVNs, optional threshold, confirmations → send/receive library and whether it is pinned (`isDefault`) and any receive-library grace period → delegate and owner (EOA vs Safe, threshold, modules, guard) → timelock delay → EIP-1967 admin/implementation → oracle type and mint authority. Same model for CCIP 2.0 (required/optional CCVs, threshold, finality, token-pool rate limits). See [07-effective-state-rules.md](07-effective-state-rules.md).
- **Policy.** Aave's DAO-approved risk framework encoded as rules (≥3 independent verifiers, single-operator networks count as one, pinned receive libraries, timelocked bridge authority, per-route inbound and outbound rate limits). Grades: `OK` / `DEGRADED` / `BREACHED` / `UNKNOWN`. See [04-aave-framework.md](04-aave-framework.md).
- **Attestation.** A Chainlink CRE workflow computes the grade and writes a signed report to `FloorRegistry`. CCIP carries status changes to lenders on other chains. History goes to Arkiv; evidence bundles to Swarm.
- **Enforcement with bounded authority.** Morpho Vault V2 Sentinel cap decreases (no timelock by design), Aave freeze + LTV 0 (needs a governance-granted role) or a data feed into Aave's own guardian, Euler V2 borrow hooks. Issuer side: pre-sign check and a fail-open Safe guard. Never pauses, never touches liquidations or repayments, never moves funds; re-enable is governance-only.
- **The insight.** Aave's guardian fires on hard adverse signals, for Aave only. rsETH's verifier config never changed for 12.5 months, so there was no signal. Floor grades *standing state*, so it catches risk that sits still, and it diffs state continuously, so it also catches drift.

## Positioning in one sentence per audience

- **Lenders / curators:** "Know, per collateral, whether it meets your own rules right now, and cut exposure automatically when it doesn't."
- **Issuers:** "Prove you meet Aave's framework continuously, and block bad config changes before they are signed."
- **Insurers / exchanges:** "A recomputable posture feed with history, for pricing and listing."
- **Judges:** "Aave's DAO-approved rules, run as code, across lenders, with the evidence one click away."
