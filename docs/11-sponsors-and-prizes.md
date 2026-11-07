# 11 · Sponsors and prizes (verbatim rules, how we qualify)

Read from the live prize pages on 2026-11-06. Partner picks: the Arkiv page says "Arkiv's prizes count as one partner prize on ETHGlobal, so it does not use another of your **three picks**." Our three picks: **Chainlink, Arkiv, Ethereum Foundation.**

Dropped: Uniswap (crowded), Arc (requires Arc Studio), Whitechain (requires USDT payment flows), World and ENS (crowded).

## ETHGlobal finalists (verbatim)

"For the top 10 teams." "If your project is selected as a finalist, each team member receives the prize and travel reimbursement below, based on your team size." 3–5 people: **1,000 USDC prize per person, 500 USDC travel per person**. Finalist pack: ETHGlobal Plus discount, hoodie, $10,000 AWS credits.
Judging criteria (event details page): Technicality, Originality, Practicality, Usability, WOW Factor. Finalist slot: 4 min demo + 3 min Q&A.
Submission deadline (event details page, verbatim): "**Saturday, November 7th 2026** at **09:00 am IST**." Internal target: 07:00 IST. Full rules: [18](18-ethglobal-rules.md).

## Chainlink ($5,000) · https://ethglobal.com/events/mumbai/prizes/chainlink

**Best workflow with CRE: $1,500**
- "Build, simulate, or deploy a CRE Workflow that's used as an orchestration layer within your project. _Note_: It is NOT mandatory to deploy it during the hackathon, simulation is enough!"
- "Integrate at least one blockchain with an external API, system, data source, LLM, or AI agent."
- "Demonstrate a successful simulation (via the CRE CLI) or a live deployment on the CRE network."
- "Be meaningfully used in your project"

**Best use of Chainlink CCIP 2.0: $3,500 (up to 2 teams × $1,750)**
- "Each project must use Chainlink CCIP in some form to make a state change on a blockchain… Using Chainlink CCIP inside your smart contracts is required."
- No network, lane, testnet or mainnet requirement is stated.

**Our fit:** CRE computes the rating from chain reads + an external source (operator registry / evidence store) and writes a signed report. CCIP: `FloorRegistry` sends status; `FloorMirror._ccipReceive` changes state on the second chain.
**CRE deploy:** needs approval (`cre account access`, choose "Hackathon"; granted per organisation, reply by email; docs updated 2026-10-09). Simulation is enough for the prize.
**CCIP 2.0 lanes (checked 2026-11-06 with `@chainlink/ccip-sdk@1.16.1` `getLaneFeatures`):** Ethereum Sepolia → Arbitrum Sepolia, Ethereum Sepolia → Base Sepolia and Base → Arbitrum (mainnet) all report `FINALITY_FAST` defined, i.e. v2.0+ lanes. Background: progressive rollout (changelog Jun 11 2026: Ethereum↔Ink, Ethereum↔Mantle, 0G↔Plume); v2.0 tutorials use Ethereum Sepolia ↔ Arbitrum Sepolia; detect lane version with `@chainlink/ccip-sdk`. Claim "CCIP 2.0" only on a v2.0 lane.
**Open question for the booth:** can one team win both CRE and CCIP?

## Arkiv ($15,000) · https://ethglobal.com/events/mumbai/prizes/arkiv

Network: RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network` · Explorer `https://rabdi.explorer.arkiv.network` · Indexer `https://indexer.rabdi.db-chain.testnet.arkiv.network` · Faucet `https://hub.arkiv.network/faucet` · Access keys `https://hub.arkiv.network/access-keys` · Chain ID **7794095** (we confirmed `eth_chainId` = `0x76edaf`). Old Kaolin/Mendoza endpoints are dead.

