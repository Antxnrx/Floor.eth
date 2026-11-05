# 14 · Risks, honest limits, judge Q&A

## Say these first, before judges do

- The fork replay uses admin impersonation to install the enforcer ("governance would vote this in").
- Enforcement on a lender needs that lender's governance or curator to opt in. Morpho Sentinel needs only the vault owner.
- The Safe guard is a seatbelt, not a lock: modules, EOA/timelock delegates, LayerZero default changes and a malicious quorum are outside it; monitoring covers those.
- The inbound-limit test proves "no app-level inbound limit", not "drainable".
- CRE: simulated unless deploy access is granted.

## Judge Q&A

| Question | Answer |
|---|---|
| "Aave already built a Freeze Guardian." | Aave-only and signal-triggered. rsETH's verifier config never changed for 12.5 months, so there was no signal. Floor grades standing state across lenders and can feed Aave's guardian; both run on CRE. |
| "LayerZero fixed 1-of-1." | LayerZero Labs' DVN stopped serving 1/1 and says defaults will be ≥3-of-3, but defaults remain LayerZero-controlled and changeable, app configs vary, and 35 of 39 Aave-exposed adapters reportedly lack inbound limits (community analysis; we reproduce it). |
| "Counting DVNs is trivial." | Effective count isn't: defaults (`0`), NIL (`255`), optional thresholds and same-operator collapse all change the answer. Our fork test shows "3 DVNs" that are really any-1-of-3. |
| "You'd freeze half the market." | Graded responses: DEGRADED lowers caps; only BREACHED freezes new exposure. Issuer manifests explain intended setups. |
| "Is automatic enforcement dangerous?" | Bounded authority: only reduces risk, never moves funds, never blocks repay or liquidation, re-enable is human. Invariant tests prove it. |
| "The demo uses god mode." | On the fork, yes, and we say so. The mainnet loop uses real Morpho Sentinel permissions on our own vault. |
| "Who maps the graph?" | Automated for standard components; curated operator map; issuer manifests. This curation is also the moat. |
| "Feature, not company." | Two-sided compliance network (issuers attest, lenders enforce) plus insurers and exchanges; comparable to how SOC 2 created Vanta. |
| "Liability if Floor misses something?" | Floor enforces rules the lender chose and publishes evidence; it does not guarantee safety. |
| "Why would a curator pay?" | Unknown until we ask: HYPOTHESIS. Collect one real quote at the event. |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Live scan comes back "clean" on the 3-verifier rule | Weak slide | Already expected (~99.98% passes). Headline = inbound limits + effective-state traps + drift |
| Our inbound-limit numbers differ from the community's | Credibility | Per-route reconciliation before publishing; publish scripts and fork block |
| Arkiv testnet / SDK friction | Prize risk | Use only Rabdi endpoints; write `friction.md` as we go |
| CCIP lane not v2.0 | Prize wording | Detect lane version; choose a v2.0 lane |
| CRE deploy not approved | None for prize | Simulation is accepted |
| Scope too big for ~28 hours | Unfinished demo | Must-have vs stretch cut ([15](15-readiness.md)) |
| A wrong number on stage | Reputation | Evidence policy ([00](00-evidence-policy.md)); every number links to source |
| Competitor overlap (ZKSC / Ninja dependency graph) | Originality | Blast radius is a module, not the headline |

## Odds (ESTIMATE, not data)

| Outcome | Estimate |
|---|---|
| Kelp replay working end to end | 65–75% |
| ETHGlobal finalist (base rate ~2%: ~10 of 400–650) | 15–22% |
| Arkiv prize | 40–55% |
| EF prize | 25–40% |
| CCIP | 15–25% |
| CRE | 10–15% |
| At least one prize | 65–75% |
| Grant within 3 months | 25–35% |
