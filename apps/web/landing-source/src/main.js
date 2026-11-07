import "./style.css";
import Three from "./core/Three";
import { mountWordmark } from "./effects/wordmark";
import { mountLamps } from "./effects/lamps";
import { mountFluidCursor } from "./effects/fluidCursor";
import { mountGridImage } from "./effects/gridImage";
import { mountPixelShapes } from "./effects/pixelShapes";
import { mountBeams } from "./effects/beams";
import { mountInView, mountReveal } from "./effects/inView";
import { mountScenarios } from "./effects/scenarios";
import { mountLiveLinks } from "./effects/liveLinks";

// Marks the document as scripted, at parse time, so the hero's lines can be
// held back until they are split without hiding them from a visitor whose
// script never arrives. See .js-lamps in style.css.
document.documentElement.classList.add("js-lamps");

document.addEventListener("DOMContentLoaded", () => {
	const container = document.querySelector("#app");
	const three = new Three(container);
	three.run();

	// Text effects are scoped to the hero, the section that owns motion.
	const hero = document.querySelector("#hero");
	mountWordmark(hero);
	mountLamps(hero);

	/*
	 * Every effect below is scoped to one band and runs only while that band is
	 * on screen, so the canvases on this page never all animate at once: the
	 * hero's WebGL scene, the fluid trail behind the copy, the four process
	 * solids, and the photo magnifier. Several go further and park when there
	 * is nothing to draw — the trail once it has dissipated, each solid once it
	 * is back at its rest pose — so a cursor sitting in the hero costs nothing
	 * further down the page.
	 */
	mountFluidCursor(document.querySelector("main"));
	mountPixelShapes(document.querySelector("#components"));
	mountGridImage(document.querySelector("#texture"));

	/*
	 * The pipeline diagram's wires. No loop of its own: it measures the laid-out
	 * boxes, draws paths, and the pulse travelling them is a CSS keyframe gated
	 * on the same in-view class as the marquee.
	 */
	mountBeams(document.querySelector("#components"));

	/*
	 * The scan player. It holds the only control on the page that changes what
	 * is on screen, so it is mounted over the whole document rather than one
	 * band: where the comparison belongs is a question for the markup.
	 */
	mountScenarios(document);

	// "Live now" receipts, pointed at the transactions in the deployment manifest.
	mountLiveLinks(document);

	// The same rule for the page's two CSS loops, which have no canvas to gate.
	mountInView();
	// And for the one-shot entrances, which gate themselves off the same
	// observer but never play twice.
	mountReveal();

	if (import.meta.env.DEV) window.three = three;
});
