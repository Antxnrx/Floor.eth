# @floor/web: UI prototype (design handoff)

Plain wireframe of every screen. The frontend owner restyles it; the structure and data contract should stay.

```bash
pnpm install            # repo root
pnpm --filter @floor/web dev      # http://localhost:5173
pnpm --filter @floor/web build    # static build in dist/ (base "./", hash routing → works on any host and on Swarm)
```

## Screens

| Route | Screen | File | Data |
|---|---|---|---|
| `#/` | Live scan: headline stats, asset table, grade filter | `screens/Dashboard.tsx` | `ASSETS`, `HEADLINE` |
| `#/asset/:key` | Asset detail: grade, controllers, routes (receive/send), rule results, raw evidence calls | `screens/Asset.tsx` | `EvidenceBundle` |
| `#/verify/:key` | Browser verification: 6 steps, Anon-RPC traffic share, failure states | `screens/Verify.tsx` | bundle (simulated progress) |
| `#/kelp` | Kelp replay: without/with Floor + onchain timeline | `screens/Others.tsx` | `KELP_TIMELINE` |
| `#/enforcement` | Live loop, read from the chains: CRE write on Ethereum Sepolia → CCIP → FloorMirror on Base Sepolia → FloorSentinel cuts a real Morpho Vault V2 cap; real txs and measured times | `screens/Others.tsx` | `EVENTS` |
| `#/blast` | Blast radius: pick an operator, see exposed assets | `screens/Others.tsx` | `ASSETS` |
| `#/check` | Issuer pre-sign check: paste Safe tx, see effective-state diff | `screens/Others.tsx` | mock |
| `#/rules` | Rule pack with verbatim citations | `screens/Others.tsx` | `RULES` |
| `#/about` | CROPS + trust model | `screens/Others.tsx` | static |

## Data contract

- All data comes from `src/data/mock.ts`. Types are from `@floor/core` (`EvidenceBundle`, `Verdict`, `Grade`).
- **REAL** rows are actual scans (`packages/resolver/fixtures/*.json`). **MOCK** rows are invented UI states. Keep the badges visible until real data replaces them (evidence policy, `docs/00`).
- Grades: `OK` / `DEGRADED` / `UNKNOWN` / `BREACHED`; rule outcomes add `SKIPPED` (not evaluated yet; never shown as passing).
- Copy rules: no "drainable", no "would have saved $X", no "first". Use the exact wording in `docs/03` and `docs/14`.

## Must-keep for prizes

- No third-party trackers/analytics/fonts from CDNs (EF CROPS).
- Verify screen must show the Anon-RPC traffic share (EF Anon-RPC judging).
- Works with the backend off (data from Arkiv + Swarm), and from a Swarm URL (`base: "./"`, hash routes).
