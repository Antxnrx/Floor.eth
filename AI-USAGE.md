# AI usage

ETHGlobal requires documenting where and how AI tools were used ([docs/18](docs/18-ethglobal-rules.md)). This file is updated with every change that AI assisted.

| Area / files | Tool | How AI was used | Human role |
|---|---|---|---|
| `docs/` (all research and design docs) | AI coding assistant (LLM) | Web and governance research, onchain reads via `cast`, drafting and evidence audit of claims | Problem choice, product decisions, sponsor picks, review of every claim |
| `docs/evidence/guard-proof/` | AI coding assistant (LLM) | Wrote the Foundry fork tests and PoC guards to test the Safe guard claim | Defined the question, reviewed and re-ran results |
| `docs/evidence/onchain/` | AI coding assistant (LLM) | Scripts reading LayerZero config at pinned blocks | Chose what to verify, reviewed outputs |
| `packages/core/` | AI coding assistant (LLM) | Drafted types, rule engine, independence math, canonical hashing and unit tests | Specified rules from the Aave framework, reviewed edge cases (fake-3, NIL, dead DVN, operator collapse) |
| `packages/resolver/` | AI coding assistant (LLM) | Drafted the LayerZero scanner, multi-RPC cross-check, CLI and fixture tests | Chose the correctness fixture, verified output against onchain facts |
| `apps/web/` | AI coding assistant (LLM) | Drafted the wireframe prototype of all screens | Screen list and copy rules; frontend owner restyles |

Planning artifacts and specs live in `docs/` and stay in the repo, as ETHGlobal requires.
