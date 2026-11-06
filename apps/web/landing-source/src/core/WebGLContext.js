import * as THREE from "three";

class WebGLContext {
	constructor(container) {
		if (!!WebGLContext.instance) {
			return WebGLContext.instance;
		}

		this.container = container;
		this.renderer = null;
		this.canvas = null;
		this.dimensions = { width: 0, height: 0 };
		this.pixelRatio = Math.min(window.devicePixelRatio, 2.0);

		WebGLContext.instance = this;
	}

	async init() {
		this.#createCanvas();
		this.#setUpRenderer();
	}

	#setUpRenderer() {
		this.renderer = new THREE.WebGLRenderer({
			canvas: this.canvas,
			antialias: false,
		});

		this.dimensions = this.getDimensions();

		this.renderer.setSize(this.dimensions.width, this.dimensions.height);
		this.renderer.setPixelRatio(this.pixelRatio);

		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.0;
	}

	/*
	 * Measured from the container, not the viewport. The page scrolls now, so a
	 * 100lvw probe would include the scrollbar gutter and hand back a width the
	 * canvas never actually has — a few pixels of aspect-ratio error, and a
	 * canvas wider than the section it sits in.
	 */
	getDimensions() {
		const rect = this.container.getBoundingClientRect();
		return {
			width: Math.max(1, Math.round(rect.width)),
			height: Math.max(1, Math.round(rect.height)),
		};
	}

	#createCanvas() {
		this.canvas = document.createElement("canvas");

		/*
		 * Absolute inside the container rather than fixed to the viewport. Fixed
		 * at z-index 35 would keep the canvas pinned over every section below the
		 * hero, and pointerEvents "auto" would swallow their clicks. Scoped here
		 * it is clipped by the hero's overflow-hidden and scrolls away with it.
		 *
		 * Pointer events are off: nothing in the scene is clickable, and the
		 * cursor tracking in CameraRig listens on window, so it does not need the
		 * canvas to be a hit target.
		 */
		this.canvas.style.position = "absolute";
		this.canvas.style.inset = 0;
		this.canvas.style.pointerEvents = "none";

		this.container.appendChild(this.canvas);

		return this.canvas;
	}

	onResize(width, height) {
		this.pixelRatio = Math.min(window.devicePixelRatio, 2);
		this.renderer.setSize(width, height);
		this.renderer.setPixelRatio(this.pixelRatio);
	}
}

export default WebGLContext;
