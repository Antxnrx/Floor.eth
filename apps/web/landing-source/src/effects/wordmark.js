import { ASCII_COLOR, GLYPHS } from "../materials/AsciiMaterial";

/*
 * The wordmark, set in Geist Pixel.
 *
 * This file used to rasterise the word into a terminal grid and redraw every
 * cell as a character from the object's density ramp, because approximating a
 * pixel face was the only way to get one out of a face with no pixels in it.
 * Geist Pixel is that face, so the approximation goes: the word is real text in
 * a real typeface now, and what is left to do is put it on the pixel grid and
 * light it.
 *
 * Three numbers measured off the font — v1, weight 400, the only weight and
 * style it has — are why the rest of this file quantises what it does. The em
 * is 1000 units and every glyph bound and every advance in it is a whole
 * multiple of 38, so one of the font's own pixels is 38/1000 em and a word set
 * in it is already aligned to itself. The cap height, which is also the
 * ascender, is 19 of those pixels, which is what the type size is scaled to.
 * And each pixel is a separate rounded square — 'f' is 55 of them, with the
 * corners cut by an eighth of a cell.
 *
 * That last one is why nothing here turns antialiasing off, against the usual
 * advice for a pixel face. The rounding is drawn on purpose and squaring it off
 * would be reading the font wrong; and an edge that lands on a whole pixel
 * takes no fringe from antialiasing anyway, so leaving it on costs nothing
 * where the grid holds and saves the mark where it cannot — a 1.5x display,
 * or the fallback face. The `* { antialiased }` rule in style.css is already
 * asking for the grey kind rather than the subpixel kind, which is what this
 * wants: subpixel antialiasing would put colour fringes on the pixel edges.
 */

/*
 * One of the font's pixels, in CSS px, and the only knob in this file: the type
 * size, the tracking and the leading are all multiples of it. It has to be a
 * whole number, and that is the whole of what keeps the face crisp — every
 * advance is a whole number of cells, so a whole-pixel cell lands every glyph
 * origin, and with it every stem edge, on a whole CSS pixel.
 *
 * Two puts the seven-cell mark at about 64px across on wide screens. Solid type
 * reads heavier than a grid that was mostly blank cells, so the mark stays
 * smaller than the old 84px grid of ink.
 */
const CELL = 2;
// Below the md breakpoint — 48rem, where the hero's own type steps — the
// mark steps down again to keep the wordmark from dominating the small hero.
const CELL_NARROW = 1;
const WIDE = "(min-width: 48rem)";

// The cap height in font pixels, measured: 'f' and 'l' stand 19 pixels tall and
// nothing in "floor" descends. The size is scaled so the ink comes out exactly
// this many cells tall, which is also what lands a fallback face at the same
// height instead of at its own. Seven cells makes the mark half its previous
// height while keeping its glyphs aligned to the pixel grid.
const ROWS = 7;
// Cells the line box gets over and above the ink height, split above and below
// it by the half-leading, so the mark never sits on its own box's edge. It
// resolves to px, so the header keeps its height whichever face answers.
const LEAD = 2;
// A size to measure at; the real one is scaled from what it inks.
const PROBE = 100;

const FAMILY = "Geist Pixel";
// Monospace behind it rather than the page's sans: if the pixel face never
// arrives, the mark should still read as something a machine set, which is the
// register the rest of the hero's small type is already in.
const STACK = `"${FAMILY}", ui-monospace, SFMono-Regular, Menlo, monospace`;

/*
 * The reveal. The old mark climbed the object's density ramp a cell at a time,
 * blank to '@'. Real type cannot change glyph halfway, and a pixel face must
 * not be moved — a translate by anything other than a whole pixel resamples
 * every stem and undoes the only thing the rest of this file is for. So the
 * same ramp is climbed in intensity instead: each character comes up from
 * nothing to lit in as many discrete steps as the object in the hand has
 * densities. Nothing moves. The mark is lit rather than animated, which is also
 * what keeps it a sibling of the thing in the hand rather than a fade.
 */
const LEVELS = GLYPHS.length;
// Per character, and short enough to be over before it reads as an effect.
const CLIMB = 0.34;
// Spread of the starts across the word, so the light crosses it left to right
// the way the old sweep did and two or three characters are always mid-climb.
const SWEEP = 0.2;
/*
 * Where the climb stops gaining intensity and starts losing the tint. Up to
 * here a character is the colour the object is lit and only getting brighter;
 * past it the hue runs to white over the last steps. The mark rests white
 * because it is the page's type now and the page's type is white — it is no
 * longer a piece of the object's material, so wearing the object's colour at
 * rest would read as a logo someone forgot to finish. It still arrives in the
 * object's light, which is the tie the shared tint used to carry.
 */
