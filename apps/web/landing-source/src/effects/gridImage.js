import "./gridImage.css";

/*
 * Adapted from "Canvas Grid Mouse Effect" by Tom Miller (creativeocean):
 *   https://codepen.io/creativeocean/pen/emBOove
 *   MIT — CodePen's default licence for shared pens. Full text and attribution
 *   in LICENSE-codepen-grid.
 *
 * The photo is drawn to a canvas, then a grid of cells is drawn back over it.
 * A cell's `s` rises as the cursor nears it, and the cell re-samples a
 * progressively tighter crop of the photo into the same cell box, so cells near
 * the cursor magnify into blocky tiles. Cursor speed — the distance between the
 * raw pointer and the smoothed one chasing it — widens the radius of influence,
 * so a slow move magnifies one cell and a flick smears a whole region.
 *
 * Eleven changes from upstream:
 *
 * 1. No GSAP. The pen leans on `gsap.quickTo` for the pointer and speed
 *    smoothing, `gsap.ticker.add` for the loop and `gsap.utils.clamp` in the
 *    falloff. This project has only a six-call shim with none of those, so the
 *    smoothing is hand-written as a frame-rate-independent exponential
 *    approach, matched to the pen's eases — see POINT_TAU below for the
 *    derivation — and driven from a plain requestAnimationFrame.
 *
 * 2. The canvas is sized from the host's box rather than hard-coded to a square
 *    2000 x 2000, because this has to live in a page section of arbitrary
 *    aspect ratio. The photo is cover-fitted into it, which means a cell's
 *    source rectangle is no longer the same number as its destination
 *    rectangle — upstream could pass canvas coordinates straight to drawImage
 *    as source coordinates only because canvas and image were both 2000 wide.
 *    Here every source rectangle is mapped through the cover fit.
 *
 * 3. Distances are normalised by the box's equivalent square side, hypot(w, h)
 *    over root two, instead of by `cw`. Normalising by width alone would make
 *    the radius of influence depend on the section's aspect ratio; the
 *    equivalent side reduces to `cw` exactly when the box is square, so a
 *    square host behaves identically to the pen.
 *
 * 4. The loop is gated on an IntersectionObserver over the host, on document
 *    visibility, and on a convergence check that parks the loop once the
 *    pointer has settled and no cell is drawing any more. The page runs three
 *    canvas effects and only the visible, active one may hold a frame budget.
 *
 * 5. prefers-reduced-motion draws the photo once and never loops.
 *
 * 6. A device with no fine pointer anywhere gets the plain photo. There is no
 *    cursor to follow, and the pen's pointermove would fire once per tap and
 *    leave a magnified blotch frozen under the finger.
 *
 * 7. The backing store respects devicePixelRatio capped at 2, as the rest of
 *    this project does, and the grid is measured in CSS pixels through a canvas
 *    transform so a cell is the same size on either kind of display.
 *
 * 8. Nothing runs before `decode()` resolves, and a rejected decode leaves the
 *    nested <img> showing (see .is-live in gridImage.css). Where the host has a
 *    nested <img> that element is used as the drawImage source directly rather
 *    than re-requesting the URL into a second Image.
 *
 * 9. The pointer is converted from client coordinates inside the frame, against
 *    a rect read once per frame, rather than against a rect cached until the
 *    next resize. The pen's cache is correct for a fixed full-viewport
 *    background and wrong for anything that scrolls: the cursor and the effect
 *    drift apart by the scroll offset.
 *
 * 10. Dots below the same `s` threshold the crops use are skipped. Upstream
 *     walks every cell and issues a beginPath/arc/fill even for the ones whose
 *     radius has come out at zero, which is most of them most of the time.
 *
 * 11. Entry point, defaults and one default value. `mountGridImage(root)`
 *     replaces the pen's top-level side effects, and dotColor defaults to the
 *     page's own light token rather than #fff — see DEFAULTS.
 */

