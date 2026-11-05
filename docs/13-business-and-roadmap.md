# 13 · Business model, moat, go-to-market, funding, roadmap

## Business model

- **Free:** public ratings, the manifest standard, open-source enforcers, browser verifier, CI check.
- **Paid:** issuer Attest, curator monitoring + Sentinel, DAO data feeds, insurer/exchange APIs.

## Moat

1. **The graph and its history** ("who controlled what, at which block"): hard to backfill later.
2. **The operator map** (which DVNs/CCVs are the same organisation or share infrastructure): curated, and required by Aave's own rules.
3. **The standard:** if lenders ask issuers for a Floor Manifest, Floor is the default.
4. **Two-sided network:** lenders require it → issuers attest → lenders get coverage cheaply.
5. **Integrations voted into lender governance are sticky.**

## Go-to-market

1. Launch at ETHGlobal with a public, reproducible report: "Aave's 3-verifier rule passes ~99.98% of exposure; the inbound-limit rule fails N of 39 routes" (only after we reproduce it).
2. **Morpho curators first** (Sentinel role works without any governance vote): free integration for the first five, then paid monitoring.
3. Aave: offer Floor checks as an input to the CRE Freeze Guardian via a governance post, with LlamaRisk.
4. Issuers: free readiness check, then paid Attest.
5. Insurers: data partnership.
6. Chainlink: a Floor **custom CCV** that refuses to attest messages on routes graded BREACHED (CCV starter kit ships Helm charts, KMS, monitoring and a custom policy hook). Strongest post-event grant story.

## Funding path (ESTIMATE)

- Months 0–3: prizes; EF ESP (open manifest standard + public ratings); Chainlink BUILD / grants; Arkiv; an Aave-funded integration.
- Months 3–6: pre-seed after 2–3 design partners (a curator, an issuer, an insurer). A paid pilot is the single fact that moves VC odds most.
- Outcomes: independent company, or acquisition by a security, data or oracle firm.

## Roadmap

| Milestone | Scope | Proof point |
|---|---|---|
| **M0 · ETHGlobal (Nov 5–7 2026)** | LayerZero resolver (effective state), Aave rule pack v0, inbound-limit fork probe on 39 adapters, Kelp replay on a fork, mainnet loop with Morpho Sentinel on our own vault, CRE (simulated) ratings, CCIP state change, Arkiv mirror + Swarm evidence, browser verify via Anon-RPC | Reproduced community numbers; attacker borrows $0 on Aave in replay; live mainnet cap cut |
| **M1 · 30 days** | Top 50 assets × LayerZero + CCIP 2.0; manifest ERC draft; weekly public report; blast-radius query | Report used by risk teams |
| **M2 · 90 days** | Morpho Sentinel live with one curator; Aave guardian data-feed proposal; `floor check` GitHub Action + Safe app | 3 design partners |
| **M3 · 6 months** | Paid Attest; insurer feed; oracle and mint-key coverage; Euler, Spark, Fluid adapters; audited guard | First revenue; pre-seed |

## Hard parts (honest)

The code is maybe 30% of the difficulty (ESTIMATE). The rest: coverage of every bridge type, the operator map, false-positive liability (a wrong BREACHED costs someone money → explainable grades + bounded enforcement), trust in the rater (deterministic, recomputable, CRE-signed), and distribution through governance.
