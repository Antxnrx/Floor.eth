/*
 * Points the "Live now" receipts at the real transactions. Hashes and explorers
 * come from packages/deployments/testnet.json, the one file every deploy
 * updates, so this page never carries a copy of them. A link whose record is
 * missing keeps its fallback href (the Kelp simulation page).
 */
import testnet from "@floor/deployments/testnet.json";

export function mountLiveLinks(root = document) {
	const txs = testnet.kelp?.liveTxs ?? {};
	for (const a of root.querySelectorAll("[data-live-tx]")) {
		const tx = txs[a.dataset.liveTx];
		const base = tx && testnet.chains[tx.chain]?.explorerTx;
		if (!base) continue;
		a.href = `${base}${tx.hash}`;
		a.target = "_blank";
		a.rel = "noopener";
	}
	for (const a of root.querySelectorAll("[data-verify-link]")) {
		if (testnet.kelp?.token) a.href = `../verify/?token=${testnet.kelp.token}`;
	}
}