const DEFAULTS = {
	/*
	 * Cell pitch in CSS pixels. The pen's 85 was 4.25% of its 2000px canvas; on
	 * a section around 1200px wide the same proportion is about 50, and at the
	 * pen's literal 85 the grid reads as fifteen chunks across rather than as a
	 * grid. 56 keeps the pen's density and divides the common breakpoints
	 * without leaving a sliver of a final column.
	 */
	boxSize: 56,
	// Fades distant cells out instead of drawing them opaque, which lets the
	// undistorted photo show through them. Much subtler, and not the look.
	fade: false,
	dots: true,
	/*
	 * The pen's #fff. --color-ghost instead: it is the colour of the page the
	 * photo is cut into, so the dots read as the page showing through the
	 * image rather than as generic white specks on top of it, and on a dark
	 * photo the two are indistinguishable anyway at this size.
	 */
	dotColor: "#f8f8ff",
	/*
	 * Whether magnified crops are interpolated. At full `s` a cell blows a
	 * couple of source pixels up to its whole box, so this is the difference
	 * between soft lozenges (the pen's look, since it leaves the canvas
	 * default alone) and hard pixel blocks.
	 */
	smooth: true,
};

const TAU = Math.PI * 2;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

// Matches core/Three.js: the first frame after the loop has been parked —
// scrolling back, or a backgrounded tab — otherwise carries the whole gap as
// its delta and snaps the smoothed pointer straight onto the cursor.
const MAX_DELTA = 1 / 30;

/*
 * Seconds for the smoothed pointer to close all but 1/e of its distance to the
 * cursor. This is the replacement for `gsap.quickTo(m, "x", {duration: 1, ease:
 * "expo"})`, and the two are near-identical rather than merely similar.
 *
 * quickTo restarts its tween at the current value on every pointermove, so only
 * the first slice of the ease is ever rendered before the target moves again —
 * the regime where the curve's initial slope is the whole of its behaviour. For
 * a tween restarted continuously, an ease whose remaining fraction after t is
 * f(t) behaves as an exponential approach with time constant 1 / f'(0).
 * GSAP's expo.out is 1 - 2^(-10 p), so over a duration D the remaining fraction
 * is 2^(-10 t/D) = e^(-10 ln2 · t/D) — already an exponential, with time
 * constant D / (10 ln 2). At the pen's D of 1 second that is 0.1443 s.
 *
 * Which is also why the pen looks right with GSAP's default 60Hz ticker and
 * would run at double speed on a 120Hz display if it were a fixed per-frame
 * lerp: 1 - e^(-dt/0.1443) comes out at 0.109 for a 60Hz frame — the 0.1 a
 * hand-rolled version would reach for — and 0.056 for a 120Hz one.
 */
const POINT_TAU = 1 / (10 * Math.LN2);

/*
 * The same substitution for `gsap.quickTo(m, "s", {duration: 2, ease:
 * "power2"})`. power2.out is 1 - (1 - p)^3 in GSAP's numbering (power1 is
 * quadratic), so over a duration D its initial slope is 3/D and the equivalent
 * time constant is D/3 — two thirds of a second at the pen's D of 2. The speed
 * term is deliberately far laggier than the pointer term: it is what gives the
 * effect its wake, holding the radius open for a moment after a flick has
 * already stopped.
 */
const SPEED_TAU = 2 / 3;

// The pen's `d/cw*2`: cursor lag of half the box's width opens the radius of
// influence to the whole of it.
const SPEED_GAIN = 1;

// The pen's `if (c.s<0.001) return` — below this a cell's crop is the cell, so
// drawing it would only re-draw what the base image already put there.
const MIN_S = 0.001;

// A crop never narrows below one source pixel. Chrome returns silently from a
// drawImage with a zero-width source rect but older WebKit threw IndexSizeError,
// and `s` reaches exactly 1 whenever the cursor lands on a grid intersection.
const MIN_SRC = 1;

// CSS pixels of remaining cursor lag under which the pointer counts as settled,
// which is half of what one device pixel can show at the dpr cap.
const IDLE_GAP = 0.5;

// Matches effects/lamps.js. Long enough to sit out a drag of the window edge;
// until it fires the canvas is CSS-stretched to the new box.
const RESIZE_SETTLE = 160;

