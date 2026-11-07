import "./fluidCursor.css";

/*
 * Vendored from Nestor Rios Garcia's "Fluid Pixel Cursor":
 *   https://github.com/nestorrig/Fluid-Pixel-Cursor-Effect  —  js/script.js
 *   MIT License, Copyright (c) 2026 Nestor Rios Garcia. Full text in
 *   LICENSE-fluid-pixel. The solver's own notes are that repo's doc.md.
 *
 * A stable-fluids grid on the CPU: the cursor's velocity splats into a
 * velocity field and a dye field, the velocity is advected and projected
 * divergence-free by a short Jacobi solve, the dye rides the cleaned field,
 * and the result is blitted through a low-resolution canvas so it lands as
 * blocks rather than smoke.
 *
 * Nine changes from upstream. The first four are forced by this being one
 * section's background rather than a demo page; the rest fall out of there
 * being a single theme here, and each one buys back frame time that the
 * hero's WebGL scene and the photo section's grid also want.
 *
 * 1. `mountFluidCursor(root, options)` replaces the load-time
 *    `initPixelFluidCursor()`. Tweakpane is gone with it: its bound `config`
 *    is now DEFAULTS below, overridable per mount, and its five presets
 *    collapse to the one ("Balanced Flow") this uses. Upstream's theme
 *    switcher, `--accent-color` write-back, favicons and grid background went
 *    the same way.
 *
 * 2. Scoped to `root`, not the window. The canvas is absolute inside it and
 *    sized by a ResizeObserver; pointer coordinates are relative to its box;
 *    the listener is on it. An IntersectionObserver cancels the frame loop
 *    and zeroes the fields when it scrolls away, so a section nobody is
 *    looking at costs nothing and comes back clean.
 *
 * 3. `pointermove` replaces `mousemove` plus `touchmove`, and coarse pointers
 *    bail at mount instead of being handled. Upstream's touch path calls
 *    `preventDefault()` and locks `overflow` on the document to keep a
 *    fullscreen trail drawable; mid-page that would eat the page's scroll.
 *    With no touch path there is nothing to lock.
 *
 * 4. The smoothed pointer snaps to the cursor on re-entry. Upstream is
 *    fullscreen, so its pointer can never leave; inside a section the
 *    smoothed point would otherwise lerp across the whole band from wherever
 *    the cursor left and paint a streak through it.
 *
 * 5. One dye field instead of three. Upstream's light path with a dark ink
 *    colour writes the same scalar to R, G and B, advects all three
 *    identically, and then reads only their maximum — so the three fields
 *    provably hold equal values at every step and one carries the same
 *    picture. That removes two full-grid advection passes per frame.
 *
 * 6. Only the alpha byte is written per frame. The ink colour is fixed here,
 *    so the RGB bytes are filled once when the buffer is allocated. Upstream
 *    rebuilds all four, and calls `createImageData` every frame on top of
 *    that; this reuses one buffer across frames.
 *
 * 7. `updateDyeDebug` is dropped. It walked the whole grid once per frame to
 *    feed a Tweakpane readout and an ASCII glyph that nothing here displays.
 *
 * 8. The loop parks itself. Upstream solves the grid for as long as the page
 *    is open, whether or not there is anything in it. Here, once the trail
 *    has dissipated and the cursor has stopped, the loop cancels and waits
 *    for the next pointer event — so this section costs nothing while the
 *    cursor is in the hero or down on the photo.
 *
 * 9. SIM_RESOLUTION defaults to 96 rather than 150, and the pointer
 *    smoothing is frame-rate independent. Both are explained where they are
 *    defined.
 */

/*
 * Upstream's "Balanced Flow" preset, except where noted. Dissipations are
 * per-advection multipliers, forces are in grid cells, and the two _GAIN
 * values scale with the pointer's speed in CSS px per frame.
 */
