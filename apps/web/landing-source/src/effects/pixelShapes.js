import "./pixelShapes.css";

/*
 * Wireframe solids that quantise when their card is hovered.
 *
 * At rest each shape is a hairline vector drawing. On hover the same geometry
 * is re-traced into a buffer a fraction of the canvas's size and blitted back
 * nearest-neighbour, so the strokes land as hard blocks, and the blocks arrive
 * in a stable scattered order rather than all at once — the line dissolving
 * into pixels rather than cutting to them. The shape turns while it is held.
 *
 * Both states are the same path code at two scales, which is the point: there
 * is no second asset to keep in step, and the blocky state is the vector state
 * sampled coarsely, not a picture of one.
 *
 * It is the page's own idiom rather than a borrowed effect — the wordmark is a
 * pixel face, the trail behind the copy is a pixel grid, and the photo above
 * the footer resolves through one. Nothing here is a dependency.
 */

// CSS px per block in the hovered raster. Smaller reads as a rough line
// rather than a pixel drawing; larger and a 1-cell stroke loses the shape.
const CELL = 4;
// The blit is nearest-neighbour, so device pixels past the second only sharpen
// block edges — and at rest the hairline is already at the display's limit.
const DPR_MAX = 2;
// Long enough to sit out a drag of the window edge, as the page's other
// effects use.
const RESIZE_SETTLE = 160;

// Hover in faster than out: the quantise is the answer to the gesture, the
// return is the shape settling once attention has left.
const ENGAGE_MS = 380;
const RELEASE_MS = 560;
// Radians per second while held. Slow enough to read as a turn rather than a
// spin; the shape never completes a revolution during a normal hover.
const SPIN = 0.5;
// How quickly the turn unwinds to the rest pose, as the share of the
// remaining angle closed per 60th of a second.
const SETTLE = 0.055;

// Alpha of the vector wireframe at rest, and of the blocks once it has
// quantised. The hovered state is the stronger one: quantising is a
// sharpening, not a fade. 0.82 rather than 1 keeps it a drawing and not a
// logo. The colour is the host's, read at mount — see `inkOf`.
const REST_ALPHA = 0.3;
const PIXEL_ALPHA = Math.round(255 * 0.82);
// What the host resolves to if its `color` is somehow unreadable: the ink the
// effect was drawn in before it was themed.
const FALLBACK_INK = [14, 14, 20];

/*
 * The host's resolved `color`, as three bytes.
 *
 * pixelShapes.css sets `color: var(--fg)` on the host precisely so this can
 * be read back: a canvas takes no `currentColor`, and both the stroke and the
 * per-pixel RGB rewrite below need real numbers. getComputedStyle always
 * hands back an `rgb()` / `rgba()` form here whatever the author wrote, so
 * pulling the first three integers out of it is enough.
 */
const inkOf = (host) => {
	const resolved = getComputedStyle(host).color.match(/\d+(\.\d+)?/g);
	if (!resolved || resolved.length < 3) return FALLBACK_INK;
	return resolved.slice(0, 3).map(Number);
};
// Alpha a traced pixel must reach to count as covered. The low-resolution
// trace is still antialiased, and anything under this is the feathered edge
// of a line that already has its own cell.
const COVER = 40;

const NOOP = { destroy() {} };
// Quartic ease-out: most of the quantise happens in the first third of the
// transition, which is what makes it read as a snap with a settle rather than
// a dissolve.
const easeOut = (t) => 1 - (1 - t) ** 4;

/*
 * A stable value per cell, so the scatter is a property of the grid rather
 * than of the frame. Re-rolling it per frame would boil; seeding it from the
 * coordinates means a cell that has lit stays lit as progress rises, and the
 * same shape dissolves the same way every time.
 */
