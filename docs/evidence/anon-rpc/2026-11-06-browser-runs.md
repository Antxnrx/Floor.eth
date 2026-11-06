# Anon-RPC browser runs (2026-11-06, Chrome, hackathon Wi-Fi)

Page: `apps/verify-lab` (Vite dev server, `http://127.0.0.1:5181`). Bundle: rsETH pre-hack evidence, block 24,908,284, 624 recorded reads, hash `0x385b1ae424c9c5d46bb22a0081d358385a7dda8bd76f314baa42242acda86561`. Harness: `@anon-rpc/browser-harness@0.4.0`. Specifiers from `ethereum/anon-rpc` `adopters.json5`.

"Share" = chain reads sent through the Anon-RPC worker ÷ all chain reads, counted by `TrafficMeter`. The only direct reads are the 2 the harness makes to read the specifier contract before the anonymised fetch exists (by design, documented by anon-rpc).

| # | Transport | RPCs | Batch × parallel | Result | Time | Share via Anon-RPC |
|---|---|---|---|---|---|---|
| 1 | direct (baseline, no Anon-RPC) | blastapi | 50 × 2 | VERIFIED 624/624 | 1.1 s | 0% (baseline) |
| 2 | passthrough (sandbox + hash pinning, **not anonymising**) | blastapi | 50 × 2 | VERIFIED 624/624 | 4.3 s | 99.7% |
| 3 | **Nym mixnet** | blastapi | 50 × 2 | **VERIFIED 624/624** | 102.6 s | **99.7%** (2 bootstrap direct) |
| 4 | Nym | blastapi | 50 × 2 | VERIFIED after retries | 6+ min | 99.8% |
| 5 | **Nym** | blastapi | 10 × 6 | **VERIFIED 624/624** | 70.3 s | **99.7%** |
| 6 | Nym | blastapi, MEV Blocker | 10 × 6 | stalled: most requests > 20 s, timed out; run stopped | — | 99.8% |
| 7 | tor-js | — | — | worker never ready: the published demo gateway `152.236.3.22:12298` timed out (`dial … timed out`) | — | — |

Grade reproduced in every completed run: claimed BREACHED, recomputed BREACHED; state consistent.

## What we learned

- **Rate limits, not the mixnet, caused most failures in run 5:** 47 reads came back "exceeded its compute units per second capacity" from blastapi. Nym exits are shared, so a free RPC sees many users' traffic from one IP. Retries recovered all 47.
- **Large batches over a mixnet are fragile:** 50-read batches had long tails; 10 × 6 was faster and steadier.
- **Not every RPC accepts traffic arriving through Anon-RPC** (same request, measured per provider):

| Provider | Through Nym | Passthrough (browser sandbox, null origin) |
|---|---|---|
| blastapi | ✅ 200 | ✅ |
| MEV Blocker | ✅ 200 | ⚠️ ~17 OK, then fetch failures (rate limit without CORS headers) |
| Nodies (Pokt) | ❌ HTTP 415 "Content-Type: application/json is required" | ❌ CORS rejects the null origin |
| 1rpc | ❌ JSON error about content type | ❌ requests hang |

- **tor-js:** the only published gateway is a demonstration gateway ("limited capacity, may disappear"); from this network it timed out. Running our own gateway is the fix for production.
- **Mixnet latency varies a lot** on shared Wi-Fi: the same configuration took 70 s in one run and stalled in another.

## Arkiv → Swarm → verify in the browser (later the same day)

The page now finds the rating on Arkiv, downloads the bundle from Swarm, checks the hash, then replays (source "Arkiv → Swarm", the default).

| Check | Result |
|---|---|
| Arkiv query from the page (`@arkiv-network/sdk` bundled by Vite, public Rabdi RPC, no key; CORS `*`) | works; no Floor rating found yet (nothing written, README step 8), and the page stops with that message instead of using the local copy |
| Swarm download from a local Bee node (bee-factory, node 1 reading a bundle uploaded via node 0), direct | bytes hash to the bundle hash; replay **VERIFIED 624/624 in 21.7 s** with blastapi + MEV Blocker |
| Same, one RPC only (blastapi) | **UNVERIFIED_RPC** (613/624): 92 "exceeded its compute units per second capacity" answers. With one provider nothing can be benched; use two or more |
| Wrong expected hash | refused before any replay: MISMATCH "evidence hash mismatch" |
| One flipped byte in a recorded read | MISMATCH (hash fails, 1 read mismatched) |
| Swarm GET through Anon-RPC to the public gateway (`api.gateway.ethswarm.org/health`) | passthrough 200 in 2.2 s; **Nym 200 in 15.5 s** (incl. worker start) |
| Arkiv JSON-RPC through Nym | **HTTP 415** "Supplied content type is not allowed", or timed out |