const DEFAULTS = {
	/*
	 * Rows in the simulation grid; columns follow the root's aspect, so cost
	 * grows with the square of this. Upstream's 150 is tuned for being the
	 * only thing on the page. 96 is a little over twice the block grid this
	 * actually resolves to vertically (see PIXEL_SIZE) and costs 59% fewer
	 * cells. It is not merely a finer grid thrown away by the blit, though —
	 * advection steps in cells, so a coarser grid also moves dye further per
	 * frame and reads looser. Raise it for a tighter, more viscous trail.
	 */
	simResolution: 96,
	// Width of one block in CSS px. The dye is nearest-neighbour downsampled
	// to the root's size divided by this, then blown back up. Smaller than the
	// splat is wide, or the trail resolves to two blocks and stops reading as
	// a grid at all — which is the constraint that keeps this at 9 rather than
	// shrinking alongside splatRadius below.
	pixelSize: 9,
	velocityDissipation: 0.77,
	/*
	 * Per-advection multiplier, so the trail's *length* is this compounded
	 * over the frames the cursor takes to cross it: 0.86 is under a third of a
	 * second to the transparency floor, against about a second at upstream's
	 * 0.93. Together with splatRadius this is what makes the trail a mark
	 * following the cursor rather than a wash over the section.
	 */
	densityDissipation: 0.86,
	// The quality knob, and the dominant cost: ten full-grid passes of the
	// fourteen a frame does. It is a short real-time solve, not a converged
	// one, which is all a decorative field needs.
	pressureIterations: 10,
	/*
	 * Splat geometry, in grid cells — so these are read against a cell of
	 * roughly 20 CSS px at simResolution 96 over this page's band. The kernel
	 * is bounded to twice the radius, which makes the figure below the blob's
	 * quarter-width: 0.8 cells is a mark about 64 px across at rest and 96 at
	 * a hard flick, where upstream's 1.5 with its gain reached 210.
	 *
	 * The _GAIN pair is cut harder than the base, because speed scaling is
	 * what turned a fast diagonal into a band across the whole section.
	 */
	splatForce: 9,
	splatRadius: 0.4,
	speedRadiusGain: 0.007,
	speedForceGain: 0.3,
	// A lerp factor, not drag: the share of the gap to the cursor the
	// smoothed point closes per 60th of a second. Higher snaps harder.
	friction: 0.22,
	intensity: 0.4,
	speedIntensityGain: 0.006,
	/*
	 * Null means "whatever the section is written in": the trail is read off
	 * the root's computed `color` at mount. The two documents in this bundle
	 * are not the same colour — the landing is dark, the long-form page is
	 * still light — and they share one call site in main.js, so a literal
	 * here would be invisible on one of them.
	 *
	 * Either way this takes upstream's ink path, where the trail holds one
	 * colour and density shows up as opacity, rather than its additive path,
	 * which decays towards black.
	 */
	color: null,
	/*
	 * Opacity ceiling for the densest block. Upstream reaches 1 — it draws
	 * over a bare demo page, where opaque ink is the effect. This sits under
	 * a section's copy, and a single splat's core already exceeds the ceiling
	 * at any value this low, so it is what decides whether the trail reads as
	 * texture or as redaction.
	 */
	maxAlpha: 0.15,
};

// Density-to-opacity, from upstream's RENDER_ALPHA_LIGHT. Only its ratio to
// `intensity` matters now that `maxAlpha` sets the ceiling, which is also why
// upstream's DYE_CLAMP is gone: it clamped density at 1.6 before a multiply
// that saturates an order of magnitude below it.
const ALPHA_GAIN = 1.85;
// How long after the last pointer event the cursor still counts as moving, in
// ms. Leaving the root stops the events, so this is also what stops the trail.
const POINTER_IDLE = 80;
// Below this, in CSS px per frame of smoothed movement, the cursor is at rest
// and injects nothing.
const POINTER_FLOOR = 0.04;
// Advection stays stable up to about a 55th of a second; a stalled or
// backgrounded tab would otherwise resume with a dt that blows the solver up.
const DT_MAX = 0.018;
const DT_MIN = 0.001;
/*
 * Density below which the densest block would round to a fully transparent
 * byte. Once the field is under this and the cursor has stopped, there is
 * nothing left to advect, so the loop parks rather than solving zeroes — which
 * is what keeps this section free while the cursor is in another one.
 */
