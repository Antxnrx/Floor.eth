# AI usage

ETHGlobal requires documenting where and how AI tools were used ([docs/18](docs/18-ethglobal-rules.md)). This file is updated with every change that AI assisted.

| Area / files | Tool | How AI was used | Human role |
|---|---|---|---|
| `docs/` (all research and design docs) | AI coding assistant (LLM) | Web and governance research, onchain reads via `cast`, drafting and evidence audit of claims | Problem choice, product decisions, sponsor picks, review of every claim |
| `docs/evidence/guard-proof/` | AI coding assistant (LLM) | Wrote the Foundry fork tests and PoC guards to test the Safe guard claim | Defined the question, reviewed and re-ran results |
| `docs/evidence/onchain/` | AI coding assistant (LLM) | Scripts reading LayerZero config at pinned blocks | Chose what to verify, reviewed outputs |
| `packages/core/` | AI coding assistant (LLM) | Drafted types, rule engine, independence math, canonical hashing and unit tests | Specified rules from the Aave framework, reviewed edge cases (fake-3, NIL, dead DVN, operator collapse) |
| `packages/resolver/` | AI coding assistant (LLM) | Drafted the LayerZero scanner, multi-RPC cross-check, inbound-limit probe (harness self-check, binary-searched caps), CRE feed builder, CLIs and tests | Chose the correctness fixture and calibration targets, verified output against onchain facts |
| `packages/verifier/` | AI coding assistant (LLM) | Drafted the browser verifier (raw replay, state-vs-raw, grade reproduction), transports, Anon-RPC adapter and tamper tests | Defined the three verification links and the failure states |
| `packages/publish/` | AI coding assistant (LLM) | Drafted Arkiv schemas and queries, Swarm upload and hash-checked fetch, the re-runnable importer, tests | Chose the Arkiv/Swarm split and which fields to index |
| `cre/floor-rating/` | AI coding assistant (LLM) | Drafted the CRE workflow, its pure verification logic, vitest and CRE SDK runtime tests | Defined the trust model (re-read at the pinned block, lower-bound grade) |
| `contracts/` | AI coding assistant (LLM) | Drafted the contracts, unit/fuzz/invariant tests, Base and mainnet fork tests, the Kelp replay and deploy scripts | Defined the bounded-authority invariants and the replay scenarios |
| `arkiv/` | AI coding assistant (LLM) | Drafted the judging files from the built code and the friction we observed | Reviewed claims and numbers |
| `apps/web/` | AI coding assistant (LLM) | Drafted the wireframe prototype of all screens | Screen list and copy rules; frontend owner restyles |
| `apps/web/src/components/VolumetricLight.tsx` | AI coding assistant (LLM) | Wrote the WebGL volumetric-light shader and its React wrapper from scratch (no library added); tuned exposure by sampling rendered pixels | Asked for the effect, referenced an unlicensed repo, accepted a fresh implementation of the technique rather than a copy |
| `apps/web/src/theme.css`, `styles.css`, `screens/{Dashboard,Asset,Verify}.tsx` | AI coding assistant (LLM) | Extracted one shared token set, restyled the app shell to match the landing, and reworked the three demo-path screens: binding-constraint line on the scan, verdict banner and denser route table on asset detail, stateful verification run | Chose dark-only and the demo-path scope, decided the scan must show why a grade is capped, required the simulated-progress caveat stay visible |
| `apps/web/src/screens/Landing.tsx`, `src/landing.css`, `src/data/landing.ts` | AI coding assistant (LLM) | Built the landing page: layout, styles, scroll reveal, responsive restack, SVG film grain, hero gradient wash, glyph-decode on the figures, and a route ticker derived from the real `rseth-24908284` fixture; every figure sourced from `docs/` and `README.md`; routed it at `#/` and moved the prototype to `#/scan` | Chose the visual direction ("evidence terminal") and the four motion treatments, the section order, and which claims appear; required that only Floor-reproduced numbers are shown |

Planning artifacts and specs live in `docs/` and stay in the repo, as ETHGlobal requires.