**Nym drops the `Content-Type` header.** Sent through the Nym worker to a header-echo service (httpbin.org/anything) with `Content-Type: application/json`, the header arrived **absent**; lower-case, title-case and no header all gave the same 415 from Arkiv's RPC. This also explains Nodies' 415 above. Servers that require `application/json` (Arkiv Rabdi, Nodies) reject every request through Nym; servers that accept any body type (blastapi, MEV Blocker) work. Reported to EF as a question.

What the page does about it: the Arkiv lookup tries Anon-RPC first and, on any failure, reads Arkiv directly, shown on the meter as `arkiv · direct (fallback)`. What that leaks: the Arkiv RPC sees which asset is being looked up from your IP; the chain reads (the 624 replays) still go through Nym. A Swarm GET that fails through Anon-RPC (e.g. a `localhost` gateway, which a mixnet exit cannot reach) falls back to direct the same way, counted as `swarm · direct`.

## Fixes made in the verifier from these runs

- `jsonRpcReader` takes a list of RPCs and rotates across them (no single provider sees the whole check or can rate-limit it alone).
- A provider that answers with a rate-limit / quota error, a non-2xx, or no answer within `timeoutMs` is benched for 30 s; "execution reverted" is an answer, not a failure.
- Per-request timeout (a hung request no longer stalls the check).
- Failed reads are retried in parallel first, then one at a time.
- Unit tests for each (`packages/verifier/test/verify.test.ts`).

## For the demo

Use Nym. Start the check on camera, cut while it runs (no speed-up), show the result with the traffic meter. Have the direct-mode result as the fallback, labelled as such. Never present passthrough as anonymous.

## Mainnet RPCs without a Content-Type header (curl, 2026-11-06 evening)

Same request the Nym worker sends: archive `eth_getCode` at block 24,908,284, header removed, `Origin: null`. Then a batch of 10, three times.

| Provider | Archive, no Content-Type | Batch of 10 ×3 | Browser CORS |
|---|---|---|---|
| blastapi | ✅ | ✅ 10/10 ×3 | ✅ |
| MEV Blocker | ✅ | ✅ | ✅ |
| Tenderly public gateway | ✅ | ✅ | ✅ |
| ZAN | ✅ | ✅ | ✅ |
| dRPC | ✅ | ❌ "Batch of more than 3 requests are not allowed" | ✅ |
| 1rpc, Nodies | ❌ 415 / content-type error | — | ✅ |
| publicnode, Ankr, BlockPI | ❌ key needed (archive) | — | — |
| Flashbots | ❌ state pruned | — | — |
| Cloudflare | ❌ internal error | — | — |
| merkle, OnFinality, thirdweb | ❌ rate limited | — | — |
| llamarpc, omniatech, payload.de | ❌ 5xx / unreachable | — | — |
| lava | ❌ discontinued | — | — |

The verify page now defaults to the four that pass (rotating, with benching). Not yet re-measured through Nym itself: Tenderly and ZAN.

## tor-js through the alternative gateway (2026-11-06, ~22:30)

The anon-rpc maintainers sent a temporary second gateway (`159.89.167.167:12298`, "up for a day or so"); the page lists it first, then the demo gateway. Local copy of the rsETH bundle, RPCs blastapi + MEV Blocker + ZAN.

| Run | Change | Result | Time |
|---|---|---|---|
| 1 | 4 RPCs incl. Tenderly | 616/624, 8 failed → UNVERIFIED_RPC | 110 s |
| 2 | Tenderly removed (it answers Tor exits with 403 / 429) | 611/624, 13 failed (23 "Tor: operation timed out at exit") | 120 s |
| 3 | 5 retry rounds instead of 3 | 619/624, 5 failed (blastapi per-second limit, retries back to back) | 48 s |
| 4 | backoff between retry rounds (1, 2, 4, 8 s) | **VERIFIED 624/624**, grade BREACHED reproduced | **50 s** |

Worker start: 5.5–20.6 s. Median request 1.4–2.2 s (Nym: ~11 s today).

**The Arkiv lookup works over Tor** (answered in ~3 s, no fallback): Tor keeps the `Content-Type` header that the Nym worker drops. With tor-js, the Arkiv read, the Swarm download and all chain reads go through Anon-RPC; only the 2 bootstrap reads are direct.

Changes from these runs: tor-js is the page default (Nym stays selectable); a provider answering 403 is benched for the rest of the check; 5 retry rounds with backoff (`verifyBundle(..., { retryBackoffMs })`, off by default).

Caveat: both tor-js gateways are run by others and temporary. A production deployment runs its own gateway.
