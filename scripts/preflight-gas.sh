#!/usr/bin/env bash
# Gas preflight against the REAL nodes: dry-run each deploy script (no broadcast, no key), then ask the chain's own
# node (eth_estimateGas) what every contract creation really costs, and compare with the gas limit Forge will send.
# Needed because Sepolia runs Glamsterdam (EIP-8037 state-creation repricing), which Forge 1.8.1's EVM does not model.
set -euo pipefail
cd "$(dirname "$0")/../contracts"
export PATH="$HOME/.foundry/bin:$PATH"
W=0x563567A5788820093f71951DA383838D71ad2360
SEP=https://ethereum-sepolia-rpc.publicnode.com
BASE=https://sepolia.base.org
N=$(cast nonce $W --rpc-url $SEP)
BC=$(cast compute-address $W --nonce $((N + 1)) | awk '{print $NF}')
CRE_FORWARDER=0x15fC6ae953E024d975e77382eEeC56A9101f9F88 CCIP_ROUTER=0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59 \
  forge script script/Deploy.s.sol:DeployHome --rpc-url $SEP --sender $W --gas-estimate-multiplier 900 >/dev/null 2>&1
CCIP_ROUTER=0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93 SOURCE_CHAIN_SELECTOR=16015286601757825753 SOURCE_BROADCASTER=$BC \
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
