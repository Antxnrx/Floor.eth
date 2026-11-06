/*
 * The two things the vendored Codrops effect expects to find on `window`.
 *
 * Upstream runs on a page that loads GSAP core and the SplitText plugin from
 * script tags. Rather than take a ~30 kB animation library for six calls, this
 * module implements exactly those six — and nothing else — so glText.js can
 * import them under the names it already uses and otherwise stay verbatim.
 *
 * What glText.js actually touches:
 *   gsap.timeline({onComplete}) -> .to(target, vars) / .call(fn), chained
 *   timeline.kill() / timeline.isActive()
 *   gsap.set(targets, {opacity}) and gsap.set(targets, {clearProps: 'opacity'})
 *   SplitText.create(el, {type, wordsClass, charsClass}).chars
 *
 * If GSAP ever lands in this project for other reasons, delete this file and
 * change the import at the top of glText.js to:
 *   import gsap from "gsap";
 *   import SplitText from "gsap/SplitText";
 *   gsap.registerPlugin(SplitText);
 * Nothing else has to change.
 */

/* Only the two curves the effect asks for, both on 0..1. */
const EASES = {
	none: (t) => t,
	"power1.inOut": (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
};

/* Keys in a tween's vars that configure it rather than name a property to animate. */
const CONTROL = new Set(["duration", "ease", "onUpdate", "onComplete", "onStart"]);

const seconds = () => performance.now() / 1000;

/*
 * One leg of a timeline: every numeric property named in `vars` moves from
 * wherever it is when the leg starts to the value given. The start is read on
 * the first frame, not when the leg is declared, because a timeline is built
 * up front and its later legs run against values the earlier ones changed.
 */
class Tween {
	constructor(target, vars) {
		this.target = target;
		this.duration = vars.duration ?? 0;
		this.ease = EASES[vars.ease] ?? EASES.none;
		this.onUpdate = vars.onUpdate;
		this.props = Object.entries(vars).filter(([key]) => !CONTROL.has(key));
		this.from = null;
	}

	/* Renders at `elapsed` seconds in; returns whether it has finished. */
	render(elapsed) {
		if (!this.from) this.from = this.props.map(([key]) => this.target[key]);

		const progress = this.duration > 0 ? Math.min(elapsed / this.duration, 1) : 1;
		const eased = this.ease(progress);
		this.props.forEach(([key, to], i) => {
			this.target[key] = this.from[i] + (to - this.from[i]) * eased;
		});
		this.onUpdate?.();

		return progress >= 1;
	}
}

/*
 * Legs run in the order they were added, each starting when the one before it
 * finished. Legs are added synchronously right after construction — `.to(...)`
 * chained off `gsap.timeline()` — so the loop can't start until the next frame,
 * which is also when GSAP would first render.
 */
class Timeline {
	constructor({ onComplete } = {}) {
		this.legs = [];
		this.onComplete = onComplete;
		this.active = true;
		this.at = 0;
		this.startedAt = null;
		this.raf = requestAnimationFrame(this.#frame);
	}

	to(target, vars) {
		this.legs.push(new Tween(target, vars));
		return this;
	}

	call(fn) {
		this.legs.push(fn);
		return this;
	}

	isActive() {
		return this.active;
	}

	kill() {
		cancelAnimationFrame(this.raf);
		this.active = false;
	}

	#frame = () => {
		this.raf = requestAnimationFrame(this.#frame);
		const now = seconds();

		// Zero-length legs are callbacks, so more than one leg can be consumed
		// in a frame. A leg that finishes hands the rest of this frame to the
		// next one rather than carrying the remainder over — at most one frame
		// of drift per leg, across two legs.
		while (this.at < this.legs.length) {
			const leg = this.legs[this.at];
			if (typeof leg === "function") {
				leg();
				this.at++;
				this.startedAt = now;
				continue;
			}
			this.startedAt ??= now;
			if (!leg.render(now - this.startedAt)) return;
			this.at++;
			this.startedAt = null;
		}

		this.kill();
		this.onComplete?.();
	};
}

export const gsap = {
	timeline: (vars) => new Timeline(vars),

	/*
	 * Only ever called with `opacity`, or with `clearProps` to hand the property
	 * back to the stylesheet. Numbers are fine to assign straight to style —
	 * CSSOM stringifies them.
	 */
	set(targets, vars) {
		const list = Array.isArray(targets) ? targets : [targets];
		for (const el of list) {
			if (!el) continue;
			if (vars.clearProps) {
				for (const prop of vars.clearProps.split(",")) {
					el.style.removeProperty(prop.trim());
				}
				continue;
			}
			for (const [key, value] of Object.entries(vars)) el.style[key] = value;
		}
	},
};

/*
 * The characters, each in its own inline element so the effect can measure
 * where the page put it. Words are wrapped too and made atomic, or the browser
 * would treat every character boundary as somewhere it may break a line.
 *
 * Spaces stay as text between the words, so the line still wraps and still
 * reads as words to a screen reader.
 */
const splitNode = (node, chars) => {
	if (node.nodeType !== Node.TEXT_NODE) {
		for (const child of [...node.childNodes]) splitNode(child, chars);
		return;
	}

	const raw = node.textContent;
	const text = raw.trim();
	// Whitespace between two elements: it is the space, so leave it alone.
	if (!text) return;

	const fragment = document.createDocumentFragment();
	// Indentation in the markup is not a space; a gap next to a sibling is.
	if (/^\s/.test(raw) && node.previousSibling) fragment.append(" ");

	text.split(/\s+/).forEach((word, index) => {
		if (index > 0) fragment.append(" ");
		const wordEl = document.createElement("span");
		wordEl.className = "word";
		wordEl.style.display = "inline-block";
		for (const character of word) {
			const charEl = document.createElement("span");
			charEl.className = "char";
			charEl.textContent = character;
			wordEl.append(charEl);
			chars.push(charEl);
		}
		fragment.append(wordEl);
	});

	if (/\s$/.test(raw) && node.nextSibling) fragment.append(" ");
	node.replaceWith(fragment);
};

export const SplitText = {
	/* `type`, `wordsClass` and `charsClass` are fixed by the effect, so they are
	   not read here — words and characters are always split, with those classes. */
	create(el) {
		const chars = [];
		splitNode(el, chars);
		return { chars };
	},
};
