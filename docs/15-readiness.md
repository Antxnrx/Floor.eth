# 15 · Are we ready to build? (honest check, 2026-11-06 ~02:40 IST)

**Verdict: yes. Research is done; start building now.** Nothing left needs more research. What's left is setup actions, one booth question and a hard scope cut. Deadline: **Sat Nov 7 2026, 09:00 IST** (verbatim, event details page); our internal target is 07:00 IST, so roughly **28 hours** from this check.

## Done and verified

- Every number in the brief audited against primary sources / onchain; corrections logged ([00](00-evidence-policy.md)).
- Aave rules verbatim + both Snapshot votes confirmed ([04](04-aave-framework.md)).
- Kelp onchain timeline re-read, including delegate history and receive-library pin status ([03](03-kelp-onchain-timeline.md)).
- Safe guard design proven with 17 passing fork tests ([08](08-safe-guard-findings.md)).
- Effective-state semantics for LayerZero and CCIP 2.0 from source/docs ([07](07-effective-state-rules.md)).
- Prize rules read verbatim for Chainlink, Arkiv, EF ([11](11-sponsors-and-prizes.md)); ETHGlobal rules read verbatim ([18](18-ethglobal-rules.md)).
- Arkiv Rabdi testnet live (chain ID 7794095 answered).
- Toolchain on the main machine: Node 26, pnpm 10, Go 1.27, Python 3.14, Docker 28, Foundry 1.8.1 (in `~/.foundry/bin`; add it to PATH).

## Blockers (owner actions, first hour, in parallel)

| # | Action | Why |
|---|---|---|
| B1 | Install CRE CLI, `cre login`, `cre account access` → "Hackathon" | Deploy approval takes time; simulation works meanwhile |
| B2 | Arkiv: faucet + access key (hub.arkiv.network) | Writes to Rabdi testnet |
| B3 | Deployer wallet funded on the two demo chains (+ CCIP fees; a little USDC for the Morpho vault) | Mainnet loop |
| B4 | Archive-capable mainnet RPC for forks (public RPCs worked for reads; heavy fork tests may need a keyed provider) | Fork probe + replay |
| B5 | Swarm postage batch (own Bee node or a service) | Swarm bonus |
| B6 | Choose and add an open-source licence | Required by Arkiv and CROPS |
| B7 | Booth: "Can one team win both CRE and CCIP?" (ETHGlobal says all of a partner's tracks count as one pick; winning multiple is the partner's call) | Avoid wasted work |
| B8 | Pick the CCIP lane and check its version with `@chainlink/ccip-sdk` | "CCIP 2.0" claim |

## Scope cut

**Must have (demo fails without these):**
1. Resolver: LayerZero effective state (receive + send, defaults, NIL, optional threshold, libraries + pin + grace period, owner/delegate/Safe) at a pinned block.
2. Rule pack v0 + grades with evidence.
3. Inbound-limit fork probe over the 39 Aave-exposed adapters, reconciled with the community list.
4. CRE workflow (simulated) → `FloorRegistry`.
5. CCIP send → `FloorMirror` state change.
6. Arkiv mirror (importer + one user-facing query) + the four judged files + `schema.md`.
7. Web page: asset grade + evidence + browser verify through Anon-RPC, backend-off moment.
8. Kelp replay on a fork: borrow reverts on Aave.

**Should have:** mainnet loop with Morpho Sentinel on our own vault; Swarm evidence bundles + `swarm.md`; `floor check` CLI pre-sign simulation.

**Stretch:** blast-radius query; CCIP 2.0 CCV scoring; guard on testnet; Compound III / Euler legs of the replay.

**Cut if behind at Fri 14:00 IST:** mainnet loop → fork-only enforcement; Swarm → drop the bonus.

## Rules we must not break (from [18](18-ethglobal-rules.md))

- Commit small and often from now on. "Any repositories with single commits of large files without proper history will be default assumed to be unqualified."
- All project code is written after the start. Do not import pre-event project code; public libraries and starter kits are fine, disclosed.
- Document AI use per file/area, and keep specs, prompts and planning docs in the repo (this `docs/` folder counts).
- Demo video: 2–4 minutes (hard limit), and the CROPS prize caps it at 3 minutes, so aim for **2:30–2:55**. At least 720p, no speed-up, no AI voiceover, not recorded on a phone.
- Finalist pitch: 4 min demo + 3 min Q&A.

## First-hour build tasks

1. Repo skeleton (`/apps/web`, `/packages/resolver`, `/contracts`, `/cre`, `/arkiv`, `/docs`), licence, CI running `forge test` + resolver unit tests.
2. Resolver against rsETH at block 24,908,284. It must output: 24/26 routes with one DVN, eids 30217 and 30325 with two, Unichain receive library unpinned. This is the correctness test.
3. Start the inbound-limit probe on the rsETH adapter; then fan out.

## Known unknowns (track, don't block)

- Whether our inbound-limit count matches 35/39.
- CCIP lane version on the chosen pair.
- Arkiv SDK expiry parameter name in the current SDK.
- Morpho V2 factory addresses on the chosen chains.
