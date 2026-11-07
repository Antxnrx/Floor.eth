# 15 · Are we ready to build? (honest check, 2026-11-06 ~02:40 IST)

> **Status at submission (2026-11-07):** all nine must-haves are done and live on testnets; the table below is updated. The rest of this file is the original pre-build check, kept as the record.

**Verdict: yes. Research is done; start building now.** Nothing left needs more research. What's left is setup actions, one booth question and a hard scope cut. Deadline: **Sat Nov 7 2026, 09:00 IST** (verbatim, event details page); our internal target is 07:00 IST, so roughly **28 hours** from this check.

## Build status (updated 2026-11-07, at submission)

| Must-have | Status | Where |
|---|---|---|
| 1. Resolver (effective state, 3-RPC cross-check) | ✅ done, rsETH fixture passes live | `packages/resolver` |
| 2. Rule pack v0 + grades with evidence | ✅ done | `packages/core` |
| 3. Inbound-limit probe | ✅ done: 64 adapters on 8 chains (all-chain rerun 2026-11-07), calibrated on rsETH/weETH; published to Arkiv | `packages/resolver`, `docs/09` |
| 4. CRE workflow → FloorRegistry | ✅ code + tests + **CRE CLI v1.39.0 simulation passes** (dry run, 4 mainnet reads matched; `docs/evidence/cre/simulate-2026-11-06.txt`); deploy access not granted for the hackathon (simulation is enough for the prize, docs/11); **`cre workflow simulate --broadcast` wrote rsETH = BREACHED to FloorRegistry on Sepolia**; refuses a lying feed and forged evidence; log trigger on `UlnConfigSet` (`docs/evidence/cre/`) | `cre/floor-rating` |
| 5. CCIP send → FloorMirror state change | ✅ live: Sepolia → Base Sepolia, delivered in 17.7 min; the sentinel then cut a Morpho Vault V2 cap to 0 | `contracts`, `docs/evidence/live-2026-11-07.md` |
| 6. Arkiv mirror + judged files | ✅ live on Rabdi: rating, 52 routes, 64-adapter dataset, rsETH flight recorder; read by the verify and dataset pages | `packages/publish`, `arkiv/` |
| 7. Web page with browser verify | ✅ live at https://floor.aexiz.in/verify/ and on Swarm: Arkiv → Swarm → registry → 624/624 reads over Tor, 99.7–99.8% via Anon-RPC; the app links to it | `packages/verifier`, `apps/verify-lab`, `apps/web` |
| 8. Kelp replay on a fork | ✅ done with the attacker's real txs | `contracts/test/fork/KelpReplay.t.sol` |
| 9. Swarm evidence + `swarm.md` | ✅ bundle on the public network (through the public gateway's stamp), whole site on Swarm | `packages/publish`, `arkiv/swarm.md` |
| + Live market | ✅ all 24 Aave V3 markets read in the browser every minute; config watcher every 15 min, probe hourly (GitHub Actions) | `packages/live`, `.github/workflows` |

Credential-dependent steps are listed as ready-to-run commands in the root `README.md` ("Commands that need your credentials").

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
| B1 | Bun ≥ 1.2.21 ✅ installed (1.3.1). Still needed: CRE CLI, `cre login`, `cre account access` → "Hackathon" | CRE TS SDK needs Bun; deploy approval takes time; simulation works meanwhile |
| B2 | ✅ Done: Arkiv faucet + access key (self-serve, hub.arkiv.network) | Writes to Rabdi testnet |
| B3 | ✅ Done on testnets (Sepolia, Base Sepolia); mainnet dropped (no real funds) | Testnet loop |
| B4 | Archive-capable mainnet RPC for forks (public RPCs worked for reads; heavy fork tests may need a keyed provider) | Fork probe + replay |
| B5 | ✅ Not needed: the public gateway stamps uploads; own batch for production | Swarm bonus |
| B6 | ✅ Done: Apache-2.0 licence added | Required by Arkiv and CROPS |
| B7 | Booth: "Can one team win both CRE and CCIP?" (ETHGlobal says all of a partner's tracks count as one pick; winning multiple is the partner's call) | Avoid wasted work |
| B8 | ✅ Done: Sepolia → Arbitrum Sepolia and Sepolia → Base Sepolia are v2.0 lanes (`getLaneFeatures`); the live send used Base Sepolia | "CCIP 2.0" claim |

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
9. Swarm evidence bundles linked from Arkiv (`swarmRef` + `bundleHash`), and the browser verifier reading them from Swarm, plus `/arkiv/swarm.md` ([20](20-swarm-design.md)).

**Should have (status 2026-11-07: done on testnets, see `docs/evidence/live-2026-11-07.md`; mainnet is a post-hackathon milestone):** mainnet loop with Morpho Sentinel on our own vault; site hosted on Swarm behind a feed + per-asset "latest" feed; `floor check` CLI pre-sign simulation.

**Stretch:** blast-radius query; CCIP 2.0 CCV scoring; guard on testnet; Compound III / Euler legs of the replay.

**Cut if behind at Fri 14:00 IST:** mainnet loop → fork-only enforcement; site-on-Swarm → keep evidence bundles only.

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

- Whether our inbound-limit count matches 35/39 (resolved: lists overlap and agree where both probed; we do not claim to reproduce 35/39, see docs/09).
- CCIP lane version on the chosen pair.
- CRE's 15 EVM reads per execution: the workflow re-checks a critical subset, the resolver supplies the rest ([19](19-sponsor-dev-reference.md)).
- Anon-RPC traffic-share measurement (no documented method; we count in our own wrapper).
- Arkiv SDK is schema-based (`defineSchema`, `expiration` required); old payload/annotations examples are stale.
