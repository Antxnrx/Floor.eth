# Why Arkiv

**If this data sat in Postgres instead of Arkiv, what could people no longer do?**

1. **Query it without us.** A risk team, a curator or a judge can ask "which routes resolve to one effective verifier?" straight from Arkiv's RPC or SDK. In Postgres they'd need our API to be up and honest. Floor's whole claim is "don't trust Floor", and a private database contradicts it.
2. **Check who wrote it.** Every entity is owned by Floor's writer wallet and filtered with `.ownedBy(writer)`. Provenance is a property of the data, not of our server logs.
3. **Verify it in a browser with our backend off.** The verifier page reads the rating from Arkiv, pulls the evidence from Swarm by the `swarmRef` in the entity, checks `keccak256(bytes) == bundleHash`, and replays the chain reads through Anon-RPC. No Floor server is on that path. That is the CROPS demo moment.
4. **Line it up with the onchain report.** `bundleHash` on Arkiv equals the hash in the CRE-signed report on `FloorRegistry`, so a rating can't be quietly rewritten in one place.

**What can people do with our copy that they can't do with the original source today?**

The original source is raw LayerZero state spread over EndpointV2, two message libraries and every OApp's peers, one `eth_call` at a time. Our copy is the *resolved* posture: effective verifier count after defaults and NIL, operator-deduplicated independence, pinning, confirmations and the grade. It's filterable by those fields:

```ts
client.select().from(FloorRoute).where(and(eq("direction", "receive"), eq("independent", u64(1)))).ownedBy(writer).fetch()
```

Doing that from the raw source means writing our resolver yourself, about 624 reads for rsETH alone.

**Expiry fits the data.** Posture data goes stale. Entities live 180 days, and the importer writes a fresh entity per scan block, so history is queryable and old ratings age out instead of looking current.

**What we keep off Arkiv:** the full evidence bundles (≈300 KB for rsETH). They live on Swarm; Arkiv holds the reference and the hash. Arkiv's 128-byte string and 128 KiB bytes limits make that the right split.
