# 19 · Sponsor developer quick-reference (official docs)

Compiled 2026-11-06 from official docs, their `llms*.txt` / `.md` exports, or official JSON APIs. Code is copied from docs (`…` = lines cut). **UNVERIFIED** = not confirmed. **(O)** = we checked the address has code onchain on 2026-11-06.

Always re-confirm tenant- or lane-specific values (CRE forwarders, CCIP lanes) before deploying.

---

## 1. Chainlink CRE (TypeScript)

Docs dump: https://docs.chain.link/cre/llms-full-ts.txt

**Install / login** (https://docs.chain.link/cre/getting-started/cli-installation/macos-linux, https://docs.chain.link/cre/guides/cli/cli-login)
```bash
curl -sSL https://app.chain.link/cre/install.sh | bash   # installs to $HOME/.cre
cre version
cre login        # browser flow; check with: cre whoami
```
- **Requires Bun ≥ 1.2.21** (https://docs.chain.link/cre/getting-started/part-1-project-setup-ts). Bun is not installed on the main machine yet.
- `cre init` → Typescript → `Helloworld`; registry `private` (no wallet/gas) or `onchain:ethereum-mainnet`. Then `bun install`.
- `.env`: `CRE_ETH_PRIVATE_KEY=<64 hex, no 0x>`. RPCs in `project.yaml`:
```yaml
staging-settings:
  rpcs:
    - chain-name: ethereum-testnet-sepolia
      url: https://ethereum-sepolia-rpc.publicnode.com
```

**Cron trigger**
```typescript
import { CronCapability, handler, Runner, type Runtime } from "@chainlink/cre-sdk"
…
const initWorkflow = (config: Config) => {
  const cron = new CronCapability()
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}
export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
```
Fastest cron: 30 s (https://docs.chain.link/cre/service-quotas).

**EVM log trigger** (https://docs.chain.link/cre/guides/workflow/using-triggers/evm-log-trigger-ts): addresses/topics base64 via `hexToBase64`; indexed topics `padHex(x,{size:32})`; optional `confidence: "CONFIDENCE_LEVEL_FINALIZED"`; handler `(runtime, log: EVMLog)`.

**HTTP (external API)** (https://docs.chain.link/cre/getting-started/part-2-fetching-data-ts)
```typescript
const httpClient = new HTTPClient()
const resp = httpClient.sendRequest(nodeRuntime, { url: nodeRuntime.config.apiUrl, method: "GET" as const }).result()
…
const result = runtime.runInNodeMode(fetchMathResult, consensusMedianAggregation())().result()
```
Quotas: 15 HTTP calls/execution, 250 KB response, 10 s connect, 5 min execution.

**EVM read** (part-3): `new EVMClient(network.chainSelector.selector).callContract(runtime, { call: encodeCallMsg({from: zeroAddress, to, data}), blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result()`. Limit: 15 reads/execution. Sepolia selector `16015286601757825753n`.

> **Floor impact:** 15 EVM reads per execution is tight for scanning many routes. Design: the off-chain resolver computes the full evidence set; the CRE workflow re-checks a small, critical subset onchain (e.g. required DVN count + receive-lib pin for the changed route) and fetches the rest via HTTP, then signs. Or split across executions.

**EVM write** (part-4)
```typescript
const reportResponse = runtime.report({
  encodedPayload: hexToBase64(reportData), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256",
}).result()
evmClient.writeReport(runtime, { receiver: cfg.consumerAddress, report: reportResponse, gasConfig: { gasLimit: cfg.gasLimit } }).result()
```
Limits: report ≤ 50 KB, 10M gas, ≤ 10 target chains.

**Receiver contract** (https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts)
```solidity
interface IReceiver is IERC165 {
  function onReport(bytes calldata metadata, bytes calldata report) external;
}
```
- Support ERC165 for `type(IReceiver).interfaceId`. Recommended: inherit `ReceiverTemplate(_forwarderAddress)` and implement `_processReport(bytes calldata report)`.
- `metadata` = `abi.encodePacked(bytes32 workflowId, bytes10 workflowName, address workflowOwner)` (62 bytes); production forwarder passes 64 bytes. Don't require exactly 62.
- **Don't enable** `setExpectedWorkflowId` / `setExpectedAuthor` / `setExpectedWorkflowName` during simulation (MockForwarder supplies no metadata).

**Forwarders** (https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts; confirm with `cre workflow supported-chains --output json`)

| Chain | Simulation `MockKeystoneForwarder` | Production `KeystoneForwarder` |
|---|---|---|
| Ethereum Sepolia | 0x15fC6ae953E024d975e77382eEeC56A9101f9F88 | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |
| Arbitrum Sepolia | 0xd41263567ddfead91504199b8c6c87371e83ca5d | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| Base Sepolia | 0x82300bd7c3958625581cc2f77bc6464dcecdf3e5 | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |
| Ethereum | 0xa3d1ad4ac559a6575a114998affb2fb2ec97a7d9 | 0x0b93082D9b3C7C97fAcd250082899BAcf3af3885 |
| Base | 0x5e342a8438b4f5d39e72875fcee6f76b39cce548 | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 (O) |
| Arbitrum One | 0xd770499057619c9a76205fd4168161cf94abc532 | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |

**Simulate** (https://docs.chain.link/cre/guides/operations/simulating-workflows)
```bash
cre workflow simulate my-workflow --target staging-settings              # dry-run writes
cre workflow simulate my-workflow --broadcast --target staging-settings  # real testnet tx
cre workflow simulate my-workflow --non-interactive --trigger-index 0 --target staging-settings
```
Simulation writes supported on ~33 testnets (Sepolia, Arb/Base/OP/Unichain Sepolia, …).

**Deploy access:** `cre account access` → "Hackathon"; email approval; `cre whoami` shows `Deploy Access: Enabled`. Only needed for `cre workflow deploy`.

**Friction we hit (2026-11-06, CRE CLI v1.39.0):**
- The install script asks the GitHub API for the latest release. On shared Wi-Fi the anonymous limit (60/hour) was exhausted and the install failed with `403`. Workaround: the same script with that one call made through an authenticated `gh api`; the macOS codesign check is unchanged.
- `zod`'s `z.string().url()` fails inside the workflow ("Invalid url") because the WASM runtime has no `URL` class. We use a regex instead.
- `cre account access` is interactive only (no flags), so it can't be scripted.
- Non-interactive simulation: `cre workflow simulate <name> --target <t> --non-interactive --trigger-index 0`.

---

## 2. Chainlink CCIP 2.0 (EVM)

Docs dump: https://docs.chain.link/ccip/llms-full.txt · package `@chainlink/contracts-ccip@2.0.0`

**Sender** (https://docs.chain.link/ccip/evm/getting-started)
```solidity
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {ExtraArgsCodec} from "@chainlink/contracts-ccip/contracts/libraries/ExtraArgsCodec.sol";
…
Client.EVM2AnyMessage memory evm2AnyMessage = Client.EVM2AnyMessage({
  receiver: abi.encode(receiver),
  data: abi.encode(text),
  tokenAmounts: new Client.EVMTokenAmount[](0),
  extraArgs: ExtraArgsCodec._getBasicEncodedExtraArgsV3(200_000, bytes4(0)), // default finality
  feeToken: address(s_linkToken)                                              // address(0) = native
});
uint256 fees = s_router.getFee(destinationChainSelector, evm2AnyMessage);
s_linkToken.approve(address(s_router), fees);
messageId = s_router.ccipSend(destinationChainSelector, evm2AnyMessage);
```
- V3 extraArgs only on v2.0 lanes; V3 fields on a pre-2.0 lane **revert onchain**. FTF: `_getBasicEncodedExtraArgsV3BlockDepth(gasLimit, depth)`.

**Receiver**
```solidity
import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {FinalityCodec} from "@chainlink/contracts-ccip/contracts/libraries/FinalityCodec.sol";
contract Receiver is CCIPReceiver {
  constructor(address router) CCIPReceiver(router) {}
  function _ccipReceive(Client.Any2EVMMessage memory any2EvmMessage) internal override { … }
  function getCCVsAndFinalityConfig(uint64, bytes calldata) external view override
    returns (address[] memory requiredCCVs, address[] memory optionalCCVs, uint8 optionalThreshold, bytes4 allowedFinalityConfig)
  { return (new address[](0), new address[](0), 0, FinalityCodec.WAIT_FOR_FINALITY_FLAG); }
}
```
By default receivers accept full-finality messages only; a send with a disallowed block depth succeeds but executes as `FAILURE`.

**Routers / selectors** (https://docs.chain.link/api/ccip/v1/chains?environment=testnet|mainnet; API "planned for deprecation")

| Chain | Selector | Router |
|---|---|---|
| Ethereum Sepolia | 16015286601757825753 | 0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59 |
| Arbitrum Sepolia | 3478487238524512106 | 0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165 |
| Base Sepolia | 10344971235874465080 | 0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93 |
| Ethereum | 5009297550715157269 | 0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D |
| Base | 15971525489660198786 | 0x881e3A65B4d4a04dD529061dd0071cf975F58bCD (O; `isChainSupported(Arbitrum)` = true) |
| Arbitrum One | 4949039107694359620 | 0x141fa059441E0ca23ce184B6A78bafD2A517DdE8 (O) |

Sepolia LINK `0x779877A7B0D9E8603169DdbD7836e478b4624789`. Faucet https://faucets.chain.link/. CCIP-BnM Sepolia address: two values appear in docs (UNVERIFIED; check the directory).

**Is the lane v2.0?** (https://docs.chain.link/ccip/tools/sdk/guides/ftf; `@chainlink/ccip-sdk`)
```ts
const features = await source.getLaneFeatures({ router, destChainSelector: destSelector, token: '0xTokenAddress...' })
const minConfirmations = features.FINALITY_FAST   // undefined = pre-v2.0 lane; 0 = v2.0, no FTF; >0 = FTF depth
```
CLI: `ccip-cli lane -s <src> -d <dst> -r <router>`.

**Local simulator (Foundry)** (https://docs.chain.link/chainlink-local/build/ccip/foundry/local-simulator): `forge install smartcontractkit/chainlink-local@v0.3.1`, remap `@chainlink/local/=lib/chainlink-local/`, `evm_version = cancun`; `new CCIPLocalSimulator()`; messages deliver synchronously. Explorer: https://ccip.chain.link

---

## 3. Arkiv (Rabdi testnet)

Docs index: https://docs.arkiv.network/llms.txt. **The SDK is schema-based now**: no payload/annotations; use `str` (≤128 bytes) or `bytes` columns; no `updateEntity`, use `patchEntity`.

```bash
npm install @arkiv-network/sdk viem
```
```ts
import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"
const Posts = defineSchema("my-app.posts", {
  author: addr().indexed(), category: str().indexed(), score: dec().indexed(),
  title: str(), body: bytes(), summary: str().optional(),
})
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" })
const publicClient = createPublicClient({ chain, transport: http() })
const walletClient = createWalletClient({ chain, transport: http(), account })
```
**Create** (https://docs.arkiv.network/writing/create/): `expiration` is required.
```ts
const { entityKey, txHash, expiresAt } = await walletClient.createEntity(
  Posts, { author: addr(account.address), category: "news", score: dec("3.9"), title: "…", body: stringToBytes("…") },
  { expiration: ExpirationTime.fromDays(30) },
)
```
Max lifetime 7,884,000 blocks (~182.5 days); block time 2 s; `extendEntity`, `patchEntity({set|unset})`, `changeOwnership`, `deleteEntity` (owner only; `$creator` immutable).

**Query** (https://docs.arkiv.network/querying/filter/)
```ts
const { entities } = await publicClient.select({ $key: true, title: true }).from(Posts)
  .where(and(eq("category", "news"), gt("score", dec("4")))).fetch()
```
Only indexed columns are filterable. **Anyone can write to your schema name: always filter with `.ownedBy(addr)` / `.createdBy(addr)`.** Raw: `arkiv.schema = str('my-app.posts') AND category = str('news')`. JSON-RPC: `arkiv_query`, `arkiv_getEntity`, `arkiv_getBlockTiming`.

Access keys: https://hub.arkiv.network/access-keys (one per wallet per network, monthly quota; path suffix, `X-API-KEY` header or Bearer). Never put the key in a browser `addChain` call. Faucet (tGLM): https://hub.arkiv.network/faucet. Limits: 32 attributes (31 with named schema), `bytes` ≤ 128 KiB, 100 rows/page. Note: the prize page lists an indexer URL, but the docs say "No external indexer" (queries go to the node).

> **Floor schema sketch:** `floor.route` (indexed: `token`, `chain`, `eid`, `grade`, `requiredDvns`, `pinned`, `block`; bytes: evidence JSON), `floor.rating` (indexed: `token`, `grade`, `ruleVersion`, `block`; str: Swarm reference to evidence bundle). Owned by Floor's writer wallet; queries filter `.ownedBy(writer)`.

---

## 4. Swarm

Docs: https://docs.ethswarm.org/llms-api.txt

- **Options:** Beeport (hosted, buy stamps, no node: https://beeport.ethswarm.org) · own light node (`curl -s https://raw.githubusercontent.com/ethersphere/bee/master/install.sh | TAG=v2.8.1 bash`, `npm i -g @ethersphere/swarm-cli`) · **bee-factory** local dev (`npm install -g @ethersphere/bee-factory && bee-factory start`, Docker; 5 nodes, queen `http://localhost:1633`). Mainnet = Gnosis Chain (xDAI gas, xBZZ stamps); testnet = Sepolia (sBZZ). Ultra-light nodes cannot upload.
- **Stamp:** `swarm-cli stamp buy --depth 20 --amount 100000000` (example ≈0.010 BZZ, 4 GB, ~5h47m TTL). Min depth 17. Use immutable batches for feeds.
- **bee-js**
```js
import { Bee } from "@ethersphere/bee-js"
const bee = new Bee("http://localhost:1633");
const batchId = await bee.buyStorage(Size.fromGigabytes(1), Duration.fromDays(1));
const { reference } = await bee.uploadFile(batchId, data, "hello.txt", { contentType: "text/plain" });
const file = await bee.downloadFile(reference);
```
(`Size`/`Duration` import path UNVERIFIED.) References: 32 bytes, 64 when encrypted. Feeds: `bee.makeFeedWriter(topic, pk)` / `makeFeedReader(topic, owner)`; feed slot ≤ 4 KB.
- **Encryption:** header `Swarm-Encrypt: true`; the 128-hex reference = address + key; not on public gateways. **Never store an encrypted reference in a public Arkiv entity as-is.**
- For the bonus, a judged-public demo should use a real network batch (Beeport or a light node), since bee-factory is local-only.

---

## 5. EF Anon-RPC

Docs: https://ethereum.github.io/anon-rpc/ · https://github.com/ethereum/anon-rpc (`docs/integrate-wallet.md`, `SPEC.md`)

- The app passes a **specifier contract** address; the harness reads `workerHash()` / `workerResolvers()` onchain, fetches the worker bundle, runs it only if `keccak256(bytes) == workerHash()`, inside a sandboxed null-origin iframe; returns an anonymised `fetch`. Browser-only for now.
```ts
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
const worker = new AnonRpcWorker({
  address: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27",   // passthrough (testing only)
  config: undefined,
  preExisting: { rpcProvider: { request: ({ method, params }) => myExistingProvider.request({ method, params }) } },
});
const res = await worker.fetch("https://rpc.example/", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) });
```
`worker.fetch` can be passed to a viem custom transport. The bootstrap read is not anonymised.

| Network | Specifier (Ethereum mainnet) | Notes |
|---|---|---|
| Passthrough | 0x4fd77be300f31c5fe6ab266d35d27750a3478d27 (O) | Not anonymous; sandbox test only |
| tor-js | 0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e | Needs `config: {"gateways":[...]}` |
| Nym | 0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0 | ~18 MB bundle |
| Nox | 0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A | Sepolia testnet |

**Traffic share** (judged): no built-in method documented (UNVERIFIED). Plan: wrap `worker.fetch` and any direct transport with counters and show the ratio in the UI. Demo with a real anonymising network (Nym or tor-js), not passthrough.

---

## 6. Morpho Vault V2

Docs: https://docs.morpho.org/llms.txt · addresses: https://docs.morpho.org/developers/contracts/addresses

- Create: `VaultV2Factory.createVaultV2(owner, asset, salt)` (typed signature `(address,address,bytes32)` inferred: UNVERIFIED). Vault from `CreateVaultV2` event or `vaultV2(owner, asset, salt)`. Do the dead deposit first.
- Owner (instant): `setCurator`, `function setIsSentinel(address account, bool newIsSentinel) external`.
- Curator (timelocked via `submit(bytes)`): `addAdapter`, `increaseAbsoluteCap`, `increaseRelativeCap`, `setIsAllocator`, ….
- **Sentinel:** `revoke(bytes)`, `deallocate`, and
  - `function decreaseAbsoluteCap(bytes memory idData, uint256 newAbsoluteCap) external`
  - `function decreaseRelativeCap(bytes memory idData, uint256 newRelativeCap) external` (WAD, 1e18 = 100%)
- Ids: collateral `keccak256(abi.encode("collateralToken", collateralToken))`; market `keccak256(abi.encode("this/marketParams", adapter, marketParams))`; adapter `keccak256(abi.encode("this", adapter))`.
- Adapter: `MorphoMarketV1AdapterV2Factory.createMorphoMarketV1AdapterV2(vault)` → `submit` + `addAdapter`.

| | VaultV2Factory | MorphoMarketV1AdapterV2Factory |
|---|---|---|
| Ethereum | 0xA1D94F746dEfa1928926b84fB2596c06926C0405 | 0x32BB1c0D48D8b1B3363e86eeB9A0300BAd61ccc1 |
| Base | 0x4501125508079A99ebBebCE205DeC9593C2b5857 (O) | 0x9a1B378C43BA535cDB89934230F0D3890c51C0EB |
| Arbitrum | 0x6b46fa3cc9EBF8aB230aBAc664E37F2966Bf7971 (O) | 0xeF84b1ecEbe43283ec5AF95D7a5c4D7dE0a9859b |
| Sepolia | 0xb3fE2D5f8Af90f194B01db546397058Fcebb85D1 | 0x5481f54CACdf0aECE9f71F2Bb2c0A8e44b2d5D81 |
| Base Sepolia | 0xE3a2CEbca662d99D0F279aF13a6bb8c9825D2ea0 | 0xa24674Cc2c603FBA8AE6b442E3dB05f3dDaAa3D5 |

> **Floor Sentinel:** cut the **collateral id** cap for a BREACHED token to 0 → no new allocation to markets using that collateral; existing positions untouched.

---

## 7. LayerZero V2

Docs dump: https://docs.layerzero.network/llms-full.txt · metadata API: https://metadata.layerzero-api.com/v1/metadata

- `getConfig(address _oapp, address _lib, uint32 _eid, uint32 _configType) returns (bytes)` · `setConfig(address _oapp, address _lib, SetConfigParam[] _params)` (OApp or delegate) · `getReceiveLibrary(address _receiver, uint32 _srcEid) returns (address lib, bool isDefault)` · `getSendLibrary`, `defaultSendLibrary(uint32)`, `defaultReceiveLibrary(uint32)`.
- Config types: `1` Executor, `2` ULN. `UlnConfig(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)`; DVN arrays sorted; `0` = default; `type(uint8).max` / `type(uint64).max` = NIL.
- `lzReceive(Origin calldata _origin, address _receiver, bytes32 _guid, bytes calldata _message, bytes calldata _extraData)` on the endpoint; `struct Origin { uint32 srcEid; bytes32 sender; uint64 nonce; }`; OApp `_lzReceive(Origin, bytes32 guid, bytes message, address executor, bytes extraData)`.
- **OFT message** (`OFTMsgCodec`): `sendTo` bytes32 [0–31] · `amountSD` uint64 [32–39] · optional `composeMsg` [40+]. `decimalConversionRate = 10^(localDecimals − sharedDecimals)` (default shared decimals 6).

| Chain | eid | EndpointV2 | SendUln302 | ReceiveUln302 |
|---|---|---|---|---|
| Ethereum | 30101 | 0x1a44076050125825900e736c501f859c50fe728c | 0xbb2ea70c9e858123480642cf96acbcce1372dce1 | 0xc02ab410f0734efa3f14628780e6e695156024c2 |
| Base | 30184 | same | 0xb5320b0b3a13cc860893e2bd79fcd7e13484dda2 | 0xc70ab6f32772f59fbfc23889caf4ba3376c84baf |
| Arbitrum | 30110 | same | 0x975bcd720be66659e3eb3c0e4f1866a3020e493a | 0x7b9e184e07a6ee1ac23eae0fe8d6be2f663f05e6 |
| Sepolia | 40161 | 0x6edce65403992e310a62460808c4b910d972f10f | 0xcc1ae8cf5d3904cef3360a9532b477529b177cce | 0xdaf00f5ee2158dd58e0d3857851c432e34a3a851 |
| Base Sepolia | 40245 | same | 0xc1868e054425d378095a003ecba3823a5d0135c9 | 0x12523de19dc41c91f7d2093e0cfbb76b17012c8d |
| Arb Sepolia | 40231 | same | 0x4f7cd4da19abb31b0ec98b9066b9e857b1bf9c0e | 0x75db67cdab2824970131d5aa9cecfc9f69c69636 |

**DVN names:** https://metadata.layerzero-api.com/v1/metadata/dvns → `chainKey → dvns{address:{canonicalName,id,version,deprecated?,lzReadCompatible?}}`. Use it to seed the DVN → operator map. LayerZero Labs (non-lzRead): ETH `0x589dedbd617e0cbcb916a9223f4d1300c294236b`, Base `0x9e059a54699a285714207b43b055483e78faac25`, Arbitrum `0x2f55c492897526677c5b68fb199ea31e2c126416`. A second "LayerZero Labs" entry per chain is `lzReadCompatible`; don't conflate. Defaults viewer: https://layerzeroscan.com/tools/defaults?version=V2

---

## UNVERIFIED list

1. Old Arkiv payload/annotations API (current SDK is schema-based).
2. Arkiv explorer/indexer role (prize page lists one; docs say no external indexer).
3. Anon-RPC traffic-share method; supported chain list.
4. Typed `createVaultV2` signature.
5. bee-js import path for `Size`/`Duration`/`Topic`; testnet stamp cost.
6. Sepolia CCIP-BnM address (two values in docs).
7. CCIP router values come from a v1 API marked for deprecation.
8. CRE forwarders/chains are tenant-specific.
