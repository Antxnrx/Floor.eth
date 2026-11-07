# Swarm in Floor

1. **What's on Swarm vs Arkiv.** Swarm holds each **evidence bundle**: every raw onchain read behind a grade, the decoded state, the verdict and the rule-pack version, as canonical JSON (≈300 KB for rsETH). Arkiv holds the queryable index (`floor.rating`, `floor.route`). The Swarm reference lives in **`floor.rating.swarmRef`**, and its hash in **`floor.rating.bundleHash`**. Nothing is encrypted: the evidence is public by design.

2. **One entity key + the Swarm reference it points to.**
   - Swarm reference of the rsETH pre-hack bundle (deterministic: same bytes → same reference): `ca035fbdfa74bfd611af912e4a7debb53f38047a78bcd181a20c1490e8419778`
   - Arkiv entity key (floor.rating for rsETH, created by the writer `0x563567A5788820093f71951DA383838D71ad2360` on Rabdi): `0xdd580780407947d0bedcfed7cbba5055ab91042e7e1bc7915bf4c31e3c114b93` (tx `0x96a804e29a514396f570c3482d853bc7b36f3cdd04bd452e93df94c0402f959e`). Its `swarmRef` attribute is the reference above, its `bundleHash` is `0x385b1ae424c9c5d46bb22a0081d358385a7dda8bd76f314baa42242acda86561`, the same hash the CRE workflow wrote into FloorRegistry on Sepolia.
   - Openable link (public Swarm network): https://api.gateway.ethswarm.org/bytes/ca035fbdfa74bfd611af912e4a7debb53f38047a78bcd181a20c1490e8419778 (303,927 bytes; `keccak256` of them = the bundle hash).

3. **Postage batch, buyer, node.**
   - Local test network: bee-factory (Bee v2.8.1). Batch `19056cc9f8b0563a1f48d88dc0c5a6a8bbbe8b3e623629d9ab7c422a957cf2ae`, bought by the bee-factory queen node on its local chain.
   - Public network (2026-11-07): uploaded through the public gateway `api.gateway.ethswarm.org`, which stamps uploads with its own batch (no batch bought by us; `importer --swarm-gateway`, bytes read back and hash-checked). Retention is the gateway's; production uses our own batch (`--swarm` with `BEE_BATCH_ID`).
   - The whole site (landing, app, verify and dataset pages) is also on Swarm, republished by `.github/workflows/deploy.yml` on every deploy. Latest checked: ref `2ea41b7bdc4fbcd9a7a6cf1539d5b5457a8db0b51ce67cf43b46573149700a8f`, https://bah5acgzaf2sbw664j66ntj5gz4kttvnviv5i3mfvdtthz5b3izltcslqbkhq.bzz.limo/ (`verify/` for the verify page). The public gateway does not serve unreviewed websites (it redirects to a "Request Approval" page), so the site is opened through bzz.limo. No feed manifest yet, so each deploy has a new reference.

4. **Files that upload and read.**
   - Upload: [`packages/publish/src/swarm.ts`](../packages/publish/src/swarm.ts) `uploadBundle` (non-deferred) and the importer [`packages/publish/src/importer.ts`](../packages/publish/src/importer.ts).
   - Read: `fetchBundle` in the same file (plain HTTP `GET /bytes/<ref>`, hash-checked before parsing), used by the browser verifier.

5. **Run one upload and one read yourself.**
   ```bash
   npx @ethersphere/bee-factory start --tag v2.8.1        # local Swarm (Docker)
   pnpm install
   pnpm --filter @floor/publish test:swarm               # uploads the rsETH bundle on :1633, reads it back from :1635
   # or the importer:
   BEE_ALLOW_BUY=1 pnpm --filter @floor/publish run importer \
     --bundle packages/resolver/fixtures/rseth-24908284.json:0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7 --swarm
   ```
   Expected: `swarm: ca035fbd…9778 (303927 bytes …)`, and the test prints the same reference and passes the hash check.

6. **Demo-video moment.** The verify page (https://floor.aexiz.in/verify/, or the same page on Swarm), with no Floor server: it finds the rating on Arkiv, downloads the bundle from Swarm by `swarmRef`, checks `keccak256 == bundleHash` and the same hash in the CRE-written FloorRegistry, then replays all 624 reads through Anon-RPC over Tor. Measured 2026-11-07: **VERIFIED in 81 s, 99.8% of 923 requests through Anon-RPC** (`docs/evidence/live-2026-11-07.md`); rerun after the restyle: 63 s, 99.7%. Tamper one byte: MISMATCH.

7. **What got in our way.** See [`friction.md`](friction.md) §Swarm: deferred uploads by default, the postage minimum, bee-factory start time.
