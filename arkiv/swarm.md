# Swarm in Floor

1. **What's on Swarm vs Arkiv.** Swarm holds each **evidence bundle**: every raw onchain read behind a grade, the decoded state, the verdict and the rule-pack version, as canonical JSON (≈300 KB for rsETH). Arkiv holds the queryable index (`floor.rating`, `floor.route`). The Swarm reference lives in **`floor.rating.swarmRef`**, and its hash in **`floor.rating.bundleHash`**. Nothing is encrypted: the evidence is public by design.

2. **One entity key + the Swarm reference it points to.**
   - Swarm reference of the rsETH pre-hack bundle (deterministic: same bytes → same reference): `ca035fbdfa74bfd611af912e4a7debb53f38047a78bcd181a20c1490e8419778`
   - Arkiv entity key: **TODO after the first `--arkiv` import** (needs the writer key; see README "Commands to run").
   - Openable link: `https://<bee-or-gateway>/bytes/ca035fbdfa74bfd611af912e4a7debb53f38047a78bcd181a20c1490e8419778`. **TODO: re-upload to a public network node**; the current upload is on a local bee-factory network.

3. **Postage batch, buyer, node.**
   - Local test network: bee-factory (Bee v2.8.1). Batch `19056cc9f8b0563a1f48d88dc0c5a6a8bbbe8b3e623629d9ab7c422a957cf2ae`, bought by the bee-factory queen node on its local chain.
   - Public demo: **TODO**, a batch bought via Beeport or a Bee light node on Gnosis (record the batch ID and buyer here).

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

6. **Demo-video moment.** The Verify screen: with the Floor backend switched off, the page loads the bundle from Swarm by `swarmRef`, checks `keccak256 == bundleHash`, and replays every read through Anon-RPC. **TODO: timestamp** once recorded.

7. **What got in our way.** See [`friction.md`](friction.md) §Swarm: deferred uploads by default, the postage minimum, bee-factory start time.
