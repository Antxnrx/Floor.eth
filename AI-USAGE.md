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
| `apps/verify-lab/`, `docs/evidence/anon-rpc/` | AI coding assistant (LLM) | Drafted the Anon-RPC integration page, ran it in Chrome over Nym / passthrough / direct, diagnosed provider rate limits and content-type rejections, and wrote up the measured runs | Chose Anon-RPC as the default path and what counts as an honest traffic share |
| `docs/evidence/cre/` | AI coding assistant (LLM) | Ran the CRE CLI simulation and fixed the workflow's URL validation for the WASM runtime | Logged in to CRE and requested deploy access |

Planning artifacts and specs live in `docs/` and stay in the repo, as ETHGlobal requires.
