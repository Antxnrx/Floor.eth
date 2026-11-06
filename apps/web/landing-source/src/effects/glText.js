/*
 * Vendored from Codrops' "Text Character Animations" demo:
 *   https://github.com/codrops/TextCharacterAnimations  —  js/variations/glText.js
 *   MIT License, Copyright (c) 2009 - 2026 Codrops. Full text in LICENSE-codrops.
 *
 * Two changes from upstream, both forced by this being bundled rather than
 * served as source:
 *
 * 1. The import below. Upstream ran on a page that loaded GSAP and SplitText
 *    as globals from script tags; here they come from a local module (see
 *    gsap-shim.js), so the rest of the file — which calls `gsap.timeline`,
 *    `gsap.set` and `SplitText.create` by those names — reads as upstream does.
 *
 * 2. In WORKER_SOURCE, the handler calls `${computeTexture.name}(job)` rather
 *    than `computeTexture(job)`. The worker's body is built by stringifying
 *    five functions and re-declaring them under `fn.name`; a minifier renames
 *    them (here to El, Jo, Ld, Id, Dd), so the declarations and the stringified
 *    bodies agree with each other but a hard-coded name does not. The worker
 *    then threw `computeTexture is not defined`, which is caught by its own
 *    onerror and quietly moves every texture build onto the main thread.
 */
import {gsap, SplitText} from './gsap-shim.js';

// The WebGL renderer behind variations 16 to 19, Filament to Caustics. The DOM
// text keeps the layout and is what screen readers read.
// While an effect plays, the DOM letters turn transparent and a canvas over
// them shows the same letters, drawn by the variation's fragment shader. The
// last frame is the plain letters; the page text then comes back under it
// and the canvas fades out over it.
//
// The shader reads one texture, as large as the canvas, one texel per pixel:
// R  the letters, as the page draws them
// G  the letters blurred: 1 inside a large solid shape, about 0.5 on its
//    edge, less in thin strokes, fading out a few pixels past them; 0 for a
//    variation that sets no blur
// B  when the nearest letter starts, as a share of uMaxDelay
// A  the nearest letter's random seed, from 1/255 to 1; 0 where no letter is near.
//    Or, for a variation that asks for it (smoothStart, in em), the letters'
//    starts blurred over that distance, so they change smoothly from letter
//    to letter and line to line: from 1/255 to 1 for 0 to uMaxDelay

// A variation can pass its own letter, line, overlap and pad (px or em as '1em', or [x, y]); these are the defaults
const settings = {
    // seconds between the starts of two letters
    letter: 0.035,
    // seconds of pause before each new line; with overlap, seconds between the starts of two lines
    line: 0.25,
    overlap: false,
    // how far the canvas reaches past the text on every side, in px or em, for whatever spreads past the letters
    pad: '0.6em',
    // the canvas never draws at more device pixels per CSS pixel than this
    maxPixelRatio: 2,
    // seconds the last frame is held, so every letter has surely finished
    hold: 0.05,
    // seconds the canvas takes to fade out over the page text when the effect ends
    handover: 0.8,
    // the most WebGL canvases kept running at once; a page may only have about
    // sixteen, so the one used longest ago gives up its WebGL first
    live: 8,
    // milliseconds the page must have been still before WebGL is started ahead of play
    still: 800,
    // the page draws light text on a dark ground thinner than a canvas does;
    // this curve on the letters' edges brings the canvas letters to the page's weight
    edge: 2.4,
};

// The effects whose canvases have WebGL running now, the one used longest ago first
const live = new Set();

// One triangle over the whole canvas, with vUv running down the page like the texture
const VERTEX = `#version 300 es
out vec2 vUv;

void main() {
    vec2 position = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0);
    vUv = vec2(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
    gl_Position = vec4(position, 0.0, 1.0);
}`;

