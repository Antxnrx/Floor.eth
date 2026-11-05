# Arkiv schema

Network: Arkiv Rabdi testnet. RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`, chain ID `7794095` (we read `eth_chainId` = `0x76edaf`). SDK `@arkiv-network/sdk@1.0.1`. Code: [`packages/publish/src/arkiv.ts`](../packages/publish/src/arkiv.ts).

## Entities

### `floor.rating`: one per (asset, scan block)

| Field | Type | Indexed | Meaning |
|---|---|---|---|
| `token` | `addr` | yes | collateral token (e.g. rsETH `0xA1290d69…E5A7`) |
| `oapp` | `addr` | yes | LayerZero OApp / OFT adapter scanned |
| `chainId` | `u64` | yes | chain the scan read (1 = Ethereum) |
| `grade` | `str` | yes | `OK` / `DEGRADED` / `UNKNOWN` / `BREACHED` |
| `block` | `u64` | yes | pinned scan block |
| `ruleVersion` | `str` | yes | e.g. `aave-rf@0.1.0` |
| `receiveRoutes` | `u64` | yes | number of inbound routes |
| `singleVerifierRoutes` | `u64` | yes | routes where one operator can verify a message |
| `unpinnedRoutes` | `u64` | yes | receive libraries following the endpoint default |
| `swarmRef` | `str` | no | 64-hex Swarm reference of the evidence bundle (unencrypted) |
| `bundleHash` | `str` | no | keccak256 of the bundle bytes; same value is signed into the CRE report on `FloorRegistry` |

### `floor.route`: one per (asset, route, direction, scan block)

| Field | Type | Indexed | Meaning |
|---|---|---|---|
| `token`, `oapp` | `addr` | yes | as above |
| `eid` | `u64` | yes | LayerZero endpoint id of the remote chain |
| `direction` | `str` | yes | `receive` or `send` |
| `grade` | `str` | yes | route grade |
| `independent` | `u64` | yes | minimum distinct operators an attacker must compromise (0 = route disabled, dead DVN) |
| `requiredDvns` | `u64` | yes | required DVN count as configured (NIL → 0) |
| `confirmations` | `u64` | yes | block confirmations required |
| `pinned` | `bool` | yes | receive library explicitly set (not the endpoint default) |
| `block` | `u64` | yes | pinned scan block |
| `operators` | `str` | no | comma-joined operator ids (clipped to 128 bytes) |
| `bundleHash` | `str` | no | links back to the evidence bundle |

## Ownership and expiry

- **Owner:** Floor's writer wallet (address in the README once created). **Every query filters `.ownedBy(writer)`**, because anyone can write to a schema name.
- **Expiry:** `ExpirationTime.fromDays(180)`. Risk data older than ~6 months is stale. The importer re-creates on each scan, so history is a series of entities keyed by `block`.
- **Creator:** `$creator` = writer; it never changes.

## Queries we run

```ts
// latest rating of a token (packages/publish/src/arkiv.ts latestRating)
client.select().from(FloorRating).where(eq("token", addr(token))).ownedBy(writer).orderBy(desc("block")).fetch()
// the Mirror query: every inbound route that resolves to one effective verifier
client.select().from(FloorRoute).where(and(eq("direction", "receive"), eq("independent", u64(1)))).ownedBy(writer).fetch()
```

Raw JSON-RPC (no SDK, no access key needed for reads, checked 2026-11-06):

```bash
curl -s -X POST -H 'content-type: application/json' https://rpc.rabdi.db-chain.testnet.arkiv.network \
  --data '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["arkiv.schema = str('"'"'floor.route'"'"') AND independent = u64(1)", {}]}'
```
