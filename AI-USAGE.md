# AI usage

ETHGlobal requires documenting where and how AI tools were used ([docs/18](docs/18-ethglobal-rules.md)). This file is updated with every change that AI assisted.

| Area / files | Tool | How AI was used | Human role |
|---|---|---|---|
| `docs/` (all research and design docs) | Claude Code | Web and governance research, onchain reads via `cast`, drafting and evidence audit of claims | Problem choice, product decisions, sponsor picks, review of every claim |
| `docs/evidence/guard-proof/` | Claude Code | Wrote the Foundry fork tests and PoC guards to test the Safe guard claim | Defined the question, reviewed and re-ran results |
| `docs/evidence/onchain/` | Claude Code | Scripts reading LayerZero config at pinned blocks | Chose what to verify, reviewed outputs |

Planning artifacts and specs live in `docs/` and stay in the repo, as ETHGlobal requires.
