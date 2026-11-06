# Source this from scripts: `. "$(dirname "$0")/manifest.sh"`, then `m .contracts.registry.address`.
# Reads packages/deployments/testnet.json, the single source of truth for addresses and RPCs.
FLOOR_MANIFEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/packages/deployments/testnet.json"
m() { jq -r "$1" "$FLOOR_MANIFEST"; }
