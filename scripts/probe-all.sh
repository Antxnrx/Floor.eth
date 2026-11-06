#!/usr/bin/env bash
# Hourly re-probe of every LayerZero adapter over Aave-listed tokens (8 chains). Writes
# docs/evidence/inbound/latest-<chain>.json (the Live market reads the newest). Read-only: eth_call only, no key.
set -uo pipefail
cd "$(dirname "$0")/../packages/resolver"
. ../../scripts/manifest.sh
E=../../docs/evidence/inbound
ETH_RPCS=$(m '.chains.ethereum.rpcs | join(",")')
ETH_RPC_URLS="$ETH_RPCS" npx tsx src/inbound-cli.ts --out $E/latest-ethereum-34.json > /tmp/probe-ethereum-34.log 2>&1 || echo "ethereum-34 failed"
ONLY=$(python3 -c "
import json
a=json.load(open('data/adapters-all-chains.json'))['chains']['ethereum']['adapters']
o={x['oapp'] for x in json.load(open('data/adapters-ethereum.json'))['adapters']}
print(','.join(x['oapp'] for x in a if x['oapp'] not in o))")
ETH_RPC_URLS="$ETH_RPCS" npx tsx src/inbound-cli.ts --registry data/adapters-all-chains.json --chain ethereum --only "$ONLY" --out $E/latest-ethereum-new.json > /tmp/probe-ethereum-new.log 2>&1 || echo "ethereum-new failed"
for c in bsc arbitrum avalanche ink optimism polygon xlayer; do
  npx tsx src/inbound-cli.ts --registry data/adapters-all-chains.json --chain $c --out $E/latest-$c.json > /tmp/probe-$c.log 2>&1 || echo "$c failed"
done
for f in $E/latest-*.json; do echo "$(basename $f): $(jq -c '.tally' $f)"; done