// What every variation's fragment shader starts with; the variation adds main()
const PRELUDE = `#version 300 es
precision highp float;
precision highp sampler2D;

// The letters (see the top of glText.js)
uniform sampler2D uTexture;
// seconds since play
uniform float uTime;
// seconds one letter takes
uniform float uDuration;
// seconds until the last letter starts
uniform float uMaxDelay;
// the canvas in device pixels, and device pixels per CSS pixel
uniform vec2 uResolution;
uniform float uPixelRatio;
// the text's font size, in CSS pixels
uniform float uFontSize;
// the text colour, rgba from 0 to 1
uniform vec4 uColor;

// 0 to 1 from the canvas's top left to its bottom right
in vec2 vUv;
out vec4 fragColor;

// This pixel's texel, as it is
vec4 texel() {
    return texelFetch(uTexture, ivec2(int(gl_FragCoord.x), int(uResolution.y - gl_FragCoord.y)), 0);
}

// The texture this many CSS pixels away from this pixel, filtered
vec4 texelAt(vec2 offset) {
    return texture(uTexture, vUv + offset * uPixelRatio / uResolution);
}

// This pixel, in CSS pixels from the canvas's top left
vec2 pixel() {
    return vUv * uResolution / uPixelRatio;
}

// The texel this many CSS pixels from this pixel, as it is
vec4 texelNearby(vec2 offset) {
    vec2 at = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) + offset * uPixelRatio;
    return texelFetch(uTexture, clamp(ivec2(floor(at)), ivec2(0), ivec2(uResolution) - 1), 0);
}

// From a texel: whether a letter is near, when it starts and its seed
bool hasLetter(vec4 t) {
    return t.a > 0.0;
}

float letterStart(vec4 t) {
    return t.b * uMaxDelay;
}

float letterSeed(vec4 t) {
    return (t.a * 255.0 - 1.0) / 254.0;
}

// With smoothStart: when the letters around this texel start, blended
float nearbyStart(vec4 t) {
    return (t.a * 255.0 - 1.0) / 254.0 * uMaxDelay;
}

// A random number from 0 to 1 for a point
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Smooth random values from 0 to 1, changing about once per unit
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// The text colour at this opacity, premultiplied as the canvas expects
vec4 paint(float alpha) {
    alpha = clamp(alpha, 0.0, 1.0);
    return vec4(uColor.rgb * alpha, alpha);
}
`;

const fract = x => x - Math.floor(x);

// Compiles the shaders into a program; null, with the reason in the console, if they don't compile
const createProgram = (gl, vertexSource, fragmentSource) => {
    const program = gl.createProgram();
    const shaders = [
        [gl.VERTEX_SHADER, vertexSource],
        [gl.FRAGMENT_SHADER, fragmentSource],
    ].map(([type, source]) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        gl.attachShader(program, shader);
        return shader;
    });
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('GLText:', gl.getProgramInfoLog(program), ...shaders.map(shader => gl.getShaderInfoLog(shader)));
        return null;
    }
    return program;
};

// One box blur along every row (step 1) or every column (step width)
const boxBlur = (source, target, length, count, step, lineStep, radius) => {
    const scale = 1 / (2 * radius + 1);
    for (let line = 0; line < count; line++) {
        const start = line * lineStep;
        let sum = 0;
        for (let i = 0; i <= radius && i < length; i++) sum += source[start + i * step];
        for (let i = 0; i < length; i++) {
            target[start + i * step] = sum * scale;
            if (i + radius + 1 < length) sum += source[start + (i + radius + 1) * step];
            if (i - radius >= 0) sum -= source[start + (i - radius) * step];
        }
    }
};

// The values blurred by three box blurs each way, close to a gaussian
// that spreads this many pixels (its standard deviation)
const blur = (values, width, height, spread) => {
    const radius = Math.max(1, Math.round((Math.sqrt(1 + 4 * spread * spread) - 1) / 2));
    const source = Float32Array.from(values);
    const target = new Float32Array(values.length);
    for (let pass = 0; pass < 3; pass++) {
        boxBlur(source, target, width, height, 1, width, radius);
        boxBlur(target, source, height, width, width, 1, radius);
    }
    return source;
};

