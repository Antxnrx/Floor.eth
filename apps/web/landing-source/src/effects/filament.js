/*
 * Vendored verbatim from Codrops' "Text Character Animations" demo:
 *   https://github.com/codrops/TextCharacterAnimations  —  js/variations/filament.js
 *   MIT License, Copyright (c) 2009 - 2026 Codrops. Full text in LICENSE-codrops.
 *
 * This is variation 16, the one the demo page labels "LAMPS ON".
 */

// 16 Filament. The letters catch one after another in reading order, each
// line starting a moment after the one before, like lamps along a wall. A
// letter warms up like a filament: a dim, deep red glow on its strokes,
// heating through orange to a warm yellow-white, with a soft halo around it
// that's brightest when the letter is hottest. Then it cools to the plain
// text colour and the halo fades. Some letters flicker as they catch, two or
// three quick dips in brightness. Drawn in WebGL over the DOM text (see
// glText.js).

import {GLText} from './glText.js';

const settings = {
    // seconds each letter takes to warm up and cool down
    duration: 1,
    // seconds between two letters catching, and between the starts of two lines
    letter: 0.04,
    line: 0.3,
    // how soft the letters the halo is made from are, in em
    blur: 0.12,
    // the halo spreads that blur over a disc this wide across, in em
    haloRadius: 0.32,
    // places on the disc the halo is gathered from
    haloTaps: 24,
    // how far the canvas reaches past the text, in em, room for the halo to fade out
    pad: '1em',
};

// The halo's taps, spread evenly over the disc on a sunflower spiral, in em
const taps = Array.from({length: settings.haloTaps}, (_, i) => {
    const k = i + 0.5;
    const radius = Math.sqrt(k / settings.haloTaps) * settings.haloRadius;
    const angle = k * 2.39996;
    return `vec2(${(Math.cos(angle) * radius).toFixed(4)}, ${(Math.sin(angle) * radius).toFixed(4)})`;
});

const fragment = `
// The halo's taps, in em from this pixel, and its strength at the hottest
const int HALO_TAPS = ${settings.haloTaps};
const vec2 TAPS[HALO_TAPS] = vec2[HALO_TAPS](${taps.join(', ')});
const float HALO = 1.2;
// Shares of a letter's time: hottest at HOT, cooling from COOL to the end
const float HOT = 0.45;
const float COOL = 0.5;
// Letters with a seed below this flicker as they catch
const float FLICKERING = 0.4;

// How hot a letter is, 0 cold to 1 hottest, and how far it has cooled back
// to the text colour, at its own time t from 0 to 1
float heatAt(float t) {
    return smoothstep(0.0, HOT, t);
}

float coolAt(float t) {
    return smoothstep(COOL, 1.0, t);
}

// The filament's light as it heats: dark red, deep red, orange, warm white
vec3 glow(float heat) {
    return vec3(
        smoothstep(0.0, 0.4, heat),
        0.88 * smoothstep(0.3, 0.95, heat),
        0.72 * smoothstep(0.65, 1.0, heat)
    );
}

// Two or three quick dips in brightness in the first third, for the letters that flicker
float flicker(float t, float seed) {
    if ( seed >= FLICKERING ) return 1.0;
    // 0 to 1 among the flickering letters, to vary their dips
    float s = seed / FLICKERING;
    float dips = s < 0.5 ? 2.0 : 3.0;
    float bright = 1.0;
    for (int i = 0; i < 3; i++) {
        float k = float(i);
        if ( k >= dips ) break;
        float at = 0.07 + 0.085 * k + 0.03 * fract(s * 7.0 + k * 0.37);
        float depth = mix(0.55, 0.85, fract(s * 13.0 + k * 0.61));
        bright -= depth * (1.0 - smoothstep(0.0, 0.022, abs(t - at)));
    }
    return max(bright, 0.0);
}

// Light as premultiplied colour: as opaque as its brightest channel
vec4 light(vec3 rgb) {
    return vec4(rgb, max(rgb.r, max(rgb.g, rgb.b)));
}

void main() {
    // The halo: the blurred letters around this pixel, each glowing at its own
    // letter's time, so neighbouring letters and lines blend into one glow
    vec3 halo = vec3(0.0);
    for (int i = 0; i < HALO_TAPS; i++) {
        vec4 tap = texelNearby(TAPS[i] * uFontSize);
        if ( !hasLetter(tap) ) continue;
        float t = (uTime - letterStart(tap)) / uDuration;
        if ( t < 0.0 || t >= 1.0 ) continue;
        float heat = heatAt(t);
        halo += glow(heat) * tap.g * heat * heat * (1.0 - coolAt(t)) * flicker(t, letterSeed(tap));
    }
    halo = min(halo * HALO / float(HALO_TAPS), 1.0);

    // The letter itself: glowing as it heats, then cooling into the text colour
    vec4 here = texel();
    vec4 letter = vec4(0.0);
    if ( hasLetter(here) ) {
        float t = (uTime - letterStart(here)) / uDuration;
        vec4 cold = paint(uColor.a);
        if ( t >= 1.0 ) {
            letter = cold * here.r;
        } else if ( t >= 0.0 ) {
            vec4 hot = light(glow(heatAt(t)) * flicker(t, letterSeed(here)));
            letter = mix(hot, cold, coolAt(t)) * here.r;
        }
    }

    // The halo shows around the letter, wherever the letter doesn't cover it
    fragColor = letter + light(halo) * (1.0 - letter.a);
}
`;

export class Filament extends GLText {
    constructor(el) {
        // marks the element, so this effect's styles apply to it and nothing else
        el.dataset.effect = 'filament';
        super(el, {
            fragment,
            duration: settings.duration,
            blur: settings.blur,
            letter: settings.letter,
            line: settings.line,
            overlap: true,
            pad: settings.pad,
        });
    }
}
