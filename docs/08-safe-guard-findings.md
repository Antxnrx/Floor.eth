# 08 · Safe guard: fork-test findings and safe design

**Claim tested:** "A Safe transaction guard that blocks weak LayerZero config is hard to ship safely and needs an audit."
**Verdict: partly true.** True for the obvious design (decode calldata, check `to == endpoint && selector == setConfig`): broken 5 ways, and guards can brick Safes. A post-state, fail-open design (~150 lines) blocked every attack through the Safe's own signed-tx path. A real launch needs an audit; Safe itself says so.

> "Since a guard has full power to block Safe transaction execution, a broken guard can cause a denial of service for the Safe. Make sure to carefully audit the guard code and design recovery mechanisms." (Safe v1.4.1 `contracts/base/GuardManager.sol` L46-48)

Also: Safe docs (docs.safe.global/advanced/smart-account-guards); Safe Foundation "Guardrail" post (Aug 7 2025): "a buggy or overly restrictive Guard could lock you out of your own Safe".

## Tests (re-runnable)

Code: [evidence/guard-proof/](evidence/guard-proof/). Foundry 1.8.1, mainnet fork at block 26,351,000, real Safe v1.3.0 (Kelp's version), Safe v1.4.1, MultiSendCallOnly 1.3.0, EndpointV2, SendUln302, the Kelp adapter and LZ Labs DVN. Shortcut: threshold lowered to 1 by pranking the Safe.

```bash
cd docs/evidence/guard-proof
forge install foundry-rs/forge-std --no-git   # if lib/ is missing
forge test --match-contract GuardProof -vv    # RPC=<archive mainnet RPC> to override
# Result (2026-11-06): 17 passed; 0 failed; 0 skipped
```

| Test | Proves |
|---|---|
| a1 | Always-revert guard bricks the Safe, including its own removal (`setGuard(0)` is itself a guarded Safe tx; direct call reverts GS031). Incident response blocked too. |
| a2 | Safe v1.3.0 accepts a guard address with no code; a typo bricks the Safe. |
| a3 | v1.4.1's ERC165 check (GS300) stops typos but not a broken guard. |
| naive | Naive guard blocks a direct weak `setConfig`. |
| b1 | `setConfig` inside a MultiSendCallOnly delegatecall bypasses the naive guard; route drops to 1 DVN. |
| b2 | A delegatecall payload overwrites the guard slot: guard removed with no `ChangedGuard` event. |
| c | With a module enabled, even an always-revert guard is never called; module sets 1 DVN then removes the guard. |
| d | Safe calls `OApp.setDelegate(hotWallet)`; hot wallet calls `endpoint.setConfig` directly. Safe and guard are not in the path. |
| e | required = NIL, optional = 3, threshold 1: looks like 3 DVNs, is any-1-of-3. Passes the naive guard. |
| f | The LZ default for Unichain reads as 1 required DVN / 15 confirmations; config `0` inherits it. **Correction (2026-11-06):** that DVN (`0x747c741496a507e4b404b50463e691a8d692f6ac`) is LayerZero's **LZDeadDVN** (LZ metadata API), which never signs, so the default *disables* the route rather than securing it with one verifier. The test proves inheritance, not a weak default. |
| h1 | Post-state guard blocks the direct call, MultiSend path, fake-3 config and `setDelegate`. |
| h2 | Post-state guard does not brick when the route is already below the floor through an external (default-side) change; unrelated txs pass; a fix to 4 DVNs is allowed. |
| h3 | Removal is always allowed, so a quorum can remove the guard then weaken (2-step bypass). Known limit. |
| h4 | Modules still bypass the post-state guard on v1.3.0. Known limit. |
| h5 | Delegatecall that wipes the guard slot then weakens is caught (Safe caches the guard address before execution). |
| gas | Trivial Safe tx: 59,479 gas without guard, 277,847 with post-state guard watching 2 routes (unoptimised). |

## Edge cases (25)

| # | Case | Risk | Severity | Mitigation | Evidence |
|---|---|---|---|---|---|
| 1 | Guard reverts on everything / bug | Brick | Critical | Pre-check never reverts; revert only on measured worsening; plain `setGuard` always allowed | a1, a3, Yearn yTrades Safe |
| 2 | Typo / no-code guard on v1.3.0 | Brick | Critical | Install via script: check code hash, simulate a follow-up tx | a2; v1.3.0 GuardManager L34-41 |
| 3 | `setConfig` via MultiSend / delegatecall | Bypass | High | Check state after execution, not calldata; allowlist delegatecall targets (MultiSendCallOnly) | b1, h1 |
| 4 | Delegatecall writes guard slot | Silent removal | High | Post-check guard slot unchanged unless plain `setGuard` | b2, h5 |
| 5 | Bybit-style implementation swap via delegatecall | Takeover | Critical | Allowlist delegatecall; post-check slot 0 | NCC Group Bybit analysis |
| 6 | Module txs (v1.3.0/1.4.1) | Full bypass | High | Monitor zero modules, or v1.5.0 + module guard | c, h4; ModuleManager source |
| 7 | v1.5.0 module guard missing / module removes tx guard | Bypass | High | Set both guards, each checks the other | v1.5.0 ModuleManager L94-111, L258 (source only) |
| 8 | LZ delegate is an EOA / other contract | Full bypass | Critical | Block `setDelegate`; monitor `delegates(oapp)` | d; EndpointV2 L327, L355 |
| 9 | Delegate/owner is a timelock/proxy controlled by the Safe | Bypass | High | Check at the actual delegate; monitor state | LZ auth code (not tested) |
| 10 | OApp ownership transfer / upgrade | Bypass | High | Block `transferOwnership`/upgrade; post-check owner + implementation | design |
| 11 | `setSendLibrary` / `setReceiveLibrary` (incl. to default) | Bypass of selector-only guard | High | Post-check library + `isDefault` | h1; MessageLibManager |
| 12 | Field `0` = inherit whatever the default is (today on Unichain: DeadDVN = disabled; LZ can change it) | Silent change with no app tx | High | Score effective config only; monitor defaults | f; UlnBase L74-111 |
| 13 | NIL / optional threshold fakes 3 | Bypass | High | Effective quorum = required + optional threshold | e |
| 14 | LayerZero changes defaults (no Safe tx) | Breach with nothing to block | High | Monitoring only; guard must revert only on worsening | UlnBase L55; h2 |
| 15 | Config changed on another chain | Invisible | High | Guard + monitoring per chain | design |
| 16 | Executor config, receive-lib timeout | Partial bypass | Medium | Include in watched state | MessageLibManager L279-289 |
| 17 | Policy update / wrong route list | False blocks / gaps | Medium | Immutable policy; rotate by replacing guard; publish policy hash | design |
| 18 | Guard has owner / upgrade key | New admin key | High | No admin, no upgrades | Yearn `overrideGuardChecks` |
| 19 | Incident response needs speed | Guard blocks fixes | High | Improvements always allowed; removal always allowed | h2, h3 |
| 20 | Quorum removes guard then weakens | Bypass | Inherent | Monitoring + alert on `ChangedGuard` | h3 |
| 21 | Gas overhead | Cost | Medium | Transient storage, fewer routes (UNVERIFIED savings) | gas test |
| 22 | Reentrancy / nested Safe txs overwrite snapshot | Wrong check | Medium | Per-tx-hash snapshot or depth counter; fuzz | UNVERIFIED |
| 23 | Malformed calldata / selector collisions | Brick (decoding guards) | Medium | Never `abi.decode` untrusted data in a revert path | design |
| 24 | Nested Safes | Wrong Safe guarded | Medium | Guard the Safe that is the actual owner/delegate | design |
| 25 | SignMessageLib / EIP-1271 | Not a `setConfig` path (LZ checks `msg.sender`); high for funds | Low/High | Allowlist delegatecall targets | EndpointV2 L355; Gnosis Pay post-mortem |

## Real incidents

- **Yearn yTrades Safe (Stealth Safe Guard):** guard governance never set → every tx reverted, including removal; assets moved out via EIP-1271 CoW orders; some tokens stuck. Source: Yearn engineering post on Mirror (page returned 403 to us; details from search excerpts; "~$1M" UNVERIFIED).
- **Bybit, Feb 21 2025 (~$1.5B):** signers approved a delegatecall that overwrote the Safe implementation slot. Source: NCC Group analysis.
- **Gnosis Pay / Zodiac, Jun 1 2026:** ERC-1271 return value read without checking call success in Delay/Roles modules; ~$1.5M extracted, restored. Module path = the path v1.3/1.4 guards don't see. Source: Gnosis Pay post-mortem.
- **0x timelock SafeGuard (Dedaub audit, Mar 13 2025):** no C/H/M/L findings; explicitly disallows delegatecall. A reference for "small, auditable guard".

## Recommended design

1. **Source of truth = continuous monitoring** of effective config, delegate, owner, libraries, defaults, Safe modules and guard slot.
2. **Primary control = pre-sign check:** simulate the Safe tx on a fork and diff effective state before signers sign (`floor check`).
3. **Guard = fail-open seatbelt:** pre-check never reverts; post-check reverts only if this tx made a watched route worse and below the floor, or changed delegate/libraries/guard slot without a plain `setGuard`; fixes always allowed; plain `setGuard(0)` always allowed; no admin; no upgrades; delegatecall only to MultiSendCallOnly; v1.5.0 module guard where available.
4. **Never claim it stops a malicious quorum.** It stops mistakes, UI spoofing and smuggled payloads.

### Invariants to fuzz / formally verify

1. There is no state where plain `setGuard(0)` reverts.
2. A tx that doesn't touch watched routes never reverts because of the guard, whatever external LZ state is.
3. Effective score after a guarded tx ≥ min(score before, floor).
4. A guard-slot change without plain `setGuard` always reverts.
5. Delegate, owner and libraries cannot change through the guarded path.
6. The guard never reverts on arbitrary or malformed calldata/operation values.
7. Gas stays bounded per watched route.

## Ship plan

- **Hackathon:** fork/testnet only, on our own demo Safe. Never on a Safe holding real funds.
- **Launch:** audit + formal checks of invariants 1 and 2 (Safe's Guardrail used Certora specs). Audit cost: small-contract audits plausibly 1–2 auditor-weeks (ESTIMATE); published rates seen: Zealynx $6k per auditor-week; Sherlock 2026 guide $5k–$250k+ range (SECONDARY).