const SETTLE = 0.7;

// Long enough to sit out a drag of the window edge, as in effects/lamps.js.
const RESIZE_SETTLE = 160;

const clamp01 = (n) => Math.min(1, Math.max(0, n));
// What to add to a coordinate to land it on a whole pixel, nearest one first.
const snap = (n) => Math.round(n) - n;

const TINT = [1, 3, 5].map((i) => parseInt(ASCII_COLOR.slice(i, i + 2), 16));

/*
 * A step on the ramp, as a colour. The intensity is carried in the alpha rather
 * than in `opacity`, because `opacity` would hand the character its own layer
 * to be composited from, and the point of all the quantising above is that the
 * glyph is painted where it belongs, once, every frame.
 */
const lit = (level) => {
	const white = clamp01((level - SETTLE) / (1 - SETTLE));
	const [r, g, b] = TINT.map((c) => Math.round(c + (255 - c) * white));
	return `rgba(${r}, ${g}, ${b}, ${Math.min(1, level / SETTLE)})`;
};

export const mountWordmark = (root) => {
	const hosts = [...(root?.querySelectorAll("[data-ascii]") ?? [])];
	if (!hosts.length) return;

	/*
	 * The size is scaled from what the face inks, so it has to be the face that
	 * will really be used. `document.fonts.ready` on its own does not get us
	 * there: until something on the page has asked for Geist Pixel there is no
	 * load pending for it to wait on, so it resolves straight away and the mark
	 * gets measured as the fallback. Asking for the characters first is what
	 * gives it something to wait for.
	 */
	const text = hosts.map((host) => host.dataset.ascii ?? "").join("");
	const face = `400 ${PROBE}px "${FAMILY}"`;

	return document.fonts
		.load(face, text)
		.catch(() => {})
		.then(() => document.fonts.ready)
		.then(() => {
			// The fallback is deliberate and looks deliberate, which means a missing
			// <link> would read as a design decision rather than a mistake. Say so
			// while there is still someone watching the console.
			if (import.meta.env.DEV && !document.fonts.check(face, text)) {
				console.warn(`[wordmark] ${FAMILY} did not load; set in the fallback.`);
			}

			const marks = hosts.map((host) => build(host)).filter(Boolean);
			if (!marks.length) return marks;

			if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
				marks.forEach((mark) => mark.draw(1));
				return marks;
			}

			// Plays on entering the section and is armed again by leaving it, so
			// nothing animates for a viewport nobody is looking at.
			let armed = true;
			new IntersectionObserver(
				([entry]) => {
					if (entry?.isIntersecting) {
						if (!armed) return;
						armed = false;
						marks.forEach((mark) => mark.play());
						return;
					}
					armed = true;
					marks.forEach((mark) => mark.draw(0));
				},
				{ threshold: 0 },
			).observe(root);

			return marks;
		});
};

