#!/usr/bin/env bash
# Health check of the live Floor deployment (read-only, no keys). Exit 0 = everything as recorded in
# docs/evidence/live-2026-11-07.md. Run before demos and judging.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.foundry/bin:$PATH"
SEP=${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}
BASE=${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}
REG=0xE69c3e47DdaB083D0Ba4D8aD2B2dA8531ec18220; BC=0x83ccA5fFB6389fff54Dbde6709779a8e92F945D4
MIR=0xDA6E769b22ecb6815cea57aBf61494a07E571Dd6; VAULT=0xff5E3b49d94AA7C5213938c4B8FF1983456869Be; SENT=0x83ccA5fFB6389fff54Dbde6709779a8e92F945D4
RSETH=0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7; ID=0x09fbda71b8f952b0a095484d57b80eb47dc31aba9c40515dd56ac3f662772a74
HASH=0x385b1ae424c9c5d46bb22a0081d358385a7dda8bd76f314baa42242acda86561
SWARM_REF=ca035fbdfa74bfd611af912e4a7debb53f38047a78bcd181a20c1490e8419778
SITES=("https://bah5acgzaj4pea2h3q3knmuv4u2ng24wv4x3p5hbhlyi7n5dkbluwu6ejbv7q.bzz.limo/" "https://bah5acgzaj4pea2h3q3knmuv4u2ng24wv4x3p5hbhlyi7n5dkbluwu6ejbv7q.bzz.limo/dataset.html" "https://bah5acgzaqd7ip6r62qfygexx6ue3nvzfme47guje2362bulcyxsusjk5w4ua.bzz.limo/")
pass=0; fail=0
ok() { echo "  OK    $*"; pass=$((pass+1)); }
bad() { echo "  FAIL  $*"; fail=$((fail+1)); }
eq() { if [ "$(echo "$2" | tr '[:upper:]' '[:lower:]')" = "$(echo "$3" | tr '[:upper:]' '[:lower:]')" ]; then ok "$1"; else bad "$1: got '$2', expected '$3'"; fi; }
rating() { cast call "$1" 'ratingOf(address)((uint8,bool,uint64,uint32,uint64,bytes32))' $RSETH --rpc-url "$2" 2>/dev/null; }

echo "== Ethereum Sepolia"
R=$(rating $REG $SEP)
eq "registry: rsETH grade BREACHED" "$(echo "$R" | tr -d '()' | cut -d, -f1 | tr -d ' ')" 3
eq "registry: evidence hash" "$(echo "$R" | grep -oE '0x[0-9a-fA-F]{64}')" $HASH
eq "registry: trusts the CRE forwarder" "$(cast call $REG 'forwarder()(address)' --rpc-url $SEP)" 0x15fC6ae953E024d975e77382eEeC56A9101f9F88
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
GOT=$(curl -s -m 60 "https://api.gateway.ethswarm.org/bytes/$SWARM_REF" | cast keccak 2>/dev/null)
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
