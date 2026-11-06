#!/usr/bin/env bash
# Gas preflight against the REAL nodes: dry-run each deploy script (no broadcast, no key), then ask the chain's own
# node (eth_estimateGas) what every contract creation really costs, and compare with the gas limit Forge will send.
# Needed because Sepolia runs Glamsterdam (EIP-8037 state-creation repricing), which Forge 1.8.1's EVM does not model.
set -euo pipefail
cd "$(dirname "$0")/../contracts"
set +u
export PATH="$HOME/.foundry/bin:$PATH"
. "$(dirname "$0")/manifest.sh"
W=$(m .writer)
SEP=$(m '.chains.sepolia.rpcs[0]')
BASE=$(m '.chains.baseSepolia.rpcs[0]')
N=$(cast nonce $W --rpc-url $SEP)
BC=$(cast compute-address $W --nonce $((N + 1)) | awk '{print $NF}')
CRE_FORWARDER=$(m .chains.sepolia.creForwarder) CCIP_ROUTER=$(m .chains.sepolia.ccipRouter) \
  forge script script/Deploy.s.sol:DeployHome --rpc-url $SEP --sender $W --gas-estimate-multiplier 900 >/dev/null 2>&1
CCIP_ROUTER=$(m .chains.baseSepolia.ccipRouter) SOURCE_CHAIN_SELECTOR=$(m .chains.sepolia.ccipSelector) SOURCE_BROADCASTER=$BC \
  forge script script/Deploy.s.sol:DeployMirror --rpc-url $BASE --sender $W --gas-estimate-multiplier 300 >/dev/null 2>&1
python3 -I - "$W" "$SEP" "$BASE" <<'PY'
import json, subprocess, sys
w, sep, base = sys.argv[1:4]
bad = 0
for chain, rpc in (("11155111", sep), ("84532", base)):
    d = json.load(open(f"broadcast/Deploy.s.sol/{chain}/dry-run/run-latest.json"))
    for t in d["transactions"]:
        tx = t["transaction"]; data = tx.get("input") or tx.get("data")
        out = subprocess.run(["cast", "rpc", "eth_estimateGas", json.dumps({"from": w, "data": data}), "--rpc-url", rpc], capture_output=True, text=True).stdout.strip().strip('"')
        est, lim = int(out, 16), int(tx["gas"], 16)
        ok = lim >= est * 1.15
        bad += not ok
        print(f"{'PASS' if ok else 'FAIL'}  chain {chain} {t.get('contractName')}: gas limit {lim:,} vs node estimate {est:,} ({100*(lim-est)/est:+.0f}%)")
sys.exit(1 if bad else 0)
PY
