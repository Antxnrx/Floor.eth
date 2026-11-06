import * as THREE from "three";
import WebGLContext from "./WebGLContext";
import Scene from "../scenes/Scene";

/*
 * Frames are only drawn while the scene's section is on screen, so `elapsed` is
 * accumulated from the frames actually rendered rather than read off the clock.
 * Wall time would keep running while the loop is parked, and scrolling back up
 * would drop you several seconds further into the morph cycle.
 *
 * The clamp covers the first frame after any pause — scrolling back, or
 * returning to a backgrounded tab — where the raw delta is the whole gap.
 */
const MAX_DELTA = 1 / 30;

class Three {
	constructor(container) {
		this.container = container;
		this.context = null;
		this.clock = new THREE.Clock();
		this.elapsed = 0;
		this.running = false;
		this.onScreen = true;
		this.raf = 0;
	}

	run() {
		this.context = new WebGLContext(this.container);
		this.context.init();
		this.scene = new Scene();
		this.#addResizeListener();
		this.#addVisibilityListeners();
		this.#updateRunning();

		this.scene.ready?.then(() => {
			if (!this.running) this.#frame();
		});
	}

	/*
	 * Two things park the loop: the section leaving the viewport, and the tab
	 * being backgrounded. The scene runs a beam compositor, two particle systems
	 * and a shadow map every frame, so this is most of the page's GPU cost — and
	 * none of it is visible from the footer.
	 *
	 * prefers-reduced-motion draws one frame and never loops, which leaves the
	 * scene lit and composed but still.
	 */
	#addVisibilityListeners() {
		this.still = window.matchMedia("(prefers-reduced-motion: reduce)");
		this.still.addEventListener("change", () => this.#updateRunning());

		document.addEventListener("visibilitychange", () => this.#updateRunning());

		new IntersectionObserver(
			([entry]) => {
				this.onScreen = !!entry?.isIntersecting;
				if (!this.onScreen) this.scene?.onHidden?.();
				this.#updateRunning();
			},
			{ threshold: 0 },
		).observe(this.container);
	}

	#updateRunning() {
		if (this.still?.matches) {
			this.#setRunning(false);
			this.#frame();
			return;
		}
		this.#setRunning(this.onScreen && !document.hidden);
	}

	#setRunning(on) {
		if (on === this.running) return;
		this.running = on;

		if (!on) {
			cancelAnimationFrame(this.raf);
			return;
		}

		// Discard the interval we spent parked; MAX_DELTA would clamp it anyway,
		// but this keeps the first resumed frame the same length as the rest.
		this.clock.getDelta();
		this.#animate();
	}

	#animate() {
		this.#frame();
		if (this.running) this.raf = requestAnimationFrame(() => this.#animate());
	}

	#frame() {
		const delta = Math.min(this.clock.getDelta(), MAX_DELTA);
		this.elapsed += delta;

		this.scene.animate(delta, this.elapsed);
		this.#render();
	}

	#render() {
		if (!this.context.renderer || !this.scene.scene) return;

		if (this.scene.render) {
			this.scene.render(this.context.renderer);
		} else {
			this.context.renderer.render(this.scene.scene, this.scene.camera);
		}
	}

	#addResizeListener() {
		window.addEventListener("resize", () => this.#onResize());
	}

	#onResize() {
		const { width, height } = this.context.getDimensions();
		this.context.onResize(width, height);
		this.scene.onResize(width, height);

		// A resize while parked still needs one frame, or the canvas keeps the
		// old backing store stretched to the new size until you scroll back.
		if (!this.running) this.#frame();
	}
}

export default Three;
