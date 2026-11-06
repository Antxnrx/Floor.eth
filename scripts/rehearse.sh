#!/usr/bin/env bash
# Dress rehearsal of the testnet deploy, on LOCAL anvil forks of Ethereum Sepolia and Base Sepolia.
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
BASE_UP=${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}
SEP=http://127.0.0.1:8546
BASE=http://127.0.0.1:8547
FORWARDER=0x15fC6ae953E024d975e77382eEeC56A9101f9F88
SEP_ROUTER=0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59
BASE_ROUTER=0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93
BASE_VAULT_FACTORY=0xE3a2CEbca662d99D0F279aF13a6bb8c9825D2ea0
BASE_USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
SEP_SELECTOR=16015286601757825753
BASE_SELECTOR=10344971235874465080
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
anvil --fork-url "$BASE_UP" --port 8547 --auto-impersonate --silent & P2=$!
for i in $(seq 1 30); do cast chain-id --rpc-url $SEP >/dev/null 2>&1 && cast chain-id --rpc-url $BASE >/dev/null 2>&1 && break; sleep 1; done
check "sepolia fork chain id" "$(cast chain-id --rpc-url $SEP)" 11155111
check "base sepolia fork chain id" "$(cast chain-id --rpc-url $BASE)" 84532
# the real wallet's real balances are copied by the fork; top up so the rehearsal never depends on them
cast rpc anvil_setBalance $DEPLOYER 0x8AC7230489E80000 --rpc-url $SEP >/dev/null
cast rpc anvil_setBalance $DEPLOYER 0x8AC7230489E80000 --rpc-url $BASE >/dev/null
check "deployer nonce on sepolia (must be 0 for the predicted addresses)" "$(cast nonce $DEPLOYER --rpc-url $SEP)" 0
check "deployer nonce on base sepolia" "$(cast nonce $DEPLOYER --rpc-url $BASE)" 0
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

echo "== 2. deploy FloorMirror (Base Sepolia)  [README step 3]"
(cd contracts && CCIP_ROUTER=$BASE_ROUTER SOURCE_CHAIN_SELECTOR=$SEP_SELECTOR SOURCE_BROADCASTER=$BC forge script script/Deploy.s.sol:DeployMirror \
  --rpc-url $BASE --broadcast --unlocked --sender $DEPLOYER > /tmp/floor-rehearse-2.log 2>&1) || bad "DeployMirror failed (see /tmp/floor-rehearse-2.log)"
MIR=$(grep -E "FloorMirror 0x" /tmp/floor-rehearse-2.log | awk '{print $NF}' | tail -1)
check "mirror address = predicted" "$(echo $MIR | lc)" "$(echo $REG_PRED | lc)"
check "mirror trusts the broadcaster" "$(cast call $MIR 'sourceSender()(address)' --rpc-url $BASE | lc)" "$(echo $BC | lc)"
check "mirror source selector" "$(cast call $MIR 'sourceChainSelector()(uint64)' --rpc-url $BASE | awk '{print $1}')" $SEP_SELECTOR

