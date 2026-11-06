#!/usr/bin/env bash
# Dress rehearsal of the testnet deploy, on LOCAL anvil forks of Ethereum Sepolia and Arbitrum Sepolia.
# Runs the same commands as the README "Commands that need your credentials", in order, as the real deployer
# address (impersonated: no key is used), and checks the chain state after every step. Nothing touches a real chain.
#
#   scripts/rehearse.sh            # needs: anvil, forge, cast, cre (logged in), bun
#
# Exit code 0 = every check passed.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
export PATH="$HOME/.foundry/bin:$HOME/.cre/bin:$HOME/.bun/bin:$PATH"

DEPLOYER=0x563567A5788820093f71951DA383838D71ad2360
RSETH=0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7
SEP_UP=${SEPOLIA_RPC_URL:-https://sepolia.gateway.tenderly.co}
ARB_UP=${ARB_SEPOLIA_RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}
SEP=http://127.0.0.1:8546
ARB=http://127.0.0.1:8547
FORWARDER=0x15fC6ae953E024d975e77382eEeC56A9101f9F88
SEP_ROUTER=0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59
ARB_ROUTER=0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165
SEP_SELECTOR=16015286601757825753
ARB_SELECTOR=3478487238524512106
ANVIL0_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # anvil's public dev key, local forks only

pass=0; fail=0
ok()   { echo "  PASS  $*"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $*"; fail=$((fail+1)); }
check() { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1: expected $3, got $2"; fi; }
lc() { tr '[:upper:]' '[:lower:]'; }

cleanup() { [ -n "${P1:-}" ] && kill "$P1" 2>/dev/null; [ -n "${P2:-}" ] && kill "$P2" 2>/dev/null; true; }
trap cleanup EXIT

echo "== 0. fresh forks"
for port in 8546 8547; do lsof -ti tcp:$port | xargs kill 2>/dev/null || true; done
anvil --fork-url "$SEP_UP" --port 8546 --auto-impersonate --silent & P1=$!
anvil --fork-url "$ARB_UP" --port 8547 --auto-impersonate --silent & P2=$!
for i in $(seq 1 30); do cast chain-id --rpc-url $SEP >/dev/null 2>&1 && cast chain-id --rpc-url $ARB >/dev/null 2>&1 && break; sleep 1; done
check "sepolia fork chain id" "$(cast chain-id --rpc-url $SEP)" 11155111
check "arbitrum sepolia fork chain id" "$(cast chain-id --rpc-url $ARB)" 421614
# the real wallet's real balances are copied by the fork; top up so the rehearsal never depends on them
cast rpc anvil_setBalance $DEPLOYER 0x8AC7230489E80000 --rpc-url $SEP >/dev/null
cast rpc anvil_setBalance $DEPLOYER 0x8AC7230489E80000 --rpc-url $ARB >/dev/null
check "deployer nonce on sepolia (must be 0 for the predicted addresses)" "$(cast nonce $DEPLOYER --rpc-url $SEP)" 0
check "deployer nonce on arbitrum sepolia" "$(cast nonce $DEPLOYER --rpc-url $ARB)" 0
REG_PRED=$(cast compute-address $DEPLOYER --nonce 0 | awk '{print $NF}')
BC_PRED=$(cast compute-address $DEPLOYER --nonce 1 | awk '{print $NF}')

echo "== 1. deploy FloorRegistry + FloorBroadcaster (Sepolia)  [README step 2]"
(cd contracts && CRE_FORWARDER=$FORWARDER CCIP_ROUTER=$SEP_ROUTER forge script script/Deploy.s.sol:DeployHome \
  --rpc-url $SEP --broadcast --unlocked --sender $DEPLOYER > /tmp/floor-rehearse-1.log 2>&1) || { bad "DeployHome failed (see /tmp/floor-rehearse-1.log)"; }
REG=$(grep -E "FloorRegistry +0x" /tmp/floor-rehearse-1.log | awk '{print $NF}' | tail -1)
BC=$(grep -E "FloorBroadcaster 0x" /tmp/floor-rehearse-1.log | awk '{print $NF}' | tail -1)
check "registry address = predicted" "$(echo $REG | lc)" "$(echo $REG_PRED | lc)"
check "broadcaster address = predicted" "$(echo $BC | lc)" "$(echo $BC_PRED | lc)"
check "registry forwarder" "$(cast call $REG 'forwarder()(address)' --rpc-url $SEP | lc)" "$(echo $FORWARDER | lc)"
check "broadcaster router" "$(cast call $BC 'router()(address)' --rpc-url $SEP | lc)" "$(echo $SEP_ROUTER | lc)"

echo "== 2. deploy FloorMirror (Arbitrum Sepolia)  [README step 3]"
(cd contracts && CCIP_ROUTER=$ARB_ROUTER SOURCE_CHAIN_SELECTOR=$SEP_SELECTOR SOURCE_BROADCASTER=$BC forge script script/Deploy.s.sol:DeployMirror \
  --rpc-url $ARB --broadcast --unlocked --sender $DEPLOYER > /tmp/floor-rehearse-2.log 2>&1) || bad "DeployMirror failed (see /tmp/floor-rehearse-2.log)"
MIR=$(grep -E "FloorMirror 0x" /tmp/floor-rehearse-2.log | awk '{print $NF}' | tail -1)
check "mirror address = predicted" "$(echo $MIR | lc)" "$(echo $REG_PRED | lc)"
check "mirror trusts the broadcaster" "$(cast call $MIR 'sourceSender()(address)' --rpc-url $ARB | lc)" "$(echo $BC | lc)"
check "mirror source selector" "$(cast call $MIR 'sourceChainSelector()(uint64)' --rpc-url $ARB | awk '{print $1}')" $SEP_SELECTOR

echo "== 3. CRE workflow writes the rating  [README steps 4-5]"
check "config registryAddress = deployed registry" "$(python3 -c "import json;print(json.load(open('cre/floor-rating/config.staging.json'))['registryAddress'].lower())")" "$(echo $REG | lc)"
(cd cre && CRE_ETH_PRIVATE_KEY=${ANVIL0_KEY#0x} cre workflow simulate floor-rating --target rehearsal-settings --non-interactive --trigger-index 0 --broadcast > /tmp/floor-rehearse-3.log 2>&1) || bad "cre simulate --broadcast failed (see /tmp/floor-rehearse-3.log)"
grep -q 'ACCEPT' /tmp/floor-rehearse-3.log && ok "workflow accepted the evidence (reads matched)" || bad "workflow did not ACCEPT"
R=$(cast call $REG 'ratingOf(address)((uint8,bool,uint64,uint32,uint64,bytes32))' $RSETH --rpc-url $SEP)
echo "    registry.ratingOf(rsETH) = $R"
check "grade BREACHED (3)" "$(echo "$R" | tr -d '()' | cut -d, -f1 | tr -d ' ')" 3
check "known" "$(echo "$R" | tr -d '()' | cut -d, -f2 | tr -d ' ')" true
check "bundle hash" "$(echo "$R" | grep -oE '0x[0-9a-f]{64}')" 0x385b1ae424c9c5d46bb22a0081d358385a7dda8bd76f314baa42242acda86561

echo "== 4. Morpho Vault V2 + FloorSentinel, then poke  [README step 9, Sepolia]"
(cd contracts && FLOOR_REGISTRY=$REG forge script script/MorphoSepolia.s.sol:MorphoSepolia --rpc-url $SEP --broadcast --unlocked --sender $DEPLOYER > /tmp/floor-rehearse-4.log 2>&1) || bad "MorphoSepolia failed (see /tmp/floor-rehearse-4.log)"
VAULT=$(grep -E "MorphoVaultV2 +0x" /tmp/floor-rehearse-4.log | awk '{print $NF}' | tail -1)
SENT=$(grep -E "FloorSentinel +0x" /tmp/floor-rehearse-4.log | awk '{print $NF}' | tail -1)
ID=$(cast keccak "$(cast abi-encode 'f(string,address)' collateralToken $RSETH)")
check "vault cap before poke" "$(cast call $VAULT 'absoluteCap(bytes32)(uint256)' $ID --rpc-url $SEP | awk '{print $1}')" 1000000000000
check "sentinel role set" "$(cast call $VAULT 'isSentinel(address)(bool)' $SENT --rpc-url $SEP)" true
cast send $SENT 'poke(address)' $RSETH --rpc-url $SEP --unlocked --from $DEPLOYER >/dev/null
check "vault cap after poke" "$(cast call $VAULT 'absoluteCap(bytes32)(uint256)' $ID --rpc-url $SEP | awk '{print $1}')" 0
cast send $SENT 'poke(address)' $RSETH --rpc-url $SEP --unlocked --from $DEPLOYER >/dev/null && ok "second poke is a no-op (does not revert)" || bad "second poke reverted"

echo "== 5. CCIP broadcast  [README step 6]"
FEE=$(cast call $BC 'quote(uint64,address,address[])(uint256)' $ARB_SELECTOR $MIR "[$RSETH]" --rpc-url $SEP | awk '{print $1}')
echo "    quoted fee: $FEE wei"
[ "$FEE" -gt 0 ] && ok "fee quoted" || bad "fee is 0"
B0=$(cast balance $DEPLOYER --rpc-url $SEP)
TX=$(cast send $BC 'broadcast(uint64,address,address[])' $ARB_SELECTOR $MIR "[$RSETH]" --value $((FEE * 2)) --rpc-url $SEP --unlocked --from $DEPLOYER --json)
STATUS=$(echo "$TX" | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])')
check "broadcast tx status" "$STATUS" 0x1
GASCOST=$(echo "$TX" | python3 -c 'import sys,json;t=json.load(sys.stdin);print(int(t["gasUsed"],16)*int(t["effectiveGasPrice"],16))')
B1=$(cast balance $DEPLOYER --rpc-url $SEP)
check "paid exactly the fee (overpayment refunded)" "$(python3 -c "print($B0-$B1-$GASCOST)")" "$FEE"
echo "    (delivery to Arbitrum Sepolia needs the real CCIP network; it is proven in contracts/test/fork/CCIPSepoliaArbFork.t.sol)"

echo "== 6. Arkiv write preflight  [README step 8, estimate only, no key]"
(cd packages/publish && SWARM_GATEWAY=${SWARM_GATEWAY:-http://localhost:1635} npx tsx src/importer.ts --bundle ../resolver/fixtures/rseth-24908284.json:$RSETH \
  --swarm-ref ${SWARM_REF:-ca035fbdfa74bfd611af912e4a7debb53f38047a78bcd181a20c1490e8419778} --arkiv-estimate $DEPLOYER > /tmp/floor-rehearse-6.log 2>&1) \
  && grep -q "estimate, nothing sent" /tmp/floor-rehearse-6.log && ok "$(grep 'estimate, nothing sent' /tmp/floor-rehearse-6.log | sed 's/^ *//')" || bad "Arkiv preflight failed (see /tmp/floor-rehearse-6.log)"

echo
echo "rehearsal: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
