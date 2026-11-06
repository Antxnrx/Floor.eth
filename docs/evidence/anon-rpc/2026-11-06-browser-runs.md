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

## Fixes made in the verifier from these runs

- `jsonRpcReader` takes a list of RPCs and rotates across them (no single provider sees the whole check or can rate-limit it alone).
- A provider that answers with a rate-limit / quota error, a non-2xx, or no answer within `timeoutMs` is benched for 30 s; "execution reverted" is an answer, not a failure.
- Per-request timeout (a hung request no longer stalls the check).
- Failed reads are retried in parallel first, then one at a time.
- Unit tests for each (`packages/verifier/test/verify.test.ts`).

## For the demo

Use Nym. Start the check on camera, cut while it runs (no speed-up), show the result with the traffic meter. Have the direct-mode result as the fallback, labelled as such. Never present passthrough as anonymous.