/*
 * The photo to draw. A nested <img> is used as the source element itself, so
 * the browser's one request serves both the fallback and the canvas and there
 * is no second cache lookup to lose; only a host that carries a URL and no
 * <img> needs an Image of its own.
 *
 * Drawing the element rather than a URL also means a <picture> or a srcset gets
 * honoured for free: drawImage takes whichever resource the browser actually
 * chose, so the same markup feeds the canvas an AVIF here and a JPEG there
 * without this knowing. What it does not get for free is the resource's size —
 * see sourceWidth, where a srcset makes `naturalWidth` the wrong number to fit
 * against. The one seam is that a resize wide enough to make the browser swap
 * resources changes that size; the fit is recomputed on every resize settle, so
 * it corrects itself on the next one rather than immediately.
 */
const resolveSource = (host) => {
	const nested = host.querySelector("img");
	if (nested) return nested;

	const url = host.dataset.gridImage;
	if (!url) return null;

	const img = new Image();
	img.decoding = "async";
	img.src = url;
	return img;
};

/*
 * `decode()` rejecting on a failed load is exactly the signal wanted here, but
 * it only reached the last engine in 2023 and calling a missing one would throw
 * synchronously out of the mount. Where it is absent the load events say the
 * same thing, a frame or two later and without the guarantee that the first
 * drawImage will not block on decoding.
 */
const whenDecoded = (img) => {
	if (typeof img.decode === "function") return img.decode();
	if (img.complete) {
		return img.naturalWidth
			? Promise.resolve()
			: Promise.reject(new Error("image failed to load"));
	}
	return new Promise((resolve, reject) => {
		img.addEventListener("load", resolve, { once: true });
		img.addEventListener("error", reject, { once: true });
	});
};

/*
 * The photo's real pixel width, which is not always `naturalWidth`.
 *
 * When an <img> picks its source out of a srcset, the spec corrects
 * `naturalWidth` by the chosen candidate's density: a 1600w file selected for a
 * 1440px slot reports 1440. `drawImage`'s explicit source coordinates are not
 * corrected — they stay in the file's real pixels. Measured here in Chrome on a
 * 1600w candidate reporting 1440: a source rectangle at x=1560 still samples
 * opaque pixels, and only past 1600 does it come back empty.
 *
 * So taking the fit off `naturalWidth` would scale a 1600px photo as though it
 * were 1440 and leave its right-hand tenth unreachable, and would do it only at
 * the viewport sizes where the chosen candidate happens not to match the slot —
 * which is the worst way for it to be wrong.
 *
 * The candidate's own `w` descriptor is that real width by definition, and it is
 * already in the DOM. Where there is no descriptor to match — a plain `src`, or
 * `x` descriptors — `naturalWidth` was never corrected and is already right.
 */
const sourceWidth = (img) => {
	if (!img.currentSrc) return img.naturalWidth;
	const sources = [...(img.parentNode?.querySelectorAll?.("source") ?? [])];
	for (const set of [...sources.map((el) => el.srcset), img.srcset]) {
		for (const candidate of (set ?? "").split(",")) {
			const [path, ...descriptors] = candidate.trim().split(/\s+/);
			const width = descriptors.find((token) => /^[1-9]\d*w$/.test(token));
			if (!path || !width) continue;
			let href;
			try {
				href = new URL(path, document.baseURI).href;
			} catch {
				continue;
			}
			if (href === img.currentSrc) return Number.parseInt(width, 10);
		}
	}
	return img.naturalWidth;
};

