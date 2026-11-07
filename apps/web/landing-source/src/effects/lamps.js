import { Filament } from "./filament.js";
import "./filament.css";

/*
 * Wires the Filament effect to the `[data-lamps]` blocks inside one section.
 *
 * Upstream drives these from GSAP ScrollTrigger across a whole page of demos.
 * Here there is one section that owns motion, so the trigger is an
 * IntersectionObserver on that section and nothing outside it can start or
 * stop the effect — same rule the WebGL scene follows (see core/Three.js).
 */

// A resize changes where every character sits, so the texture has to be drawn
// again. Long enough to sit out a drag of the window edge.
const RESIZE_SETTLE = 160;

export const mountLamps = (root) => {
	const targets = [...(root?.querySelectorAll("[data-lamps]") ?? [])];
	if (!targets.length) return;

	// Characters are measured against the font they will actually be drawn in,
	// so the split waits for the fonts rather than racing them.
	return document.fonts.ready.then(() => {
		const effects = targets.map((el) => {
			const effect = new Filament(el);
			// The lines are hidden until they have been split, so no unsplit text
			// shows first (see .js-lamps in style.css). From here the effect's own
			// `is-masked` keeps them invisible until it plays them.
			el.classList.add("is-split");
			return effect;
		});

		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			effects.forEach((effect) => effect.show());
			return effects;
		}

		/*
		 * Plays once per visit to the section: entering plays, and leaving both
		 * stops whatever is still running and arms the next entry. Leaving
		 * mid-animation would otherwise leave a timeline ticking against a
		 * canvas nobody can see.
		 */
		let armed = true;
		new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) {
					if (!armed) return;
					armed = false;
					effects.forEach((effect) => effect.play());
					return;
				}
				armed = true;
				effects.forEach((effect) => effect.reset());
			},
			{ threshold: 0 },
		).observe(root);

		let settle = 0;
		window.addEventListener("resize", () => {
			clearTimeout(settle);
			settle = setTimeout(
				() => effects.forEach((effect) => effect.refresh()),
				RESIZE_SETTLE,
			);
		});

		return effects;
	});
};