**Our track: "Mirror something Ethereum depends on": $3,000 / $1,000.** We mirror the effective security configuration of LayerZero (and CCIP 2.0) routes for collateral assets, with history, into Arkiv entities anyone can query.
- Judged (25% each): `/arkiv/friction.md`, `/arkiv/reach.md`, `/arkiv/why-arkiv.md`, `/arkiv/data-quality.md`.
- Requirements (verbatim): "Built from scratch at ETHGlobal Mumbai" · "The data's license allows republishing. Link it in your README." (onchain public data; state this) · "Not Sourcify data, from any chain." · "Your import script is in the repo, and we can re-run it." · "Your project writes to Arkiv's current testnet … with `@arkiv-network/sdk` or the JSON-RPC API, and a feature or query people use reads the data from Arkiv." · "In your README: the wallet address(es) that wrote your entities, and one query we can run." · "`/arkiv/schema.md` … `/arkiv/friction.md`" · "A public repo with an open-source license. Say how you used AI".
- "Each team can win one Arkiv track prize; the Arkiv + Swarm bonus can come on top of it."
- Alternative if judges prefer: "Build on Arkiv (from scratch)" $3,000 / $1,000, adds `/arkiv/how-you-use-arkiv.md`.

**Arkiv + Swarm bonus (from scratch): $500**, on top of a track prize; select it at submission. `/arkiv/swarm.md` must include: what is on Swarm vs Arkiv and which entity field holds the reference; one entity key + Swarm reference with a link; postage batch ID + buying wallet + Bee node/service; upload/read files; steps to run one upload and one read; the demo-video moment; friction. **Never store an encrypted Swarm reference in a public entity as-is.**

## Ethereum Foundation ($15,000) · https://ethglobal.com/events/mumbai/prizes/ethereum-foundation

"One EF prize per project. You can submit to anon-rpc, the alt mempool and CROPS, but you will be placed in at most one."

**Best Use of Anon-RPC: $2,500 / $1,500 / $1,000**
- Requirement: "Your app routes its RPC reads through Anon-RPC by default."
- Judged: works end to end; UX; "how much of the app's traffic goes through Anon-RPC" (intentional exclusions are fine if explained); could ship; technical depth. Idea list includes "combine anon-rpc with a light client or proof verification".
- Docs: https://ethereum.github.io/anon-rpc/ · https://github.com/ethereum/anon-rpc

**Best CROPS App: $2,000 / $1,000 / $500**
- FOSS licence + README that explains how to run; README section titled **CROPS** (C/O/P/S lines); demo ≤3 min showing the moment it matters (e.g. switch off the backend, swap RPC); no third-party trackers or analytics.

**Our fit:** the browser verifier recomputes a grade from chain reads routed through Anon-RPC by default, and keeps working with Floor's backend switched off. Lead property: **private + censorship-resistant verification** (no RPC provider can see or target which assets a risk team checks: the Kelp attack was RPC poisoning aimed at one verifier).

## Submission checklist

Status 2026-11-07. Live site: https://floor.aexiz.in. Live tx record: [`evidence/live-2026-11-07.md`](evidence/live-2026-11-07.md).

- [x] Public repo, open-source licence, steady commit history.
- [x] README: what it does, architecture, setup, contract addresses, how AI was used.
- [ ] Demo video 2:30–2:55 (ETHGlobal requires 2–4 min; CROPS caps at 3 min), ≥720p, no speed-up, no AI voiceover.
- [x] AI usage documented per file/area (`AI-USAGE.md`); specs/prompts/planning docs in repo.
- [ ] Per-partner integration explanation + feedback text ready for the submission form.
- [ ] CRE simulation shown in the video (chain + external source).
- [x] CCIP message delivered (Sepolia → Base Sepolia); `_ccipReceive` changes state; tx links.
- [x] Arkiv: writes on Rabdi testnet; a user-visible feature reads back; re-runnable importer; data licence; writer wallet(s) + one runnable query in README.
- [x] `/arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `data-quality.md`.
- [x] `/arkiv/swarm.md` with all seven items. [ ] Swarm bonus selected at submission.
- [x] Anon-RPC default for every read on the verify and dataset pages; traffic share shown. (The Live market tab reads public RPCs directly; it is a dashboard, not the verifier.)
- [x] README "CROPS" section; no trackers. [ ] Backend-off moment in the demo.
