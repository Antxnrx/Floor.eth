# verify-lab

The verify page and the bridge dataset page. Live at https://floor.aexiz.in/verify/ and `/verify/dataset.html` (and on Swarm, same paths). The verifier runs with every read routed through EF Anon-RPC (Tor by default); no Floor server is involved. Both pages use the app's own `theme.css` and `styles.css` (`src/page.css`), and bundle their fonts so no third party sees the visitor.

```bash
pnpm install
pnpm --filter @floor/verify-lab dev        # http://127.0.0.1:5181
```

Evidence sources:
- **Arkiv → Swarm** (default): latest `floor.rating` for the asset **created by** the writer wallet → its `swarmRef` and `bundleHash` → `GET {gateway}/bytes/{swarmRef}` → keccak256 of the bytes must equal `bundleHash` → replay. Both are published (README steps 7 and 8); with no rating from the writer it stops with "no floor.rating … created by …".
- **Swarm by hand:** give a reference and the expected hash (e.g. a local bee-factory upload).
- **Local copy:** the fixture shipped with the page (offline fallback; labelled as such in the result).
- **Optional onchain check:** a FloorRegistry address (+ its chain RPC). The CRE-signed `bundleHash` must match, or the result is MISMATCH. Skipped while empty.

Every hop is listed under the result, and the meter counts each route (`chain`, `arkiv`, `swarm`, `registry`, `bootstrap`).

URL options: `?net=nym|tor-js|passthrough|direct`, `&src=arkiv|swarm|fixture`, `&writer=`, `&token=`, `&gateway=`, `&ref=`, `&hash=`, `&registry=`, `&registryRpc=`, `&auto` (start on load), `&tamper` (flip one recorded byte, must give MISMATCH), `&rpc=<url,url>`, `&batch=10&conc=6&timeout=20000`.

Local Swarm test: `npx @ethersphere/bee-factory start --tag v2.8.1`, upload with `cd packages/publish && FLOOR_SWARM=1 npx vitest run -t "Swarm round trip"` (prints the reference), then `?src=swarm&gateway=http://localhost:1635&ref=<reference>`.

Known limit: the Nym worker drops the `Content-Type` header, so Arkiv's RPC answers 415 through Nym; the page then reads Arkiv directly and shows that on the meter (`arkiv · direct (fallback)`). Chain reads are unaffected.

What the page shows:
- status: VERIFIED / MISMATCH / UNVERIFIED_RPC / UNVERIFIED_ONCHAIN (never VERIFIED if any read failed);
- traffic meter: reads per route and the share through Anon-RPC (the 2 bootstrap reads of the specifier contract go direct, by design, and are shown);
- per-request diagnostics (latency, HTTP status per provider, JSON-RPC errors).

Measured runs, provider compatibility and caveats: [`docs/evidence/anon-rpc/2026-11-06-browser-runs.md`](../../docs/evidence/anon-rpc/2026-11-06-browser-runs.md).

Rules: never label passthrough as anonymous; keep the Content-Security-Policy compatible with the harness's srcdoc bootstrap (see the harness README) or serve its iframe page yourself.
