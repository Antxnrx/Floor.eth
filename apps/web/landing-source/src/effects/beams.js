import "./beams.css";

/*
 * Connectors for the pipeline diagram: a hairline curve between two marked
 * elements, with a short pulse travelling it from source to target.
 *
 * The edges are declared in markup rather than hard-coded here, so the diagram
 * is readable as HTML and the script never has to know what the nodes mean:
 *
 *   <div data-beams="a>b, b>c" data-beams-narrow="b>c">
 *     <span data-beam-node="a">…</span>
 *
 * Anchors are measured from the laid-out boxes, which is what makes the same
 * markup work at any width — and why there are two edge lists. A fan-in that
 * reads as four sources converging on one node when they sit in a column to
 * its left becomes four wires crossing three boxes when that column stacks
 * above it, so the narrow list drops to the spine and the wide one is used
 * only once there is room for the shape it describes.
 *
 * No dependency. The pulse is a dashed stroke on a `pathLength="1"` path, so
 * its speed is the same on a 90px hop and a 900px run and the whole animation
 * is one CSS keyframe that reduced motion can park.
 */

const NOOP = { destroy() {} };
const SVG_NS = "http://www.w3.org/2000/svg";
// Matches the other effects on this page; long enough to sit out a window drag.
const RESIZE_SETTLE = 140;
/*
 * The query the markup's own layout switches on, so the edge list and the boxes
 * it joins change at the same instant. Measuring the host instead would drift:
 * the host sits inside a label rail, so its width at the breakpoint is a few
 * hundred px short of the viewport's and the two would disagree over a band.
 */
const WIDE = "(min-width: 1024px)";
/*
 * Share of the run between two anchors that each control point is pushed out
 * along the leaving axis. At 0.42 a long horizontal run bows gently and a
 * short one stays near-straight, which is what keeps a fan-in reading as four
 * lines converging rather than four arcs.
 */
const BOW = 0.42;
// Seconds between one wire's pulse and the next, in declaration order. The
// edge list is written in flow order, so this reads as the diagram filling.
const STAGGER = 0.12;

const parse = (spec) =>
	(spec ?? "")
		.split(",")
		.map((pair) => pair.split(">").map((name) => name.trim()))
		.filter(([from, to]) => from && to);

/*
 * Mounts every [data-beams] diagram under `root`. Returns a handle whose
 * destroy() removes the wires and the observers behind them.
 */
export function mountBeams(root) {
	const hosts = [...(root?.querySelectorAll("[data-beams]") ?? [])];
	if (!hosts.length) return NOOP;
	const mounted = hosts.map(mountOne).filter(Boolean);
	return {
		destroy() {
			for (const one of mounted) one.destroy();
		},
	};
}

function mountOne(host) {
	const wide = parse(host.dataset.beams);
	if (!wide.length) return null;
	// Falls back to the full set, so a diagram that stacks without crossing
	// itself needs no second list.
	const narrow = parse(host.dataset.beamsNarrow ?? host.dataset.beams);
	const isWide = window.matchMedia(WIDE);

	const nodes = new Map();
	for (const node of host.querySelectorAll("[data-beam-node]"))
		nodes.set(node.dataset.beamNode, node);

	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("class", "beams__wires");
	svg.setAttribute("aria-hidden", "true");
	// Decoration over a diagram that is already a list of labelled boxes: the
	// wires say "then", and the reading order says it too.
	svg.setAttribute("focusable", "false");
	host.prepend(svg);

	/*
	 * The two anchor points for one edge, in the host's coordinates. The side a
	 * wire leaves from is decided by which axis the two boxes are furthest
	 * apart on, so the same edge list draws left-to-right in a row and
	 * top-to-bottom in a column with nothing in the markup changing.
	 */
	const anchors = (from, to, origin) => {
		const a = from.getBoundingClientRect();
		const b = to.getBoundingClientRect();
		const ax = a.left + a.width / 2 - origin.left;
		const ay = a.top + a.height / 2 - origin.top;
		const bx = b.left + b.width / 2 - origin.left;
		const by = b.top + b.height / 2 - origin.top;
		const dx = bx - ax;
		const dy = by - ay;

		if (Math.abs(dx) >= Math.abs(dy)) {
			const sign = dx >= 0 ? 1 : -1;
			const x1 = ax + (sign * a.width) / 2;
			const x2 = bx - (sign * b.width) / 2;
			const run = (x2 - x1) * BOW;
			return `M${x1},${ay} C${x1 + run},${ay} ${x2 - run},${by} ${x2},${by}`;
		}

		const sign = dy >= 0 ? 1 : -1;
		const y1 = ay + (sign * a.height) / 2;
		const y2 = by - (sign * b.height) / 2;
		const run = (y2 - y1) * BOW;
		return `M${ax},${y1} C${ax},${y1 + run} ${bx},${y2 - run} ${bx},${y2}`;
	};

	const draw = () => {
		const origin = host.getBoundingClientRect();
		if (!origin.width || !origin.height) return;

		svg.textContent = "";
		svg.setAttribute("width", String(Math.round(origin.width)));
		svg.setAttribute("height", String(Math.round(origin.height)));

		const edges = isWide.matches ? wide : narrow;
		edges.forEach(([from, to], index) => {
			const a = nodes.get(from);
			const b = nodes.get(to);
			if (!a || !b) return;
			const d = anchors(a, b, origin);

			const wire = document.createElementNS(SVG_NS, "path");
			wire.setAttribute("class", "beam-wire");
			wire.setAttribute("d", d);
			svg.appendChild(wire);

			const pulse = document.createElementNS(SVG_NS, "path");
			pulse.setAttribute("class", "beam-wire beam-wire--pulse");
			pulse.setAttribute("d", d);
			// Normalises the dash to the path, so a 90px hop and a 900px run
			// carry the same pulse at the same speed.
			pulse.setAttribute("pathLength", "1");
			pulse.style.animationDelay = `${index * STAGGER}s`;
			svg.appendChild(pulse);
		});
	};

	let settle = 0;
	const onResize = () => {
		clearTimeout(settle);
		settle = setTimeout(draw, RESIZE_SETTLE);
	};

	// The host's own box does not change when a node inside it reflows — a font
	// landing, or a label wrapping onto a second line — so every node is
	// watched too.
	const ro = new ResizeObserver(onResize);
	ro.observe(host);
	for (const node of nodes.values()) ro.observe(node);
	// A page zoom can cross the breakpoint without changing any CSS px box, so
	// the observer above would never fire for it.
	isWide.addEventListener("change", draw);

	draw();
	// One more pass once webfonts have settled: the labels the wires terminate
	// on are set in them, and a fallback metric moves every anchor.
	if (document.fonts?.ready) document.fonts.ready.then(draw);

	return {
		destroy() {
			clearTimeout(settle);
			ro.disconnect();
			isWide.removeEventListener("change", draw);
			svg.remove();
		},
	};
}