// For every pixel, the letter it belongs to: the one whose drawn shape is
// nearest, up to reach pixels away; -1 farther out. The letters' own pixels
// belong to the letter whose box holds them, and claim the pixels around
// them one pixel at a time, so ink or toner past a letter's edge goes with
// that letter even where it crosses into a neighbour's box.
const findOwners = (coverage, boxes, width, height, reach) => {
    const count = width * height;
    const inBox = new Int16Array(count).fill(-1);
    boxes.forEach(([x0, y0, x1, y1], index) => {
        for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
            inBox.fill(index, y * width + Math.max(0, x0), y * width + Math.min(width, x1));
        }
    });

    const owners = new Int16Array(count).fill(-1);
    const distance = new Uint16Array(count);
    const queue = new Int32Array(count);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < count; i++) {
        if (coverage[i] >= 0.25 && inBox[i] >= 0) {
            owners[i] = inBox[i];
            queue[tail++] = i;
        }
    }

    const claim = (from, to) => {
        if (owners[to] !== -1) return;
        owners[to] = owners[from];
        distance[to] = distance[from] + 1;
        queue[tail++] = to;
    };
    while (head < tail) {
        const i = queue[head++];
        if (distance[i] >= reach) continue;
        const x = i % width;
        if (x > 0) claim(i, i - 1);
        if (x < width - 1) claim(i, i + 1);
        if (i >= width) claim(i, i - width);
        if (i < count - width) claim(i, i + width);
    }
    return owners;
};

// Every pixel's letter start, blurred across the letters around it, so it
// changes smoothly from one letter to the next and from line to line
const smoothStarts = (owners, delays, width, height, spread) => {
    const count = width * height;
    const weight = new Float32Array(count);
    const start = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        if (owners[i] < 0) continue;
        weight[i] = 1;
        start[i] = delays[owners[i]];
    }
    const weights = blur(weight, width, height, spread);
    const starts = blur(start, width, height, spread);
    for (let i = 0; i < count; i++) starts[i] = weights[i] > 0 ? starts[i] / weights[i] : 0;
    return starts;
};

// The texture from the letters as drawn (see the top of this file). This is
// the slow part of building an effect, so it runs in a worker.
const computeTexture = ({pixels, width, height, boxes, reach, spread, smooth, delays, seeds, maxDelay, edge}) => {
    const count = width * height;
    const coverage = new Float32Array(count);
    for (let i = 0; i < count; i++) coverage[i] = pixels[i * 4 + 3] / 255;
    const owners = findOwners(coverage, boxes, width, height, reach);
    const greens = spread > 0 ? blur(coverage, width, height, spread) : new Float32Array(count);
    const nearby = smooth ? smoothStarts(owners, delays, width, height, smooth) : null;
    const starts = delays.map(delay => (maxDelay ? Math.round((delay / maxDelay) * 255) : 0));
    const data = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
        const owner = owners[i];
        data[i * 4] = Math.round(255 * Math.pow(coverage[i], edge));
        data[i * 4 + 1] = Math.min(255, Math.round(greens[i] * 255));
        if (owner >= 0) {
            data[i * 4 + 2] = starts[owner];
            data[i * 4 + 3] = nearby ? 1 + Math.round((maxDelay ? nearby[i] / maxDelay : 0) * 254) : seeds[owner];
        }
    }
    return data;
};

// One worker works out the textures for every effect, off the page's main
// thread, so building an effect never holds up scrolling. It's made from the
// functions above. Where a worker can't start, the work is done here instead.
const WORKER_SOURCE = `${[boxBlur, blur, findOwners, smoothStarts, computeTexture].map(fn => `const ${fn.name} = ${fn};`).join('\n')}
onmessage = ({data: {id, job}}) => {
    const data = ${computeTexture.name}(job);
    postMessage({id, data}, [data.buffer]);
};`;

