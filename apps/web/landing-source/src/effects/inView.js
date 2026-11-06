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