echo "== 3. CRE workflow writes the rating  [README steps 4-5]"
check "config registryAddress = deployed registry" "$(python3 -c "import json;print(json.load(open('cre/floor-rating/config.staging.json'))['registryAddress'].lower())")" "$(echo $REG | lc)"
(cd cre && CRE_ETH_PRIVATE_KEY=${ANVIL0_KEY#0x} cre workflow simulate floor-rating --target rehearsal-settings --non-interactive --trigger-index 0 --broadcast > /tmp/floor-rehearse-3.log 2>&1) || bad "cre simulate --broadcast failed (see /tmp/floor-rehearse-3.log)"
grep -q 'ACCEPT' /tmp/floor-rehearse-3.log && ok "workflow accepted the evidence (reads matched)" || bad "workflow did not ACCEPT"
R=$(cast call $REG 'ratingOf(address)((uint8,bool,uint64,uint32,uint64,bytes32))' $RSETH --rpc-url $SEP)
echo "    registry.ratingOf(rsETH) = $R"
check "grade BREACHED (3)" "$(echo "$R" | tr -d '()' | cut -d, -f1 | tr -d ' ')" 3
check "known" "$(echo "$R" | tr -d '()' | cut -d, -f2 | tr -d ' ')" true
check "bundle hash" "$(echo "$R" | grep -oE '0x[0-9a-f]{64}')" 0x385b1ae424c9c5d46bb22a0081d358385a7dda8bd76f314baa42242acda86561

echo "== 4. Morpho Vault V2 + FloorSentinel on Sepolia (reads the registry), then poke  [README step 9]"
(cd contracts && FLOOR_RATING=$REG forge script script/MorphoDemo.s.sol:MorphoDemo --rpc-url $SEP --broadcast --unlocked --sender $DEPLOYER > /tmp/floor-rehearse-4.log 2>&1) || bad "MorphoSepolia failed (see /tmp/floor-rehearse-4.log)"
VAULT=$(grep -E "MorphoVaultV2 +0x" /tmp/floor-rehearse-4.log | awk '{print $NF}' | tail -1)
SENT=$(grep -E "FloorSentinel +0x" /tmp/floor-rehearse-4.log | awk '{print $NF}' | tail -1)
ID=$(cast keccak "$(cast abi-encode 'f(string,address)' collateralToken $RSETH)")
check "vault cap before poke" "$(cast call $VAULT 'absoluteCap(bytes32)(uint256)' $ID --rpc-url $SEP | awk '{print $1}')" 1000000000000
check "sentinel role set" "$(cast call $VAULT 'isSentinel(address)(bool)' $SENT --rpc-url $SEP)" true
cast send $SENT 'poke(address)' $RSETH --rpc-url $SEP --unlocked --from $DEPLOYER >/dev/null
check "vault cap after poke" "$(cast call $VAULT 'absoluteCap(bytes32)(uint256)' $ID --rpc-url $SEP | awk '{print $1}')" 0
cast send $SENT 'poke(address)' $RSETH --rpc-url $SEP --unlocked --from $DEPLOYER >/dev/null && ok "second poke is a no-op (does not revert)" || bad "second poke reverted"

echo "== 4b. Morpho Vault V2 + FloorSentinel on Base Sepolia (reads the MIRROR)  [README step 9b]"
(cd contracts && FLOOR_RATING=$MIR VAULT_V2_FACTORY=$BASE_VAULT_FACTORY VAULT_ASSET=$BASE_USDC forge script script/MorphoDemo.s.sol:MorphoDemo --rpc-url $BASE --broadcast --unlocked --sender $DEPLOYER > /tmp/floor-rehearse-4b.log 2>&1) || bad "MorphoDemo on Base failed (see /tmp/floor-rehearse-4b.log)"
BVAULT=$(grep -E "MorphoVaultV2 +0x" /tmp/floor-rehearse-4b.log | awk '{print $NF}' | tail -1)
BSENT=$(grep -E "FloorSentinel +0x" /tmp/floor-rehearse-4b.log | awk '{print $NF}' | tail -1)
check "base vault cap set" "$(cast call $BVAULT 'absoluteCap(bytes32)(uint256)' $ID --rpc-url $BASE | awk '{print $1}')" 1000000000000
check "base sentinel reads the mirror" "$(cast call $BSENT 'rating()(address)' --rpc-url $BASE | lc)" "$(echo $MIR | lc)"
check "base sentinel role set" "$(cast call $BVAULT 'isSentinel(address)(bool)' $BSENT --rpc-url $BASE)" true
cast send $BSENT 'poke(address)' $RSETH --rpc-url $BASE --unlocked --from $DEPLOYER >/dev/null
check "base cap unchanged before the CCIP message (mirror unrated)" "$(cast call $BVAULT 'absoluteCap(bytes32)(uint256)' $ID --rpc-url $BASE | awk '{print $1}')" 1000000000000

echo "== 5. CCIP broadcast Sepolia -> Base Sepolia  [README step 6]"
FEE=$(cast call $BC 'quote(uint64,address,address[])(uint256)' $BASE_SELECTOR $MIR "[$RSETH]" --rpc-url $SEP | awk '{print $1}')
echo "    quoted fee: $FEE wei"
[ "$FEE" -gt 0 ] && ok "fee quoted" || bad "fee is 0"
B0=$(cast balance $DEPLOYER --rpc-url $SEP)
TX=$(cast send $BC 'broadcast(uint64,address,address[])' $BASE_SELECTOR $MIR "[$RSETH]" --value $((FEE * 2)) --rpc-url $SEP --unlocked --from $DEPLOYER --json)
STATUS=$(echo "$TX" | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])')
check "broadcast tx status" "$STATUS" 0x1
GASCOST=$(echo "$TX" | python3 -c 'import sys,json;t=json.load(sys.stdin);print(int(t["gasUsed"],16)*int(t["effectiveGasPrice"],16))')
B1=$(cast balance $DEPLOYER --rpc-url $SEP)
check "paid exactly the fee (overpayment refunded)" "$(python3 -c "print($B0-$B1-$GASCOST)")" "$FEE"
echo "    (delivery to Base Sepolia, and the cap cut there, need the real CCIP network; proven in contracts/test/fork/CCIPToBaseEnforcementFork.t.sol)"

echo "== 6. Arkiv write preflight  [README step 8, estimate only, no key]"
(cd packages/publish && SWARM_GATEWAY=${SWARM_GATEWAY:-https://api.gateway.ethswarm.org} npx tsx src/importer.ts --bundle ../resolver/fixtures/rseth-24908284.json:$RSETH \
  --swarm-ref ${SWARM_REF:-ca035fbdfa74bfd611af912e4a7debb53f38047a78bcd181a20c1490e8419778} --arkiv-estimate $DEPLOYER > /tmp/floor-rehearse-6.log 2>&1) \
  && grep -q "estimate, nothing sent" /tmp/floor-rehearse-6.log && ok "$(grep 'estimate, nothing sent' /tmp/floor-rehearse-6.log | sed 's/^ *//')" || bad "Arkiv preflight failed (see /tmp/floor-rehearse-6.log)"

(cd packages/publish && npx tsx src/importer.ts --dataset --arkiv-estimate $DEPLOYER > /tmp/floor-rehearse-6b.log 2>&1) \
  && grep -q "arkiv dataset (estimate, nothing sent)" /tmp/floor-rehearse-6b.log && ok "$(grep 'arkiv dataset (estimate' /tmp/floor-rehearse-6b.log | sed 's/^ *//')" || bad "Arkiv dataset preflight failed (see /tmp/floor-rehearse-6b.log)"

echo
echo "rehearsal: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