let worker;
const jobs = new Map();
let jobCount = 0;

const getWorker = () => {
    if (worker !== undefined) return worker;
    try {
        worker = new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], {type: 'text/javascript'})));
        worker.onmessage = ({data: {id, data}}) => {
            jobs.get(id)?.(data);
            jobs.delete(id);
        };
        // if the worker fails, the jobs waiting end without a texture, and
        // the next ones are worked out here
        worker.onerror = () => {
            worker = null;
            jobs.forEach(resolve => resolve(null));
            jobs.clear();
        };
    } catch (error) {
        worker = null;
    }
    return worker;
};

// The texture for a job, when it's ready
const runJob = job => {
    if (!getWorker()) return Promise.resolve(computeTexture(job));
    return new Promise(resolve => {
        const id = jobCount++;
        jobs.set(id, resolve);
        worker.postMessage({id, job}, [job.pixels.buffer]);
    });
};

// Starting WebGL can hold the page up for a frame or two while the shader
// compiles, so effects start it ahead of play once the page has been still
// for a moment and the browser is idle
let lastScroll = -Infinity;
window.addEventListener('scroll', () => (lastScroll = performance.now()), {passive: true});
const whenStill = callback => {
    const wait = settings.still - (performance.now() - lastScroll);
    if (wait > 0) {
        setTimeout(() => whenStill(callback), wait);
        return;
    }
    if (!window.requestIdleCallback) {
        callback();
        return;
    }
    requestIdleCallback(
        () => {
            if (performance.now() - lastScroll < settings.still) whenStill(callback);
            else callback();
        },
        {timeout: 2000},
    );
};

// Visitors who asked for less motion see the plain text, so WebGL isn't started ahead for them
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// How far below the top of a character's box its baseline sits, read from
// a probe of no size placed on the baseline next to it
const getBaseline = char => {
    const probe = document.createElement('span');
    probe.style.cssText = 'display: inline-block; width: 0; height: 0; vertical-align: baseline;';
    char.before(probe);
    const offset = probe.getBoundingClientRect().top - char.getBoundingClientRect().top;
    probe.remove();
    return offset;
};

export class GLText {
    DOM = {
        // the element holding the lines
        el: null,
        // the canvas over the text that shows the WebGL letters
        canvas: null,
    };
    // the lines, each with its characters
    lines = [];
    // the canvas's opacity as it hands over to the page text at the end
    handover = {canvas: 1};
    // every letter in reading order: when it starts, and its random seed
    letters = [];
    // seconds until the last letter starts, and seconds one letter takes
    maxDelay = 0;
    duration = 0;
    // the variation's fragment shader, and how soft its blurred letters are in em
    fragment = '';
    blur = 0;
    // em the letters' starts are blurred over for A, or 0 to keep each letter's seed there
    smoothStart = 0;
    // seconds between letters and between lines, whether lines overlap, and the canvas's pad, [x, y], in px or em
    timing = null;
    pad = null;
    // stays null where WebGL2 isn't available
    gl = null;
    uniforms = {};
    maxTextureSize = null;
    // the texture as last worked out, and the layout of the one on its way
    built = null;
    building = null;
    // whether a play waits for the texture
    isWaiting = false;
    // the text colour's alpha, for the handover
    textAlpha = 1;
    // the 2D canvas the letters are drawn in for the texture
    context = null;
    // seconds since play
    clock = {time: 0};
    timeline = null;

