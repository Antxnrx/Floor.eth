import "./scenarios.css";

/*
 * The scan player: one block that holds two real scans of the same asset and
 * animates between them on demand.
 *
 * Why it is a player and not two tables. The page's claim is that a grade is a
 * reading of a moment, not a property of a token — rsETH is the same asset in
 * both panels, and the thing that changed is the configuration under it. A
 * control that replays one scan and then the other makes that the reader's own
 * action rather than a sentence they have to take on trust.
 *
 * Every figure the player animates is already in the markup, sourced to the
 * fixture it came from, and the tween only ever lands on it. Nothing here
 * computes a number; the DOM is the record and this file is the easing.
 */

// The bar and counter tween. Long enough to be followable across a 400px
// track, short enough that a reader pressing Replay twice is not waiting.
const RUN_MS = 920;
// Each row leaves a little after the one above it, so the panel resolves top
// to bottom rather than as one block snapping into place.
const STAGGER_MS = 110;

/*
 * Exponential ease-out. Matches --ease in style.css closely enough that a bar
 * driven from here and a border driven by a CSS transition read as the same
 * material, which is the only reason to care which curve this is.
 */
const easeOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

const NOOP = { destroy() {} };

const num = (el) => Number(el.dataset.count ?? el.dataset.bar ?? 0);

/*
 * The final state, applied with no tween. This is what the panel looks like
 * before it has ever been played, what reduced motion gets, and what a replay
 * lands on — so it is written once and called from all three.
 */
const settle = (panel) => {
	for (const el of panel.querySelectorAll("[data-count]")) {
		el.textContent = num(el).toLocaleString();
	}
	for (const el of panel.querySelectorAll("[data-bar]")) {
		el.style.setProperty("--fill", `${num(el)}%`);
	}
};

export function mountScenarios(root) {
	if (!root) return NOOP;
	const players = [...root.querySelectorAll("[data-scenario]")];
	if (!players.length) return NOOP;

	const teardowns = players.map(mountOne).filter(Boolean);
	return { destroy: () => teardowns.forEach((fn) => fn()) };
}

function mountOne(host) {
	const tabs = [...host.querySelectorAll("[data-scenario-tab]")];
	const panels = [...host.querySelectorAll("[data-scenario-panel]")];
	const replay = host.querySelector("[data-scenario-replay]");
	if (!tabs.length || tabs.length !== panels.length) return null;

	const still = window.matchMedia("(prefers-reduced-motion: reduce)");
	let frame = 0;
	let active = Math.max(
		0,
		tabs.findIndex((t) => t.getAttribute("aria-selected") === "true"),
	);

	// Both panels are in the markup so the figures survive a page with no
	// script, where the player degrades to the two scans stacked. From here on
	// exactly one is mounted, and the hidden one is hidden from the
	// accessibility tree too rather than just moved off-screen.
	const show = (i) => {
		panels.forEach((p, n) => {
			p.hidden = n !== i;
		});
		tabs.forEach((t, n) => {
			t.setAttribute("aria-selected", String(n === i));
			t.tabIndex = n === i ? 0 : -1;
		});
	};

	const stop = () => {
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
	};

	const play = (i) => {
		stop();
		const panel = panels[i];
		if (!panel) return;

		if (still.matches) {
			settle(panel);
			return;
		}

		/*
		 * Rows are collected once per run rather than per frame, and each is
		 * given its own offset into the timeline. The run ends when the last
		 * row has landed, which is why the total carries the stagger.
		 */
		const rows = [
			...panel.querySelectorAll("[data-count], [data-bar]"),
		].map((el, n) => ({
			el,
			to: num(el),
			bar: el.hasAttribute("data-bar"),
			at: n * STAGGER_MS,
		}));
		const total = RUN_MS + (rows.length ? rows.at(-1).at : 0);
		const start = performance.now();

		const tick = (now) => {
			const elapsed = now - start;
			for (const row of rows) {
				const t = easeOut(
					Math.min(Math.max((elapsed - row.at) / RUN_MS, 0), 1),
				);
				if (row.bar) {
					row.el.style.setProperty("--fill", `${row.to * t}%`);
				} else {
					// Rounded per frame, so a counter never shows a fraction of
					// a route on its way to a whole one.
					row.el.textContent = Math.round(row.to * t).toLocaleString();
				}
			}
			if (elapsed < total) {
				frame = requestAnimationFrame(tick);
				return;
			}
			frame = 0;
			// Land on the markup's own values rather than on the last frame's
			// arithmetic, so the figure on screen is the figure that was sourced.
			settle(panel);
		};

		frame = requestAnimationFrame(tick);
	};

	const select = (i, { animate = true } = {}) => {
		active = i;
		show(i);
		if (animate) play(i);
		else settle(panels[i]);
	};

	const onTab = (event) => {
		const i = tabs.indexOf(event.currentTarget);
		if (i < 0) return;
		// Re-pressing the current scan replays it, which is the same thing the
		// Replay control does and saves a reader hunting for it.
		select(i);
	};

	/*
	 * Arrow keys move between the scans, as a tablist is expected to. Focus
	 * follows selection because selecting is cheap here — it swaps two panels
	 * that are both already in the document.
	 */
	const onKey = (event) => {
		const step =
			event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const next = (active + step + tabs.length) % tabs.length;
		tabs[next].focus();
		select(next);
	};

	for (const tab of tabs) {
		tab.addEventListener("click", onTab);
		tab.addEventListener("keydown", onKey);
	}
	replay?.addEventListener("click", () => play(active));

	/*
	 * Nothing runs until the block has been seen. Arriving at a panel that has
	 * already finished playing would be the one case where the animation costs
	 * the reader the information it was added to carry.
	 */
	const io = new IntersectionObserver(
		(entries, observer) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				observer.disconnect();
				play(active);
			}
		},
		{ rootMargin: "0px 0px -15% 0px" },
	);

	select(active, { animate: false });
	// Held at zero until the first play, so the bars are seen to fill. The
	// counters keep their sourced text: a row of zeroes above the fold would
	// be a wrong number rather than an empty one.
	if (!still.matches) {
		for (const el of host.querySelectorAll("[data-bar]")) {
			el.style.setProperty("--fill", "0%");
		}
	}
	io.observe(host);

	return () => {
		stop();
		io.disconnect();
		for (const tab of tabs) {
			tab.removeEventListener("click", onTab);
			tab.removeEventListener("keydown", onKey);
		}
	};
}
