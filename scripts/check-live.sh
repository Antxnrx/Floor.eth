#!/usr/bin/env bash
# Health check of the live Floor deployment (read-only, no keys). Exit 0 = everything as recorded in
# docs/evidence/live-2026-11-07.md. Run before demos and judging.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
. "$(dirname "$0")/manifest.sh"
SEP=${SEPOLIA_RPC_URL:-$(m '.chains.sepolia.rpcs[0]')}
BASE=${BASE_SEPOLIA_RPC_URL:-$(m '.chains.baseSepolia.rpcs[0]')}
REG=$(m .contracts.registry.address); BC=$(m .contracts.broadcaster.address)
MIR=$(m .contracts.mirror.address); VAULT=$(m .contracts.vault.address); SENT=$(m .contracts.sentinel.address)
FWD=$(m .chains.sepolia.creForwarder)
RSETH=$(m .kelp.token); ID=$(m .kelp.capId); HASH=$(m .kelp.bundleHash); SWARM_REF=$(m .kelp.swarmRef)
GW=$(m .swarm.gateway); SITE=${FLOOR_SITE:-$(m .site)}
SITES=("$SITE/" "$SITE/verify/" "$SITE/verify/dataset.html")
pass=0; fail=0
ok() { echo "  OK    $*"; pass=$((pass+1)); }
bad() { echo "  FAIL  $*"; fail=$((fail+1)); }
eq() { if [ "$(echo "$2" | tr '[:upper:]' '[:lower:]')" = "$(echo "$3" | tr '[:upper:]' '[:lower:]')" ]; then ok "$1"; else bad "$1: got '$2', expected '$3'"; fi; }
rating() { cast call "$1" 'ratingOf(address)((uint8,bool,uint64,uint32,uint64,bytes32))' $RSETH --rpc-url "$2" 2>/dev/null; }

echo "== Ethereum Sepolia"
R=$(rating $REG $SEP)
eq "registry: rsETH grade BREACHED" "$(echo "$R" | tr -d '()' | cut -d, -f1 | tr -d ' ')" 3
eq "registry: evidence hash" "$(echo "$R" | grep -oE '0x[0-9a-fA-F]{64}')" $HASH
eq "registry: trusts the CRE forwarder" "$(cast call $REG 'forwarder()(address)' --rpc-url $SEP)" $FWD
eq "broadcaster: reads the registry" "$(cast call $BC 'registry()(address)' --rpc-url $SEP)" $REG

echo "== Base Sepolia"
M=$(rating $MIR $BASE)
eq "mirror: rsETH grade BREACHED (via CCIP)" "$(echo "$M" | tr -d '()' | cut -d, -f1 | tr -d ' ')" 3
eq "mirror: same evidence hash" "$(echo "$M" | grep -oE '0x[0-9a-fA-F]{64}')" $HASH
eq "mirror: trusts only the broadcaster" "$(cast call $MIR 'sourceSender()(address)' --rpc-url $BASE)" $BC
eq "vault: rsETH cap cut to 0" "$(cast call $VAULT 'absoluteCap(bytes32)(uint256)' $ID --rpc-url $BASE | awk '{print $1}')" 0
eq "vault: sentinel role" "$(cast call $VAULT 'isSentinel(address)(bool)' $SENT --rpc-url $BASE)" true
eq "sentinel: reads the mirror" "$(cast call $SENT 'rating()(address)' --rpc-url $BASE)" $MIR

echo "== Swarm"
GOT=$(curl -s -m 60 "$GW/bytes/$SWARM_REF" | cast keccak 2>/dev/null)
eq "evidence bundle served and hash-checked" "$GOT" $HASH
for u in "${SITES[@]}"; do c=$(curl -s -m 90 -L -o /dev/null -w "%{http_code}" "$u"); eq "site $u" "$c" 200; done

echo "== Arkiv (Rabdi)"
OUT=$(cd packages/publish && npx tsx scripts/check-arkiv.ts 2>/dev/null | tail -1)
eq "arkiv: rating grade" "$(echo "$OUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["grade"])' 2>/dev/null)" BREACHED
eq "arkiv: rating points at the Swarm bundle" "$(echo "$OUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["swarmRef"])' 2>/dev/null)" $SWARM_REF
eq "arkiv: rating hash" "$(echo "$OUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["hash"])' 2>/dev/null)" $HASH
eq "arkiv: dataset, unbounded adapters" "$(echo "$OUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["unbounded"])' 2>/dev/null)" 31
eq "arkiv: flight recorder events" "$(echo "$OUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["events"])' 2>/dev/null)" 8

echo; echo "live check: $pass ok, $fail failed"; [ "$fail" -eq 0 ]