    constructor(
        el,
        {
            fragment,
            duration,
            blur = 0,
            letter = settings.letter,
            line = settings.line,
            overlap = settings.overlap,
            pad = settings.pad,
            smoothStart = 0,
        },
    ) {
        this.DOM.el = el;
        this.fragment = fragment;
        this.duration = duration;
        this.blur = blur;
        this.smoothStart = smoothStart;
        this.timing = {letter, line, overlap};
        this.pad = Array.isArray(pad) ? pad : [pad, pad];
        this.split();

        this.DOM.canvas = this.createCanvas();
        el.append(this.DOM.canvas);
        this.context = document.createElement('canvas').getContext('2d', {willReadFrequently: true});

        // The letters are drawn now and their texture worked out in the worker,
        // unless motion is reduced and they never play; WebGL starts once it's
        // ready (see onBuilt)
        if (!reducedMotion.matches) this.build();
        this.reset();
    }

    // A fresh canvas for the WebGL letters. If the GPU drops it mid-play, the
    // plain text shows, and the next play starts on a new canvas.
    createCanvas() {
        const canvas = document.createElement('canvas');
        canvas.className = 'gl-text';
        canvas.setAttribute('aria-hidden', 'true');
        canvas.addEventListener('webglcontextlost', ev => {
            ev.preventDefault();
            if (canvas !== this.DOM.canvas) return;
            live.delete(this);
            this.gl = null;
            if (this.timeline?.isActive()) this.show();
        });
        return canvas;
    }

    // WebGL for this effect: kept if it still has it, otherwise started on a
    // new canvas from the letters already drawn. Returns whether it has it.
    acquire() {
        if (this.gl && !this.gl.isContextLost()) {
            live.delete(this);
            live.add(this);
            return true;
        }
        const canvas = this.createCanvas();
        this.DOM.canvas.replaceWith(canvas);
        this.DOM.canvas = canvas;
        this.setUp();
        if (!this.gl) return false;
        this.maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
        this.draw();
        live.add(this);

        // too many running: the one used longest ago, and not playing, lets go
        for (const other of live) {
            if (live.size <= settings.live) break;
            if (other !== this && !other.timeline?.isActive()) other.release();
        }
        return true;
    }

    // Gives this effect's WebGL back to the browser
    release() {
        live.delete(this);
        this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
        this.gl = null;
    }

    // Splits the lines into characters and gives each one its start and seed
    split() {
        const {letter, line, overlap} = this.timing;
        let time = 0;
        let lineStart = 0;
        this.DOM.el.querySelectorAll('[data-line]').forEach((lineEl, index) => {
            const chars = SplitText.create(lineEl, {
                type: 'words, chars',
                wordsClass: 'word',
                charsClass: 'char',
            }).chars;
            if (index > 0) time = overlap ? lineStart + line : time + line;
            lineStart = time;
            chars.forEach(() => {
                this.letters.push({delay: time, seed: Math.random()});
                time += letter;
            });
            this.lines.push({el: lineEl, chars});
            lineEl.classList.add('is-ready');
        });
        this.maxDelay = this.letters.reduce((max, {delay}) => Math.max(max, delay), 0);
    }

    // Starts WebGL on the canvas, with the variation's shader
    setUp() {
        this.gl = null;
        const gl = this.DOM.canvas.getContext('webgl2', {
            premultipliedAlpha: true,
            antialias: false,
            depth: false,
            stencil: false,
        });
        if (!gl || gl.isContextLost()) return;

        const program = createProgram(gl, VERTEX, PRELUDE + this.fragment);
        if (!program) return;
        gl.useProgram(program);
        gl.bindVertexArray(gl.createVertexArray());

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        ['uTexture', 'uTime', 'uDuration', 'uMaxDelay', 'uResolution', 'uPixelRatio', 'uFontSize', 'uColor'].forEach(
            name => {
                this.uniforms[name] = gl.getUniformLocation(program, name);
            },
        );
        gl.uniform1i(this.uniforms.uTexture, 0);
        gl.uniform1f(this.uniforms.uDuration, this.duration);
        gl.uniform1f(this.uniforms.uMaxDelay, this.maxDelay);
        this.gl = gl;
    }