const build = (host) => {
	const text = host.dataset.ascii;
	if (!text) return null;

	// One span per character, because the stagger needs somewhere per character
	// to put a colour. It also ends shaping between them, which is no loss and
	// one less thing to check: no kern or ligature can take a glyph off the cell
	// grid if there is nothing left to kern against.
	const row = document.createElement("span");
	// role="img" with a label on the host prunes everything under it from the
	// accessible tree already, so the characters are decoration twice over and
	// the name on the host is still the only name this has.
	row.setAttribute("aria-hidden", "true");
	const chars = [...text].map((glyph) => {
		const span = document.createElement("span");
		span.textContent = glyph;
		row.append(span);
		return span;
	});

	/*
	 * A zero-sized inline-block has no line boxes of its own, so the browser
	 * puts its bottom edge on the text baseline. That is the one number no font
	 * metric will give us, because how the leading is split and rounded is the
	 * engine's business, and align() needs it. It is read and never painted.
	 */
	const strut = document.createElement("span");
	strut.style.cssText = "display:inline-block;width:0;height:0";
	row.append(strut);

	// White is where the ramp ends, and setting it here as well means that is
	// also what shows if anything goes wrong between the characters landing in
	// the document and the first draw, instead of the page's dark ink on the
	// hero's dark ground. One weight and no italic, so font-synthesis has
	// nothing to offer: a faux bold would fill the gaps between the pixels.
	host.style.cssText = `
		position: relative;
		color: #fff;
		font-family: ${STACK};
		font-weight: 400;
		font-synthesis: none;
	`;
	host.replaceChildren(row);

	/*
	 * The cell is a whole number of pixels, but only relative to wherever the
	 * mark starts, and the header centres it: on an odd measure that is half a
	 * pixel, which is enough to smear every stem across two of them. So the box
	 * is nudged, by at most half a pixel, onto whole pixels in both axes — left
	 * for the glyph origins, the baseline for the pixel rows. Relative offsets
	 * rather than a transform, because a transform would composite the glyphs at
	 * the fraction instead of painting them past it. Measured against the
	 * document rather than the viewport, because the viewport's own offset is
	 * the scroll position and that is not ours to correct.
	 */
	const align = () => {
		host.style.left = "0px";
		host.style.top = "0px";
		const x = host.getBoundingClientRect().left + window.scrollX;
		host.style.left = `${snap(x)}px`;
		const y = strut.getBoundingClientRect().bottom + window.scrollY;
		host.style.top = `${snap(y)}px`;
	};

	/*
	 * Pick the cell, find the size that inks ROWS of them, and spend the rest on
	 * tracking and leading. Everything geometric is downstream of the cell, so
	 * this is the only place any of it is decided.
	 */
	const measure = () => {
		const cell = window.matchMedia(WIDE).matches ? CELL : CELL_NARROW;

		const ctx = document.createElement("canvas").getContext("2d");
		// The family comes back off the host rather than from STACK directly: a
		// font string the canvas cannot parse is silently ignored and leaves the
		// context at its default 10px sans-serif, which would be measured as a
		// real answer and scale the mark to about 780px. A computed value is one
		// the browser has already serialised and will take back.
		ctx.font = `400 ${PROBE}px ${getComputedStyle(host).fontFamily}`;
		const probe = ctx.measureText(text);
		const inked = probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent;
		if (!inked) return false;

		// Left fractional on purpose. The cell is the quantity that has to come
		// out whole; the size is only how you ask for it. Rounding this to 79px
		// would put the cell at 3.002 and walk the top of the mark off the grid.
		host.style.fontSize = `${(PROBE * ROWS * cell) / inked}px`;
		host.style.lineHeight = `${(ROWS + LEAD) * cell}px`;

		/*
		 * The `*` rule in style.css puts tracking-tight on every element, these
		 * spans included, so the tracking has to be set here rather than left
		 * alone. Which is just as well: -0.025em is two thirds of a cell, so it
		 * would take every character after the first off the grid and pull the
		 * pixels into each other. A whole cell is the nearest value that keeps
		 * the grid, and it is also the air a five-letter mark wants — the face
		 * already carries a cell of side bearing each side, so this makes it
		 * three between letters against a stem two cells wide. The last
		 * character does without, so its trailing space cannot pull the centring
		 * off to the left.
		 */
		chars.forEach((span, index) => {
			const last = index === chars.length - 1;
			span.style.letterSpacing = last ? "0px" : `${cell}px`;
		});

		align();
		return true;
	};

	/*
	 * `progress` 0 to 1 over the whole mark. A character's own progress lags by
	 * where it sits in the word, and its level is quantised after the easing
	 * rather than before, so the steps fall where the ease-out puts them: close
	 * together as it arrives, further apart as it settles.
	 */
	const draw = (progress) => {
		const elapsed = progress * (SWEEP + CLIMB);
		const lag = chars.length > 1 ? SWEEP / (chars.length - 1) : 0;
		chars.forEach((span, index) => {
			const local = clamp01((elapsed - index * lag) / CLIMB);
			const eased = 1 - (1 - local) ** 2;
			span.style.color = lit(Math.round(eased * LEVELS) / LEVELS);
		});
	};

	let raf = 0;
	const play = () => {
		cancelAnimationFrame(raf);
		const start = performance.now();
		const step = () => {
			const progress = clamp01(
				(performance.now() - start) / ((SWEEP + CLIMB) * 1000),
			);
			draw(progress);
			// Ends rather than looping: the mark is finished type, not an effect
			// left running under the rest of the section.
			if (progress < 1) raf = requestAnimationFrame(step);
		};
		step();
	};

	// The cell steps at the breakpoint and the centring moves with the measure,
	// so a resize re-measures. It also ends the reveal where it stands: there is
	// nothing to read in a mark being resized, and a half-lit one left behind by
	// a resize would just sit there half lit.
	let settle = 0;
	window.addEventListener("resize", () => {
		clearTimeout(settle);
		settle = setTimeout(() => {
			if (measure()) draw(1);
		}, RESIZE_SETTLE);
	});

	// If the measure cannot be taken there is nothing to drive, but the
	// characters are in the document and white, so the word still reads at
	// whatever size it inherited.
	if (!measure()) return null;
	draw(0);
	return { draw, play };
};