const DYE_FLOOR = 0.001;
// Upstream's floor on either grid axis.
const SIM_MIN = 48;
// Long enough to sit out a drag of the window edge, as the other effects use.
const RESIZE_SETTLE = 160;
// The blit is nearest-neighbour, so device pixels past the second only sharpen
// the block edges.
const DPR_MAX = 2;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/*
 * Returns 0-1 channels, or null if the string is not a 3- or 6-digit hex, so a
 * typo in `options.color` fails at mount rather than painting something
 * arbitrary.
 */
const parseColor = (hex) => {
	const clean = String(hex).replace("#", "");
	const full =
		clean.length === 3
			? clean
					.split("")
					.map((ch) => ch + ch)
					.join("")
			: clean;
	if (!/^[\da-f]{6}$/i.test(full)) return null;
	const int = Number.parseInt(full, 16);
	return {
		r: ((int >> 16) & 255) / 255,
		g: ((int >> 8) & 255) / 255,
		b: (int & 255) / 255,
	};
};

/*
 * The root's own text colour, as 0-1 channels. getComputedStyle normalises
 * every authored form to `rgb()` / `rgba()`, so the first three numbers in it
 * are the channels whatever the stylesheet said.
 */
const currentInk = (root) => {
	const parts = getComputedStyle(root).color.match(/\d+(\.\d+)?/g);
	if (!parts || parts.length < 3) return null;
	const [r, g, b] = parts.slice(0, 3).map(Number);
	return { r: r / 255, g: g / 255, b: b / 255 };
};

const NOOP = { destroy: () => {} };

