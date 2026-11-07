import * as THREE from "three";
import { easing } from "maath";

export class CameraRig {

	constructor(camera, options = {}) {
		this.camera = camera;
		this.target = options.target || new THREE.Vector3(0, 0, 0);
		this.xLimit = options.xLimit || null;
		this.yLimit = options.yLimit || null;
		this.zLimit = options.zLimit || null;
		this.smoothTime = options.smoothTime ?? 0.25;
		this.distanceScale = 1;

		/*
		 * Element the cursor has to be inside for the camera to follow it. Without
		 * it the rig reads the whole window, so reading the footer still swings the
		 * camera around in a section you cannot see.
		 *
		 * The listener stays on window rather than moving to the element, so it
		 * keeps working whatever the hero stacks on top of the canvas and whatever
		 * those layers set pointer-events to. Leaving the bounds parks the pointer
		 * at centre, and update() damps toward that — so the camera eases back to
		 * rest instead of freezing at whatever angle you left it.
		 */
		this.bounds = options.bounds || null;

		this.basePosition = camera.position.clone();

		this.pointer = { x: 0, y: 0 };

		this._onMouseMove = (event) => {
			const rect = this.bounds?.getBoundingClientRect();

			if (!rect) {
				this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
				this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
				return;
			}

			const inside =
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom;

			if (!inside) {
				this.pointer.x = 0;
				this.pointer.y = 0;
				return;
			}

			this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
			this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		};
		window.addEventListener("mousemove", this._onMouseMove);
	}

	/** Eases the camera back to rest, for when the section stops being visible. */
	recentre() {
		this.pointer.x = 0;
		this.pointer.y = 0;
	}

	_mapToLimit(pointer, base, limit) {
		if (!limit) return base;
		return pointer >= 0
			? THREE.MathUtils.lerp(base, limit[1], pointer)
			: THREE.MathUtils.lerp(base, limit[0], -pointer);
	}

	update(delta) {
		const targetX = this._mapToLimit(
			this.pointer.x,
			this.basePosition.x,
			this.xLimit,
		);
		const targetY = this._mapToLimit(
			this.pointer.y,
			this.basePosition.y,
			this.yLimit,
		);

		const targetZ =
			(this.zLimit
				? THREE.MathUtils.lerp(
						this.zLimit[0],
						this.zLimit[1],
						Math.min(Math.abs(this.pointer.x), 1),
					)
				: this.basePosition.z) * this.distanceScale;

		easing.damp(this.camera.position, "x", targetX, this.smoothTime, delta);
		easing.damp(this.camera.position, "y", targetY, this.smoothTime, delta);
		easing.damp(this.camera.position, "z", targetZ, this.smoothTime, delta);

		this.camera.lookAt(this.target);
	}

	dispose() {
		window.removeEventListener("mousemove", this._onMouseMove);
	}
}
