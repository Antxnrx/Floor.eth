/*
 * Marks [data-inview] elements while they are on screen, so the page's purely
 * declarative motion can follow the same rule as its canvases: a band that
 * nobody is looking at does not animate.
 *
 * CSS animations on an off-screen element go on ticking — the compositor may
 * skip the paint, but the timeline advances and style is still resolved. The
 * two loops here (the hero's marquee and the process beam) are long-running
 * and infinite, which is exactly the case where that adds up.
 *
 * The class, not the animation, is the contract: every animation it gates is
 * defined against `.is-inview` in style.css, so an element that never gets
 * observed simply rests.
 */
export function mountInView(root = document) {
	const targets = [...root.querySelectorAll("[data-inview]")];
	if (!targets.length) return { destroy() {} };

	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				entry.target.classList.toggle("is-inview", entry.isIntersecting);
			}
		},
		// A little ahead of the edge, so a loop is already running at the phase
		// it would have been at rather than starting from zero as it arrives.
		{ rootMargin: "80px" },
	);

	for (const target of targets) io.observe(target);
	return { destroy: () => io.disconnect() };
}

/*
 * One-shot entrance for [data-reveal] blocks.
 *
 * The resting state in the stylesheet is the *arrived* state, and the start
 * state is only ever applied from here. So the content is visible to anyone
 * whose script did not run, to a crawler, and to a print — the three places a
 * reveal gated on a class ships a blank section. This function is the only
 * thing that can hide the block, and it is also the thing that unhides it.
 *
 * Unobserved once revealed: an entrance that replays on every scroll past is
 * a page that will not settle.
 */
export function mountReveal(root = document) {
	const targets = [...root.querySelectorAll("[data-reveal]")];
	if (!targets.length) return { destroy() {} };

	// Nothing to arm for someone who asked motion to stop — the blocks are
	// already in their final state, which is the whole point of the default.
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
		return { destroy() {} };

	for (const target of targets) target.classList.add("is-armed");

	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				// Swapped rather than added: the armed state is a plain
				// `opacity: 0` with no transition on it, so arming can never
				// be seen happening, and the entrance is an animation the
				// revealed class brings with it.
				entry.target.classList.remove("is-armed");
				entry.target.classList.add("is-revealed");
				io.unobserve(entry.target);
			}
		},
		// Later than the loops' margin: a loop wants to be at the right phase
		// by the time it is read, an entrance wants to be seen happening.
		{ rootMargin: "0px 0px -12% 0px" },
	);

	for (const target of targets) io.observe(target);
	return { destroy: () => io.disconnect() };
}