const build = (host, options) => {
	const props = { ...DEFAULTS, ...options };
	// A pitch of a few pixels would build tens of thousands of cells and spend
	// the frame in drawImage call overhead, so it is floored rather than trusted.
	props.boxSize = Math.max(8, Math.round(props.boxSize));

	const img = resolveSource(host);
	if (!img) return { ready: Promise.resolve(false), destroy: () => {} };

	let dead = false;
	let live = false;
	let canvas = null;
	let ctx = null;

	// The box in CSS pixels, the backing store's scale, and the source
	// rectangle of the cover fit in image pixels. `perCss` converts a length in
	// CSS pixels to the image pixels it samples.
	let w = 0;
	let h = 0;
	let ratio = 1;
	let perCss = 1;
	let src = null;
	let span = 0;
	const boxes = [];

	// x2/y2 is the cursor, x/y the smoothed point chasing it, s the lag as a
	// share of `span` — all three as in the pen, which seeds the smoothed point
	// at the centre and s at 1.5. Seeding s at 0 instead means the effect is
	// quiet until the cursor has actually moved; the pen's 1.5 opens the radius
	// to one and a half canvas widths and magnifies everything for the first
	// couple of seconds after load.
	const m = { x: 0, y: 0, x2: 0, y2: 0, s: 0 };

	let clientX = 0;
	let clientY = 0;
	let tracked = false;
	// Armed from the start, and only spent on a frame that has a cursor to snap
	// to: the loop can be started by the section scrolling into view, before the
	// pointer has ever been over it, and spending the snap on one of those frames
	// would leave the first real pointermove to be read as a flick from the
	// canvas's top left corner.
	let snap = true;

	let raf = 0;
	let last = 0;
	let onScreen = false;
	let observer = null;
	let resizer = null;
	let settle = 0;
	const still = window.matchMedia("(prefers-reduced-motion: reduce)");

	/*
	 * Measures the box, re-fits the photo and rebuilds the grid. The grid is
	 * stepped to just short of each edge rather than the pen's `x <= cw`, which
	 * starts a cell at exactly the far edge where nothing is visible; a final
	 * partial cell here overhangs the canvas instead and is clipped, so the
	 * right and bottom edges magnify like everywhere else.
	 */
	const size = () => {
		const rect = host.getBoundingClientRect();
		const boxW = Math.round(rect.width);
		const boxH = Math.round(rect.height);
		// Measured into locals and only committed on success, so a host that has
		// collapsed to nothing — hidden behind a tab, a display: none ancestor —
		// leaves the last good fit in place to be redrawn rather than a zero-sized
		// one that paints nothing over a canvas still holding the old frame.
		if (boxW < 1 || boxH < 1) return false;
		if (!img.naturalWidth || !img.naturalHeight) return false;
		w = boxW;
		h = boxH;

		ratio = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(w * ratio);
		canvas.height = Math.round(h * ratio);

		// Real file pixels, not the density-corrected ones — see sourceWidth. The
		// correction is uniform, so the height follows from the aspect ratio that
		// survives it. Re-read on every fit, because a resize can have the browser
		// swap to a different candidate with a different real size.
		const imgW = sourceWidth(img);
		const imgH = Math.round((imgW * img.naturalHeight) / img.naturalWidth);

		// object-fit: cover, worked out by hand: the photo is scaled by whichever
		// axis needs the most to fill the box, and the overflow is split evenly.
		const scale = Math.max(w / imgW, h / imgH);
		perCss = 1 / scale;
		src = {
			x: (imgW - w * perCss) / 2,
			y: (imgH - h * perCss) / 2,
			w: w * perCss,
			h: h * perCss,
		};

		span = Math.hypot(w, h) / Math.SQRT2;

		boxes.length = 0;
		for (let x = 0; x < w; x += props.boxSize) {
			for (let y = 0; y < h; y += props.boxSize) boxes.push({ x, y, s: 0 });
		}
		return true;
	};

	/*
	 * One frame. Returns how many cells magnified, which is what tells the loop
	 * whether there is still anything to animate.
	 */
	const draw = () => {
		if (!src) return 0;

		// Everything below is in CSS pixels; only drawImage's source rectangles
		// are in image pixels.
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.imageSmoothingEnabled = props.smooth;
		ctx.globalAlpha = 1;
		ctx.clearRect(0, 0, w, h);
		ctx.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, w, h);

		const reach = span * m.s;
		if (reach <= 0) return 0;

		const box = props.boxSize;
		let drew = 0;
		for (let i = 0; i < boxes.length; i++) {
			const cell = boxes[i];
			const s = 1 - clamp01(Math.hypot(cell.x - m.x, cell.y - m.y) / reach);
			cell.s = s;
			if (s < MIN_S) continue;
			drew++;

			/*
			 * The pen's crop, mapped through the cover fit. Its source rectangle
			 * is the cell inset by half the cell's own scaled size and shrunk by
			 * the whole of it, so at s = 0 the crop is the cell exactly and at
			 * s = 1 it has closed to a point at the cell's centre; the result is
			 * always drawn back out to the full cell. The two clamps hold the
			 * rectangle inside the fitted region, where the pen let the last row
			 * and column sample past the edge of the image and paint a
			 * transparent wedge.
			 */
			const crop = Math.max(MIN_SRC, box * (1 - s) * perCss);
			const inset = (box * s) / 2;
			const sx = Math.min(
				src.x + src.w - crop,
				src.x + (cell.x + inset) * perCss,
			);
			const sy = Math.min(
				src.y + src.h - crop,
				src.y + (cell.y + inset) * perCss,
			);

			if (props.fade) ctx.globalAlpha = s;
			ctx.drawImage(img, sx, sy, crop, crop, cell.x, cell.y, box, box);
		}
		ctx.globalAlpha = 1;

		// On the grid's intersections rather than in its cells, as the pen has
		// them: a cell's dot sits on its top left corner.
		if (props.dots && drew) {
			ctx.fillStyle = props.dotColor;
			for (let i = 0; i < boxes.length; i++) {
				const cell = boxes[i];
				if (cell.s < MIN_S) continue;
				ctx.beginPath();
				ctx.arc(cell.x, cell.y, box * 0.15 * cell.s, 0, TAU);
				ctx.fill();
			}
		}

		return drew;
	};

	const stop = () => {
		cancelAnimationFrame(raf);
		raf = 0;
	};

	const start = () => {
		if (raf || dead || !live || !onScreen) return;
		if (document.hidden || still.matches) return;
		last = performance.now();
		raf = requestAnimationFrame(frame);
	};

	function frame(now) {
		raf = requestAnimationFrame(frame);
		const delta = Math.min((now - last) / 1000, MAX_DELTA);
		last = now;

		// Read once per frame, not once per pointermove: the host's position
		// changes with every scrolled pixel, and a frame is about to paint
		// anyway so the layout read costs nothing it was not going to spend.
		const rect = host.getBoundingClientRect();
		if (tracked) {
			m.x2 = clientX - rect.left;
			m.y2 = clientY - rect.top;
		}
		if (snap && tracked) {
			snap = false;
			m.x = m.x2;
			m.y = m.y2;
			m.s = 0;
		}

		const approach = 1 - Math.exp(-delta / POINT_TAU);
		m.x += (m.x2 - m.x) * approach;
		m.y += (m.y2 - m.y) * approach;

		// The pen's cursor speed: how far the smoothed point still trails the
		// cursor, which rises while the cursor moves and decays once it stops.
		const gap = Math.hypot(m.x2 - m.x, m.y2 - m.y);
		const target = (gap / span) * SPEED_GAIN;
		m.s += (target - m.s) * (1 - Math.exp(-delta / SPEED_TAU));

		/*
		 * Parked once the cursor has settled and the radius has shrunk past the
		 * nearest cell, which is the exact condition rather than a guessed
		 * threshold on m.s: with the cursor settled the radius only decays, so a
		 * frame that magnified nothing means no later frame can either until the
		 * cursor moves again — and the frame just drawn is already the plain
		 * photo. Without this the loop would run for the six or so seconds the
		 * speed term takes to decay from a flick to invisibility, and then go on
		 * drawing the same untouched photo for as long as the section is in view.
		 */
		if (!draw() && gap < IDLE_GAP) stop();
	}

	const onPointerMove = (event) => {
		clientX = event.clientX;
		clientY = event.clientY;
		tracked = true;
		start();
	};

	// Entering snaps both points together so the effect starts from rest. The
	// pen keeps its smoothed point wherever the cursor last left it, so
	// re-entering the section anywhere else reads as one enormous flick and
	// blows the radius out across the whole canvas for a second.
	const onPointerEnter = (event) => {
		onPointerMove(event);
		snap = true;
	};

	// Draws the plain photo and parks. Used for reduced motion, for leaving the
	// viewport — which would otherwise freeze a half-magnified frame on screen
	// until the cursor happened to come back — and for teardown.
	const rest = () => {
		stop();
		m.s = 0;
		if (live) draw();
	};

	const onVisibility = () => {
		if (document.hidden) stop();
		else start();
	};

	const onStillChange = () => {
		if (still.matches) rest();
		else start();
	};

	const onResize = () => {
		clearTimeout(settle);
		settle = setTimeout(() => {
			if (dead || !size()) return;
			// A resize while parked still needs one frame, or the canvas keeps the
			// old backing store stretched across the new box.
			if (raf) return;
			rest();
		}, RESIZE_SETTLE);
	};

	/*
	 * Nothing above runs until the photo has decoded, so naturalWidth is real
	 * before anything is measured and drawImage is never handed an image that
	 * has no pixels yet. A rejected decode — a 404, a corrupt file — resolves
	 * false and leaves the host exactly as the page delivered it.
	 */
	const ready = whenDecoded(img)
		.then(() => {
			if (dead) return false;
			if (!img.naturalWidth || !img.naturalHeight) return false;

			canvas = document.createElement("canvas");
			// The cover fit means the base draw covers every pixel of the canvas,
			// so there is no alpha to composite against the page. Assumes an
			// opaque photo; a PNG with transparency would show black here.
			ctx = canvas.getContext("2d", { alpha: false });
			if (!ctx) return false;
			canvas.setAttribute("aria-hidden", "true");
			host.append(canvas);
			live = true;

			if (!size()) {
				canvas.remove();
				live = false;
				return false;
			}

			// Only now is the fallback hidden: the photo has decoded, the canvas
			// exists and the first frame is about to land on it.
			draw();
			host.classList.add("is-live");

			/*
			 * A device with no fine pointer anywhere gets the static frame and no
			 * listeners. `any-pointer` rather than the narrower `pointer: coarse`,
			 * because a touchscreen laptop reports a coarse primary pointer on some
			 * platforms and still has a cursor worth following.
			 */
			if (!window.matchMedia("(any-pointer: fine)").matches) return true;

			// Reduced motion is a gate inside start() rather than a reason to skip
			// the wiring, so a visitor who changes the setting mid-session gets the
			// effect — or loses it — without a reload.
			host.addEventListener("pointermove", onPointerMove, { passive: true });
			host.addEventListener("pointerenter", onPointerEnter, { passive: true });
			document.addEventListener("visibilitychange", onVisibility);
			still.addEventListener("change", onStillChange);
			window.addEventListener("resize", onResize);

			resizer = new ResizeObserver(onResize);
			resizer.observe(host);

			observer = new IntersectionObserver(
				([entry]) => {
					onScreen = !!entry?.isIntersecting;
					if (onScreen) start();
					else rest();
				},
				{ threshold: 0 },
			);
			observer.observe(host);

			return true;
		})
		.catch(() => false);

	const destroy = () => {
		dead = true;
		stop();
		clearTimeout(settle);
		observer?.disconnect();
		resizer?.disconnect();
		host.removeEventListener("pointermove", onPointerMove);
		host.removeEventListener("pointerenter", onPointerEnter);
		document.removeEventListener("visibilitychange", onVisibility);
		still.removeEventListener("change", onStillChange);
		window.removeEventListener("resize", onResize);
		host.classList.remove("is-live");
		canvas?.remove();
		canvas = null;
		ctx = null;
		live = false;
	};

	return { ready, destroy };
};

/*
 * Mounts the effect on every [data-grid-image] inside `root`, following the
 * same scoping the other effects in this directory use: one section owns the
 * effect and nothing outside it can start or stop it.
 *
 * The host carries the photo as a nested <img>, which is also the fallback, or
 * as a URL in the data attribute itself. `options` overrides DEFAULTS for every
 * host found.
 *
 * Returns synchronously — destroy() is safe to call before the photo has
 * decoded — with `ready` resolving to one boolean per host, true where the
 * canvas is up.
 */
export const mountGridImage = (root, options) => {
	const hosts = [...(root?.querySelectorAll("[data-grid-image]") ?? [])];
	const effects = hosts.map((host) => build(host, options));

	return {
		ready: Promise.all(effects.map((effect) => effect.ready)),
		destroy: () => effects.forEach((effect) => effect.destroy()),
	};
};