    // Fits the canvas to the text, draws the letters where the page draws
    // them, and sends them to the shader with their blur, starts and seeds
    draw() {
        const gl = this.gl;
        if (!gl) return;
        const {canvas} = this.DOM;
        const {data, width, height, left, top, pixelRatio, fontSize, color} = this.build();
        if (!data) return;
        canvas.width = width;
        canvas.height = height;
        Object.assign(canvas.style, {
            left: `${left}px`,
            top: `${top}px`,
            width: `${width / pixelRatio}px`,
            height: `${height / pixelRatio}px`,
        });
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.viewport(0, 0, width, height);
        gl.uniform2f(this.uniforms.uResolution, width, height);
        gl.uniform1f(this.uniforms.uPixelRatio, pixelRatio);
        gl.uniform1f(this.uniforms.uFontSize, fontSize);
        gl.uniform4f(this.uniforms.uColor, color[0] / 255, color[1] / 255, color[2] / 255, color[3] / 255);
        this.textAlpha = color[3] / 255;
    }

    // Draws the letters in a 2D canvas where the page draws them, and works
    // out their blur, starts and seeds. The result is kept until the text's
    // size or place changes; the colour is read fresh every time.
    build() {
        const el = this.DOM.el;
        const ctx = this.context;
        const style = getComputedStyle(el);
        // the pad around the text, in px, or in em of the text's size so it grows with the text
        const em = parseFloat(style.fontSize);
        const [padX, padY] = this.pad.map(value => (typeof value === 'string' ? parseFloat(value) * em : value));
        const box = el.getBoundingClientRect();
        const maxSize = this.maxTextureSize ?? 4096;
        const pixelRatio = Math.min(
            window.devicePixelRatio || 1,
            settings.maxPixelRatio,
            maxSize / (box.width + 2 * padX + 2),
            maxSize / (box.height + 2 * padY + 2),
        );

        // The pad around the text, the left edge on a whole device pixel so the letters stay sharp
        const left = -padX - fract((box.left - padX) * pixelRatio) / pixelRatio;
        const top = -padY;
        const width = Math.ceil((box.width + padX - left) * pixelRatio);
        const height = Math.ceil((box.height + 2 * padY) * pixelRatio);
        if (width < 1 || height < 1) return {};

        // The text colour, as the page paints it
        ctx.canvas.width = 1;
        ctx.canvas.height = 1;
        ctx.fillStyle = style.color;
        ctx.fillRect(0, 0, 1, 1);
        const color = ctx.getImageData(0, 0, 1, 1).data;

        // the letters as drawn last time, if the text hasn't changed size or
        // place; nothing yet while they're being worked out
        const fonts = this.lines.map(line => getComputedStyle(line.el).font).join();
        const key = [width, height, left, top, pixelRatio, fonts].join();
        if (this.built?.key === key) return {...this.built, color};
        if (this.building === key) return {};

        // Each character in the line's font, at its own place on the line's baseline
        ctx.canvas.width = width;
        ctx.canvas.height = height;
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, -left * pixelRatio, -top * pixelRatio);
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        // each letter's box, in canvas pixels
        const boxes = [];
        this.lines.forEach(line => {
            const style = getComputedStyle(line.el);
            ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const baseline = getBaseline(line.chars[0]);
            line.chars.forEach(char => {
                const rect = char.getBoundingClientRect();
                const x = rect.left - box.left;
                const y = rect.top - box.top;
                ctx.fillText(char.textContent, x, y + baseline);
                boxes.push([
                    Math.floor((x - left) * pixelRatio),
                    Math.floor((y - top) * pixelRatio),
                    Math.ceil((x + rect.width - left) * pixelRatio),
                    Math.ceil((y + rect.height - top) * pixelRatio),
                ]);
            });
        });

