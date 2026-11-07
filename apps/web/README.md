# @floor/web: the site

Landing page, Live market, Kelp simulation and the reference screens. Live at https://floor.aexiz.in (GitHub Pages) and on Swarm (every deploy; URL in the deploy workflow summary).

```bash
pnpm install                       # repo root
pnpm --filter @floor/web dev       # builds the landing, then http://localhost:5173
pnpm --filter @floor/web build     # landing (landing-source → public/landing) + typecheck + app, base "./", hash routes
scripts/build-site.sh              # the deployed site: this app at /, apps/verify-lab at /verify/
```

## Routes

| Route | Screen | File | Data |
|---|---|---|---|
| `#/` | Landing (static page in an iframe; `details.html` is the long version) | `screens/Landing.tsx`, `landing-source/` | sourced copy; "Live now" receipts from `@floor/deployments` |
| `#/live` | **Live market**: every Aave V3 market read from its chain every 60 s; collateral, supply, LayerZero exposure; config-watch panel | `screens/LiveMarket.tsx` | `@floor/live`, `docs/evidence/inbound`, `docs/evidence/watch` |
| `#/kelp` | **Kelp simulation**: the fork replay (without/with Floor) and the live testnet loop (CRE → CCIP → Morpho cap cut), read from the chains | `screens/Others.tsx` | `data/live.ts` (`@floor/deployments`) |
| `#/scan` | rsETH scan: full rule-pack grades at fixed blocks (REAL) plus labelled MOCK rows | `screens/Dashboard.tsx` | `data/mock.ts` |
| `#/asset/:key` | Asset detail: verdict, controllers, routes, rule results, raw evidence calls | `screens/Asset.tsx` | `EvidenceBundle` |
| `#/verify/:key` | Launches the real verifier (`/verify/`, served alongside) and shows the last recorded live run | `screens/Verify.tsx` | `@floor/deployments` |
| `#/docs` | Long-form docs | `screens/Docs.tsx` | `data/site.ts` |
| `#/blast`, `#/check` | Blast radius, pre-sign check (MOCK UI states; Floor Check is planned) | `screens/Others.tsx` | mock |
| `#/rules`, `#/about` | Rule pack with citations; CROPS and trust model | `screens/Others.tsx` | static |

## Rules

- **REAL** rows are actual scans; **MOCK** rows are invented UI states and keep their badge (evidence policy, `docs/00`).
- Addresses, RPCs and tx hashes come from `@floor/deployments`, never hard-coded in screens.
- Copy: no "drainable", no "would have saved $X", no "first" (`docs/03`, `docs/14`).
- Known CROPS gap: the landing and app load fonts from Google Fonts; the verify pages bundle theirs. Self-hosting here is open.
