# Friction (Arkiv + Swarm), written as we hit it

## Arkiv

1. **Stale endpoints everywhere.** Older docs, examples and AI-generated code point to `kaolin.hoodi.arkiv.network` / `mendoza.hoodi.arkiv.network`. On 2026-11-06 Kaolin timed out and Mendoza did not resolve. Only the Rabdi RPC works. *Expected:* old endpoints to redirect, or a loud deprecation note. *Repro:* `curl -X POST https://kaolin.hoodi.arkiv.network/rpc …` → timeout.
2. **SDK 1.0 replaced payload/annotations with schemas.** Most snippets online still use `payload` + `annotations` + BTL. The current SDK has `defineSchema`, typed columns and a required `expiration`. *Ask:* a migration note at the top of the docs.
3. **Indexer: yes or no?** The prize page lists `https://indexer.rabdi.db-chain.testnet.arkiv.network`, while the docs say "No external indexer" (queries go to the node). We used the node only.
4. **Access keys for reads are unclear.** Raw `arkiv_query` worked with no key, and the SDK accepted `rabdi({ accessKey: "" })` for reads. The docs suggest a key is always needed. *Ask:* state per method whether a key is required.
5. **128-byte strings.** Our `operators` field (e.g. `layerzero-labs,nethermind,canary,…`) can exceed 128 bytes, so we clip it and point to the full list on Swarm. *Ask:* a list/array column type, or longer non-indexed strings.
6. **Anyone can write to a schema name.** Forgetting `.ownedBy(writer)` returns attacker-written rows as if they were ours. *Ask:* an option to bind a schema name to an owner, or make the SDK warn when a query has no owner/creator filter.

## Swarm

1. **`deferred: true` is the default.** Our upload "succeeded", but a second node returned 404 for the reference until we set `deferred: false`. For anyone publishing a reference elsewhere (like us, to Arkiv), the default is a trap. *Expected:* the reference to be retrievable when the call returns. *Repro:* `bee.data.upload(batch, bytes)` on bee-factory, then `GET :1635/bytes/<ref>` → 404.
2. **Postage minimum.** `stamp.create("100000000", 20)` failed with "Amount has to be at least 414720001 (1 day at current price 24000)". The error is clear, but there's no SDK helper that computes the minimum before the call.
3. **bee-factory builds Bee in Docker** from a git ref (`--tag`), which takes minutes on first start, and the docs mention flags (`--detach`) the CLI doesn't accept.
4. **Mainnet stamps need xBZZ on Gnosis.** For a hackathon that's an extra bridge and swap. Beeport helps; a testnet path with a faucet would help more.