        // The texture is worked out in the worker
        this.building = key;
        runJob({
            pixels: ctx.getImageData(0, 0, width, height).data,
            width,
            height,
            boxes,
            reach: Math.round(Math.max(padX, padY) * pixelRatio),
            spread: this.blur * em * pixelRatio,
            smooth: this.smoothStart * em * pixelRatio,
            delays: this.letters.map(letter => letter.delay),
            seeds: this.letters.map(letter => 1 + Math.floor(letter.seed * 254)),
            maxDelay: this.maxDelay,
            edge: settings.edge,
        }).then(data => {
            // a newer layout's texture is on its way instead
            if (this.building !== key) return;
            this.building = null;
            // no texture: the plain text stays
            if (!data) {
                if (this.isWaiting) this.show();
                return;
            }
            this.built = {key, data, width, height, left, top, pixelRatio, fontSize: em};
            this.onBuilt();
        });
        return {};
    }

    // The texture is ready: drawn if WebGL is running, played if a play was
    // waiting for it, and otherwise WebGL is started ahead in a still moment
    onBuilt() {
        if (this.gl) {
            this.draw();
            if (this.timeline?.isActive()) this.render();
        }
        if (this.isWaiting) {
            this.play();
            return;
        }
        if (!this.gl && !reducedMotion.matches) {
            whenStill(() => {
                if (!this.gl && this.built) this.acquire();
            });
        }
    }

    // Draws the letters as they are at the clock's time
    render() {
        this.gl.uniform1f(this.uniforms.uTime, this.clock.time);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    }

    play() {
        this.reset();
        // the texture is still being worked out: play as soon as it's ready
        if (!this.build().data) {
            this.isWaiting = true;
            return;
        }
        if (!this.acquire()) {
            this.show();
            return;
        }
        const total = this.maxDelay + this.duration + settings.hold;
        this.DOM.canvas.classList.add('is-visible');
        this.render();
        this.timeline = gsap
            .timeline({onComplete: () => this.show()})
            .to(this.clock, {
                time: total,
                duration: total,
                ease: 'none',
                onUpdate: () => this.render(),
            })
            // The page text comes back under the last frame as the canvas fades
            // out over it, each at the rate that keeps the two together exactly
            // as bright as the text, so nothing flashes or dips
            .call(() => {
                gsap.set(this.lineEls(), {opacity: 0});
                this.DOM.el.classList.remove('is-masked');
            })
            .to(this.handover, {
                canvas: 0,
                duration: settings.handover,
                ease: 'power1.inOut',
                onUpdate: () => this.blend(),
            });
    }

    // The lines' elements, for the page text under the canvas
    lineEls() {
        return this.lines.map(line => line.el);
    }

    // With the canvas at opacity c over page text at opacity d, both showing the
    // same letters at alpha a, together they show a·c + a·d·(1 − a·c); keeping
    // that at a means d = (1 − c) / (1 − a·c)
    blend() {
        const c = this.handover.canvas;
        const a = this.textAlpha ?? 1;
        this.DOM.canvas.style.opacity = c;
        gsap.set(this.lineEls(), {opacity: a * c >= 1 ? 1 : (1 - c) / (1 - a * c)});
    }

    // Nothing visible: the DOM letters transparent, the canvas hidden
    reset() {
        this.show();
        this.clock.time = 0;
        this.handover.canvas = 1;
        this.DOM.el.classList.add('is-masked');
    }

    // The plain DOM text, at once: for reduced motion, and when an effect ends
    show() {
        this.timeline?.kill();
        this.isWaiting = false;
        this.DOM.el.classList.remove('is-masked');
        this.DOM.canvas.classList.remove('is-visible');
        gsap.set(this.DOM.canvas, {clearProps: 'opacity'});
        gsap.set(this.lineEls(), {clearProps: 'opacity'});
    }

    // After a resize: the canvas and its texture again, for the new layout
    refresh() {
        this.draw();
        if (this.timeline?.isActive()) this.render();
    }
}