const hash = (x, y) => {
	let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// A closed ring of `segments` points, mapped into 3D by the caller.
const ring = (segments, map) => {
	const points = [];
	for (let i = 0; i <= segments; i++) {
		const t = (i / segments) * Math.PI * 2;
		points.push(map(Math.cos(t), Math.sin(t)));
	}
	return points;
};

const CUBE = [
	[-1, -1, -1],
	[1, -1, -1],
	[1, 1, -1],
	[-1, 1, -1],
	[-1, -1, 1],
	[1, -1, 1],
	[1, 1, 1],
	[-1, 1, 1],
];

/*
 * Each model is a list of polylines in object space, roughly inside the unit
 * cube, plus the pose it rests in. Polylines rather than edge pairs so a loop
 * costs one path instead of four, which matters most for the sphere.
 *
 * There is no per-model scale: the mount measures each one and fits it to the
 * box it was given. A hand-tuned number would have to be re-tuned for every
 * card size the page can produce, and would still be wrong partway through a
 * turn — the cube's silhouette is 41% wider on its diagonal than on its face.
 */
const MODELS = {
	// Resolving a graph: one surface, read through its own structure.
	sphere: {
		rx: -0.24,
		ry: 0.3,
		lines: [
			...[-0.58, 0, 0.58].map((h) => {
				const r = Math.sqrt(1 - h * h);
				return ring(30, (c, s) => [c * r, h, s * r]);
			}),
			...[0, Math.PI / 3, (2 * Math.PI) / 3].map((a) =>
				ring(26, (c, s) => [c * Math.cos(a), s, c * Math.sin(a)]),
			),
		],
	},
	// A policy is a box: six faces, every one of them a rule.
	cube: {
		rx: -0.3,
		ry: 0.62,
		lines: [
			[CUBE[0], CUBE[1], CUBE[2], CUBE[3], CUBE[0]],
			[CUBE[4], CUBE[5], CUBE[6], CUBE[7], CUBE[4]],
			[CUBE[0], CUBE[4]],
			[CUBE[1], CUBE[5]],
			[CUBE[2], CUBE[6]],
			[CUBE[3], CUBE[7]],
		],
	},
	// Evidence as a crystal: an octahedron is its three coordinate-plane
	// squares and nothing else, so the whole solid is three closed paths.
	octahedron: {
		rx: -0.18,
		ry: 0.42,
		lines: [
			[
				[1, 0, 0],
				[0, 1, 0],
				[-1, 0, 0],
				[0, -1, 0],
				[1, 0, 0],
			],
			[
				[0, 1, 0],
				[0, 0, 1],
				[0, -1, 0],
				[0, 0, -1],
				[0, 1, 0],
			],
			[
				[1, 0, 0],
				[0, 0, 1],
				[-1, 0, 0],
				[0, 0, -1],
				[1, 0, 0],
			],
		],
	},
	// A cap, drawn as one: a frustum is a ceiling with a wider floor.
	frustum: {
		rx: -0.26,
		ry: 0.5,
		lines: [
			[
				[-1, -0.8, -1],
				[1, -0.8, -1],
				[1, -0.8, 1],
				[-1, -0.8, 1],
				[-1, -0.8, -1],
			],
			[
				[-0.42, 0.8, -0.42],
				[0.42, 0.8, -0.42],
				[0.42, 0.8, 0.42],
				[-0.42, 0.8, 0.42],
				[-0.42, 0.8, -0.42],
			],
			[
				[-1, -0.8, -1],
				[-0.42, 0.8, -0.42],
			],
			[
				[1, -0.8, -1],
				[0.42, 0.8, -0.42],
			],
			[
				[1, -0.8, 1],
				[0.42, 0.8, 0.42],
			],
			[
				[-1, -0.8, 1],
				[-0.42, 0.8, 0.42],
			],
		],
	},
};

/*
 * Camera distance in object units. Perspective rather than isometric, so a
 * turn reads as a turn — but only just: the near and far faces of a unit solid
 * differ by (CAM + 1) / (CAM - 1), which is 25% here and was 67% at the 4 this
 * started on. At 4 a cube keystones hard enough to look like a splayed box.
 */
const CAM = 9;
// Share of the box the fitted shape fills on its tightest axis.
const FILL = 0.94;
// Rotations sampled when measuring a model's worst-case silhouette. The fit
// has to hold for every pose the spin can reach, not just the rest one.
const FIT_STEPS = 48;

/*
 * Mounts every [data-pixel-shape] under `root`. Returns a handle whose
 * destroy() puts each host back the way it was found.
 */
export function mountPixelShapes(root) {
	const hosts = [...(root?.querySelectorAll("[data-pixel-shape]") ?? [])];
	if (!hosts.length) return NOOP;
	const mounted = hosts.map(mountOne).filter(Boolean);
	return {
		destroy() {
			for (const one of mounted) one.destroy();
		},
	};
}

function mountOne(host) {
	const model = MODELS[host.dataset.pixelShape];
	if (!model) return null;

	// The hover target is the whole card, not the drawing: the shape is the
	// card's response to being read, and a 120px box inside a 320px article is
	// a smaller target than the gesture deserves.
	const card = host.closest("[data-shape-card]") ?? host;

	const [inkR, inkG, inkB] = inkOf(host);
	const restStroke = `rgba(${inkR}, ${inkG}, ${inkB}, ${REST_ALPHA})`;

	const canvas = document.createElement("canvas");
	canvas.className = "pixel-shape";
	// Decoration, with the card's heading and copy carrying the meaning.
	canvas.setAttribute("aria-hidden", "true");
	const ctx = canvas.getContext("2d");
	host.appendChild(canvas);

	// The quantised pass is traced here, at a fraction of the size, and blown
	// back up. One canvas for the life of the mount; it is resized, not
	// reallocated.
	const pix = document.createElement("canvas");
	const pixCtx = pix.getContext("2d", { willReadFrequently: true });

	const still = window.matchMedia("(prefers-reduced-motion: reduce)");
	// A coarse pointer has no hover, so the quantised state would never be
	// reachable. Those visitors get it as the resting state instead.
	const coarse = window.matchMedia("(hover: none), (pointer: coarse)");

	let dpr = 1;
	let cssW = 0;
	let cssH = 0;
	let pixW = 0;
	let pixH = 0;

	let engaged = false;
	let progress = coarse.matches ? 1 : 0;
	let spin = 0;
	let onScreen = false;
	let raf = 0;
	let last = 0;

	/*
	 * Projects one object-space point at rotation `ry` about the model's axis.
	 * The divisor is 1 at the object's centre, so `scale` is the half-extent a
	 * unit-radius model would occupy — which is what lets the fit below be
	 * measured once in those units and applied to either canvas.
	 */
	const project = (point, cosY, sinY, cosX, sinX) => {
		const [ox, oy, oz] = point;
		const x = ox * cosY + oz * sinY;
		const z0 = oz * cosY - ox * sinY;
		const y = oy * cosX - z0 * sinX;
		const z = oy * sinX + z0 * cosX;
		const f = CAM / (CAM - z);
		return [x * f, y * f];
	};

	/*
	 * The model's half-extent on each axis, over a full turn. Measured once,
	 * so the shape is framed for the widest pose it can reach rather than for
	 * the one it happens to rest in — otherwise a cube fitted face-on grows
	 * out of its box the moment it turns onto its diagonal.
	 */
	let unitX = 1;
	let unitY = 1;
	const measure = () => {
		const cosX = Math.cos(model.rx);
		const sinX = Math.sin(model.rx);
		let maxX = 0;
		let maxY = 0;
		for (let s = 0; s < FIT_STEPS; s++) {
			const ry = (s / FIT_STEPS) * Math.PI * 2;
			const cosY = Math.cos(ry);
			const sinY = Math.sin(ry);
			for (const line of model.lines) {
				for (const point of line) {
					const [x, y] = project(point, cosY, sinY, cosX, sinX);
					if (Math.abs(x) > maxX) maxX = Math.abs(x);
					if (Math.abs(y) > maxY) maxY = Math.abs(y);
				}
			}
		}
		unitX = maxX || 1;
		unitY = maxY || 1;
	};
	measure();

	// The scale that fits the measured silhouette into a box of `w` by `h`.
	const fit = (w, h) => Math.min(w / 2 / unitX, h / 2 / unitY) * FILL;

	/* Traces every polyline into `target`, in that target's own units. */
	const trace = (target, scale, cx, cy) => {
		const ry = model.ry + spin;
		const cosY = Math.cos(ry);
		const sinY = Math.sin(ry);
		const cosX = Math.cos(model.rx);
		const sinX = Math.sin(model.rx);

		target.beginPath();
		for (const line of model.lines) {
			for (let i = 0; i < line.length; i++) {
				const [x, y] = project(line[i], cosY, sinY, cosX, sinX);
				const px = cx + x * scale;
				const py = cy - y * scale;
				if (i === 0) target.moveTo(px, py);
				else target.lineTo(px, py);
			}
		}
	};

	const draw = () => {
		if (!cssW || !cssH) return;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		const p = easeOut(progress);

		// The vector state, fading out as the blocks arrive.
		if (p < 1) {
			ctx.globalAlpha = 1 - p;
			ctx.lineWidth = dpr;
			ctx.lineJoin = "round";
			ctx.strokeStyle = restStroke;
			trace(
				ctx,
				fit(canvas.width, canvas.height),
				canvas.width / 2,
				canvas.height / 2,
			);
			ctx.stroke();
			ctx.globalAlpha = 1;
		}
		if (p <= 0) return;

		// The same geometry at 1/CELL the size. Opaque, because the per-cell
		// alpha is decided by the threshold pass rather than by the stroke.
		pixCtx.clearRect(0, 0, pixW, pixH);
		pixCtx.lineWidth = 1;
		pixCtx.lineJoin = "round";
		pixCtx.strokeStyle = "#000";
		trace(pixCtx, fit(pixW, pixH), pixW / 2, pixH / 2);
		pixCtx.stroke();

		/*
		 * Threshold to hard cells and gate them on the per-cell hash, so the
		 * blocks appear in a fixed scattered order as `p` rises. RGB is
		 * rewritten alongside: the trace was black, and putImageData takes no
		 * composite operation that could tint it afterwards.
		 */
		const frame = pixCtx.getImageData(0, 0, pixW, pixH);
		const data = frame.data;
		const [r, g, b, a] = [inkR, inkG, inkB, PIXEL_ALPHA];
		for (let y = 0, o = 0; y < pixH; y++) {
			for (let x = 0; x < pixW; x++, o += 4) {
				const covered = data[o + 3] >= COVER && hash(x, y) <= p;
				data[o] = r;
				data[o + 1] = g;
				data[o + 2] = b;
				data[o + 3] = covered ? a : 0;
			}
		}
		pixCtx.putImageData(frame, 0, 0);

		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(pix, 0, 0, canvas.width, canvas.height);
	};

	const frame = (now) => {
		if (!last) last = now;
		const dt = Math.min((now - last) * 0.001, 0.05);
		last = now;

		/*
		 * Where the shape belongs when nothing is happening. On a coarse pointer
		 * that is the quantised state, not the vector one — it is the only state
		 * those visitors can reach, so a loop started for any other reason must
		 * settle back onto it rather than unwinding the shape to a hairline.
		 */
		const target = engaged || coarse.matches ? 1 : 0;

		/*
		 * engage() handles reduced motion without a loop, but a loop can already
		 * be in flight when the hover lands — the observer schedules one frame on
		 * scroll-in, and the preference can be turned on mid-hover. Converge and
		 * park here too, or that stray frame goes on spinning a shape the visitor
		 * has asked to hold still.
		 */
		if (still.matches) {
			progress = target;
			spin = 0;
			draw();
			raf = 0;
			return;
		}

		const span = engaged ? ENGAGE_MS : RELEASE_MS;
		const step = (dt * 1000) / span;
		progress =
			target > progress
				? Math.min(target, progress + step)
				: Math.max(target, progress - step);

		if (engaged) spin += SPIN * dt;
		// Compounded per 60th of a second, so the unwind takes the same wall
		// time on a 120Hz display as on a 60Hz one.
		else spin *= (1 - SETTLE) ** (dt * 60);

		draw();

		// Park once the shape is back at rest and square to its pose. Nothing
		// moves on its own here, so there is no reason to hold a frame loop.
		if (!engaged && progress === target && Math.abs(spin) < 0.001) {
			spin = 0;
			draw();
			raf = 0;
			return;
		}
		raf = requestAnimationFrame(frame);
	};

	const start = () => {
		if (raf || !onScreen) return;
		last = 0;
		raf = requestAnimationFrame(frame);
	};

	const size = () => {
		const box = host.getBoundingClientRect();
		cssW = Math.round(box.width);
		cssH = Math.round(box.height);
		if (!cssW || !cssH) return;
		dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
		canvas.width = Math.round(cssW * dpr);
		canvas.height = Math.round(cssH * dpr);
		pixW = Math.max(1, Math.round(cssW / CELL));
		pixH = Math.max(1, Math.round(cssH / CELL));
		pix.width = pixW;
		pix.height = pixH;
		draw();
	};

	const engage = (next) => {
		// Without hover the quantised state is the only one, so there is
		// nothing for a pointer to toggle.
		if (coarse.matches || engaged === next) return;
		engaged = next;
		if (still.matches) {
			// Reduced motion keeps the crossfade — it is the information —
			// but not the turn or the staged scatter.
			progress = next ? 1 : 0;
			spin = 0;
			draw();
			return;
		}
		start();
	};

	const onEnter = () => engage(true);
	const onLeave = () => engage(false);

	let settle = 0;
	const onResize = () => {
		clearTimeout(settle);
		settle = setTimeout(size, RESIZE_SETTLE);
	};

	const io = new IntersectionObserver(
		([entry]) => {
			onScreen = entry.isIntersecting;
			if (onScreen) start();
			else if (raf) {
				cancelAnimationFrame(raf);
				raf = 0;
			}
		},
		{ rootMargin: "120px" },
	);
	io.observe(host);

	const ro = new ResizeObserver(onResize);
	ro.observe(host);

	card.addEventListener("pointerenter", onEnter);
	card.addEventListener("pointerleave", onLeave);
	// Keyboard parity for a card that contains a link; harmless when it does
	// not, because nothing inside can then take focus.
	card.addEventListener("focusin", onEnter);
	card.addEventListener("focusout", onLeave);

	size();

	return {
		destroy() {
			clearTimeout(settle);
			if (raf) cancelAnimationFrame(raf);
			io.disconnect();
			ro.disconnect();
			card.removeEventListener("pointerenter", onEnter);
			card.removeEventListener("pointerleave", onLeave);
			card.removeEventListener("focusin", onEnter);
			card.removeEventListener("focusout", onLeave);
			canvas.remove();
		},
	};
}
