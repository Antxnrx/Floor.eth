/** EF Anon-RPC networks, shared by the verify page and the dataset page. */
export type Net = "tor-js" | "nym" | "passthrough" | "direct";

/** Specifier contracts on Ethereum mainnet, from github.com/ethereum/anon-rpc adopters.json5 (read 2026-11-06). */
export const NETWORKS: Record<Exclude<Net, "direct">, { address: string; config?: unknown; anonymising: boolean }> = {
  "tor-js": {
    address: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
    // Gateways are blind relays into Tor. The first is a temporary alternative from the anon-rpc maintainers
    // (2026-11-06, "only up for a day or so"); the second is the demonstration gateway in the anon-rpc repo.
    // Override with ?torgw=host:port:id[,host:port:id].
    config: {
      gateways: new URLSearchParams(location.search).get("torgw")?.split(",") ?? [
        "159.89.167.167:12298:uEiA-2gShJvf4zebUOQElPY_y46cFeECnyn1TqOfnIQMeTg",
        "152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ",
      ],
    },
    anonymising: true,
  },
  nym: { address: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0", anonymising: true },
  passthrough: { address: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27", anonymising: false },
};