export const mountFluidCursor = (root, options = {}) => {
	if (!root) return NOOP;

	// Nothing to follow without a hovering pointer, and no trail worth having
	// for someone who asked motion to stop.
	if (window.matchMedia("(hover: none), (pointer: coarse)").matches)
		return NOOP;
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
		return NOOP;

	const config = { ...DEFAULTS, ...options };
	const ink = config.color ? parseColor(config.color) : currentInk(root);
	if (!ink) return NOOP;

	/*
	 * Upstream's rule that a darker ink splats more density, so a near-black
	 * trail stays as visible on white as a mid-tone one would. A light trail
	 * bottoms out at the floor, which is the right end of it anyway: ghost on
	 * a near-black ground blooms at a density that would barely register the
	 * other way round.
	 */
	const inkGain = Math.max(1 - Math.max(ink.r, ink.g, ink.b), 0.55);
	const byte = {
		r: Math.round(ink.r * 255),
		g: Math.round(ink.g * 255),
		b: Math.round(ink.b * 255),
	};
	const maxAlphaByte = clamp(config.maxAlpha, 0, 1) * 255;

	const canvas = document.createElement("canvas");
	canvas.className = "fluid-cursor";
	canvas.setAttribute("aria-hidden", "true");
	root.append(canvas);
	const ctx = canvas.getContext("2d", { alpha: true });

	// The dye is rasterised at grid resolution here, squeezed down to the block
	// grid, and blown back up onto the visible canvas. Two nearest-neighbour
	// steps is what makes the blocks square and hard-edged.
	const dyeCanvas = document.createElement("canvas");
	const dyeCtx = dyeCanvas.getContext("2d", { alpha: true });
	const blockCanvas = document.createElement("canvas");
	const blockCtx = blockCanvas.getContext("2d", { alpha: true });

	let width = 0;
	let height = 0;
	let simW = 0;
	let simH = 0;
	let cells = 0;
	let dpr = 1;
	let cssW = 0;
	let cssH = 0;
	let image = null;

	let vx = null;
	let vy = null;
	let vx0 = null;
	let vy0 = null;
	let pressure = null;
	let pressure0 = null;
	let divergence = null;
	let dye = null;
	let dye0 = null;

	const pointer = {
		x: 0,
		y: 0,
		smoothX: 0,
		smoothY: 0,
		prevX: 0,
		prevY: 0,
		// Cleared when the cursor leaves, so the next move snaps the smoothed
		// point to it rather than dragging a streak in from the old position.
		tracking: false,
		movedAt: 0,
	};

	const idx = (x, y) => x + y * simW;

	const allocate = () => {
		cells = simW * simH;
		vx = new Float32Array(cells);
		vy = new Float32Array(cells);
		vx0 = new Float32Array(cells);
		vy0 = new Float32Array(cells);
		pressure = new Float32Array(cells);
		pressure0 = new Float32Array(cells);
		divergence = new Float32Array(cells);
		dye = new Float32Array(cells);
		dye0 = new Float32Array(cells);

		dyeCanvas.width = simW;
		dyeCanvas.height = simH;
		// Opaque ink everywhere, fully transparent. From here a frame writes
		// nothing but the alpha bytes.
		image = dyeCtx.createImageData(simW, simH);
		const pixels = image.data;
		for (let o = 0; o < pixels.length; o += 4) {
			pixels[o] = byte.r;
			pixels[o + 1] = byte.g;
			pixels[o + 2] = byte.b;
		}
	};

	/*
	 * An upper bound on the field's densest cell, carried rather than measured:
	 * density only enters through a splat and only leaves by the dissipation
	 * multiplier, so tracking both against a scalar bounds the real maximum
	 * without the full-grid pass that reading it would cost every frame.
	 */
	let peak = 0;

	const clear = () => {
		dye?.fill(0);
		dye0?.fill(0);
		vx?.fill(0);
		vy?.fill(0);
		peak = 0;
		pointer.tracking = false;
	};

	const resize = () => {
		const rect = root.getBoundingClientRect();
		cssW = Math.max(1, rect.width);
		cssH = Math.max(1, rect.height);
		dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
		width = Math.max(1, Math.floor(cssW * dpr));
		height = Math.max(1, Math.floor(cssH * dpr));
		canvas.width = width;
		canvas.height = height;

		const rows = Math.max(SIM_MIN, Math.floor(config.simResolution));
		const columns = Math.max(SIM_MIN, Math.floor(rows * (cssW / cssH)));
		// A resize that leaves the grid the same size only changed the backing
		// store, and reallocating would throw away a trail for nothing.
		if (columns === simW && rows === simH) return;
		simW = columns;
		simH = rows;
		allocate();
	};

	const sample = (field, x, y) =>
		field[idx(clamp(x, 0, simW - 1), clamp(y, 0, simH - 1))];

	const bilerp = (field, x, y) => {
		const x0 = Math.floor(x);
		const y0 = Math.floor(y);
		const tx = x - x0;
		const ty = y - y0;
		const a = sample(field, x0, y0);
		const b = sample(field, x0 + 1, y0);
		const c = sample(field, x0, y0 + 1);
		const d = sample(field, x0 + 1, y0 + 1);
		return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
	};

	// A Gaussian impulse, bounded to twice its radius: idle or slow motion
	// touches a handful of cells rather than the grid.
	const splat = (normX, normY, forceX, forceY, radius, density) => {
		const cx = Math.floor(normX * (simW - 1));
		const cy = Math.floor(normY * (simH - 1));
		// Upstream's floor was 1.2 cells, which at this grid is wider than the
		// whole splat now asks for and so set the size on its own. 0.7 is the
		// point below which the kernel collapses onto the centre cell and the
		// trail loses its falloff.
		const rad = Math.max(0.7, radius);
		const minX = clamp(Math.floor(cx - rad * 2), 0, simW - 1);
		const maxX = clamp(Math.floor(cx + rad * 2), 0, simW - 1);
		const minY = clamp(Math.floor(cy - rad * 2), 0, simH - 1);
		const maxY = clamp(Math.floor(cy + rad * 2), 0, simH - 1);
		// The kernel peaks at a falloff of 1, on the centre cell, so the density
		// asked for here is the most any cell can gain.
		if (density > peak) peak = density;

		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				const dx = x - cx;
				const dy = y - cy;
				const falloff = Math.exp(-(dx * dx + dy * dy) / (rad * rad));
				const i = idx(x, y);
				vx[i] += forceX * falloff;
				vy[i] += forceY * falloff;
				dye[i] += density * falloff;
			}
		}
	};

	// Semi-Lagrangian: each cell takes what was where it came from.
	const advect = (src, dst, dt, dissipation) => {
		const stepX = dt * (simW - 2);
		const stepY = dt * (simH - 2);
		for (let y = 0; y < simH; y++) {
			for (let x = 0; x < simW; x++) {
				const i = idx(x, y);
				dst[i] =
					bilerp(src, x - vx[i] * stepX, y - vy[i] * stepY) * dissipation;
			}
		}
	};

	const advectVelocity = (dt) => {
		const stepX = dt * (simW - 2);
		const stepY = dt * (simH - 2);
		for (let y = 0; y < simH; y++) {
			for (let x = 0; x < simW; x++) {
				const i = idx(x, y);
				const backX = x - vx[i] * stepX;
				const backY = y - vy[i] * stepY;
				vx0[i] = bilerp(vx, backX, backY) * config.velocityDissipation;
				vy0[i] = bilerp(vy, backX, backY) * config.velocityDissipation;
			}
		}
		[vx, vx0] = [vx0, vx];
		[vy, vy0] = [vy0, vy];
	};

	/*
	 * Splats add divergence, and a field with divergence in it smears instead
	 * of curling. Jacobi gets most of it out: measure the divergence, relax
	 * pressure towards it, then subtract pressure's gradient from velocity.
	 * The boundary ring is left alone, which a decorative field can afford.
	 */
	const project = () => {
		for (let y = 1; y < simH - 1; y++) {
			for (let x = 1; x < simW - 1; x++) {
				const i = idx(x, y);
				divergence[i] =
					(vx[idx(x + 1, y)] -
						vx[idx(x - 1, y)] +
						vy[idx(x, y + 1)] -
						vy[idx(x, y - 1)]) *
					0.5;
				pressure[i] = 0;
			}
		}

		for (let k = 0; k < config.pressureIterations; k++) {
			for (let y = 1; y < simH - 1; y++) {
				for (let x = 1; x < simW - 1; x++) {
					const i = idx(x, y);
					pressure0[i] =
						(pressure[idx(x - 1, y)] +
							pressure[idx(x + 1, y)] +
							pressure[idx(x, y - 1)] +
							pressure[idx(x, y + 1)] -
							divergence[i]) *
						0.25;
				}
			}
			[pressure, pressure0] = [pressure0, pressure];
		}

		for (let y = 1; y < simH - 1; y++) {
			for (let x = 1; x < simW - 1; x++) {
				const i = idx(x, y);
				vx[i] -= (pressure[idx(x + 1, y)] - pressure[idx(x - 1, y)]) * 0.5;
				vy[i] -= (pressure[idx(x, y + 1)] - pressure[idx(x, y - 1)]) * 0.5;
			}
		}
	};

	const inject = (dt) => {
		/*
		 * Upstream closes a fixed share of the gap per frame, which runs at
		 * double speed on a 120Hz display. Compounding the same share over
		 * however many 60ths of a second this frame took gives the rate it was
		 * tuned at, whatever the display does.
		 */
		const ease = 1 - (1 - clamp(config.friction, 0, 1)) ** (dt * 60);
		pointer.smoothX += (pointer.x - pointer.smoothX) * ease;
		pointer.smoothY += (pointer.y - pointer.smoothY) * ease;

		const dx = pointer.smoothX - pointer.prevX;
		const dy = pointer.smoothY - pointer.prevY;
		const speed = Math.hypot(dx, dy);
		pointer.prevX = pointer.smoothX;
		pointer.prevY = pointer.smoothY;

		if (performance.now() - pointer.movedAt > POINTER_IDLE) return;
		if (speed <= POINTER_FLOOR) return;

		// Faster strokes splat wider, harder and denser, which is what makes
		// the trail answer the gesture rather than the position.
		const boost = clamp(speed * 1.6, 0, 60);
		const radius = config.splatRadius + boost * config.speedRadiusGain;
		const force = config.splatForce + boost * config.speedForceGain;
		const density =
			(config.intensity + boost * config.speedIntensityGain) * inkGain;

		splat(
			clamp(pointer.smoothX / cssW, 0, 1),
			clamp(pointer.smoothY / cssH, 0, 1),
			dx * force * dt,
			dy * force * dt,
			radius,
			density,
		);
	};

	const render = () => {
		const pixels = image.data;
		for (let i = 0, o = 3; i < cells; i++, o += 4) {
			// Uint8ClampedArray rounds and clamps, so the ceiling is the only
			// bound this has to apply itself.
			const alpha = dye[i] * ALPHA_GAIN * 255;
			pixels[o] = alpha > maxAlphaByte ? maxAlphaByte : alpha;
		}
		dyeCtx.putImageData(image, 0, 0);

		const step = Math.max(1, Math.floor(config.pixelSize * dpr));
		const blockW = Math.max(1, Math.floor(width / step));
		const blockH = Math.max(1, Math.floor(height / step));
		if (blockCanvas.width !== blockW || blockCanvas.height !== blockH) {
			blockCanvas.width = blockW;
			blockCanvas.height = blockH;
		}

		blockCtx.clearRect(0, 0, blockW, blockH);
		blockCtx.imageSmoothingEnabled = false;
		blockCtx.drawImage(dyeCanvas, 0, 0, blockW, blockH);

		ctx.clearRect(0, 0, width, height);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(blockCanvas, 0, 0, width, height);
	};

	let raf = 0;
	let last = 0;
	// Whether the section is on screen. Nothing starts the loop while it is
	// not, so a cursor moving over a section far up the page cannot wake this.
	let onScreen = false;

	const stop = () => {
		cancelAnimationFrame(raf);
		raf = 0;
	};

	const start = () => {
		if (raf || !onScreen) return;
		// Dropped rather than carried across the gap, so the first frame back
		// gets a real interval instead of however long the loop was parked.
		last = 0;
		raf = requestAnimationFrame(frame);
	};

	const park = () => {
		stop();
		clear();
		render();
	};

	const frame = (now) => {
		if (!last) last = now;
		const dt = clamp((now - last) * 0.001, DT_MIN, DT_MAX);
		last = now;

		if (pointer.tracking) inject(dt);
		advectVelocity(dt);
		project();
		// Dye rides the projected field rather than the raw splat, so it curls
		// with the flow instead of following the cursor's own line.
		advect(dye, dye0, dt, config.densityDissipation);
		[dye, dye0] = [dye0, dye];
		peak *= config.densityDissipation;
		render();

		// A still cursor parks too, not just one that left: holding inside the
		// section is as empty a field as being outside it.
		const idle = performance.now() - pointer.movedAt > POINTER_IDLE;
		if (idle && peak < DYE_FLOOR) {
			park();
			return;
		}

		raf = requestAnimationFrame(frame);
	};

	const onMove = (event) => {
		const rect = root.getBoundingClientRect();
		pointer.x = event.clientX - rect.left;
		pointer.y = event.clientY - rect.top;
		pointer.movedAt = performance.now();
		if (!pointer.tracking) {
			pointer.tracking = true;
			pointer.smoothX = pointer.x;
			pointer.smoothY = pointer.y;
			pointer.prevX = pointer.x;
			pointer.prevY = pointer.y;
		}
		start();
	};

	const onLeave = () => {
		pointer.tracking = false;
		pointer.movedAt = 0;
	};

	root.addEventListener("pointermove", onMove, { passive: true });
	root.addEventListener("pointerleave", onLeave);

	let settle = 0;
	const observer = new ResizeObserver(() => {
		clearTimeout(settle);
		settle = setTimeout(resize, RESIZE_SETTLE);
	});
	observer.observe(root);

	/*
	 * The page carries three canvas effects and only the one on screen may
	 * run. Leaving also zeroes the fields, so coming back starts from nothing
	 * rather than from a trail left behind minutes ago.
	 */
	const visibility = new IntersectionObserver(
		([entry]) => {
			onScreen = Boolean(entry?.isIntersecting);
			if (onScreen) {
				// Only if there is something to simulate. On screen with the
				// cursor elsewhere, the next pointermove starts it.
				if (pointer.tracking || peak >= DYE_FLOOR) start();
				return;
			}
			park();
		},
		{ threshold: 0 },
	);

	resize();
	render();
	visibility.observe(root);

	return {
		destroy: () => {
			cancelAnimationFrame(raf);
			raf = 0;
			clearTimeout(settle);
			observer.disconnect();
			visibility.disconnect();
			root.removeEventListener("pointermove", onMove);
			root.removeEventListener("pointerleave", onLeave);
			canvas.remove();
		},
	};
};
