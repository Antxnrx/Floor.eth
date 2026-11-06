import { useEffect, useRef, useState } from "react";

/*
 * Volumetric light shafts behind the hero.
 *
 * Raw WebGL on one fullscreen quad — no three.js. The effect is screen-space
 * scattering, so a scene graph buys nothing and would cost ~200KB gzipped on a
 * page that has to serve off a Swarm /bzz/ URL.
 *
 * Cost control, in order of how much they save:
 *   - the backing store renders at 0.5x CSS size. It is a soft gradient; at
 *     half resolution nobody can tell, and it quarters the fragment count.
 *   - the loop stops entirely when the hero scrolls out of view.
 *   - prefers-reduced-motion draws one static frame and never starts a loop.
 *
 * If WebGL is missing or the context is lost, this renders nothing and the
 * .lp-glow CSS gradient underneath stays visible. The hero is never blank.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uWarm;
uniform vec3  uCool;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

/* Three octaves. A fourth is not visible once the beams blur it. */
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

/*
 * March from the pixel toward the light, accumulating scattering. The beams
 * come from banding the angle around the light: pow() on a sine turns a smooth
 * gradient into separated shafts, and the fbm breaks their regularity so they
 * do not read as a sunburst clipart.
 */
float shafts(vec2 p, vec2 light, float t) {
  const int STEPS = 20;
  vec2 delta = (light - p) / float(STEPS);
  vec2 pos = p;
  float acc = 0.0;

  for (int i = 0; i < STEPS; i++) {
    vec2 d = pos - light;
    float ang = atan(d.y, d.x);

    float beam = 0.5 + 0.5 * sin(ang * 14.0 + t * 0.18);
    beam = pow(beam, 7.0);

    float fog = fbm(pos * 2.2 + vec2(t * 0.035, -t * 0.02));
    float falloff = 1.0 / (1.0 + dot(d, d) * 2.2);

    acc += beam * fog * falloff;
    pos += delta;
  }
  return acc / float(STEPS);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;

  /* Sits where the CSS ember bloom was, so the canvas and the fallback
     gradient agree about where the light is. */
  vec2 warmLight = vec2(0.62, 0.30);
  vec2 coolLight = vec2(-0.70, -0.34);

  float warm = shafts(uv, warmLight, t) * 1.05;
  float cool = shafts(uv, coolLight, t * 0.8 + 11.0) * 0.75;

  /* Core bloom at each light, so the shafts have something to come from. */
  warm += 0.030 / (0.055 + length(uv - warmLight) * 1.7);
  cool += 0.022 / (0.065 + length(uv - coolLight) * 1.9);

  vec3 col = uWarm * warm + uCool * cool;

  /* Reinhard, then a master level. A pixel whose ray runs along a beam crest
     accumulates on every march step, so without this the centre clips to 255
     and swallows the headline. This is background: it has to stay near the
     page's own #08090b. */
  col = col / (1.0 + col);
  col *= 0.34;

  /* Vignette keeps the brightness off the headline, which sits centre-left. */
  col *= 1.0 - 0.45 * smoothstep(0.25, 1.15, length(uv * vec2(0.85, 1.0)));

  /* Dither. Without it, a near-black gradient bands badly on 8-bit displays. */
  col += (hash(gl_FragCoord.xy * 0.37) - 0.5) * 0.012;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

const compile = (gl: WebGLRenderingContext, type: number, src: string) => {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
};

export function VolumetricLight() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    gl.uniform3f(gl.getUniformLocation(prog, "uWarm"), 1.0, 0.33, 0.26);
    gl.uniform3f(gl.getUniformLocation(prog, "uCool"), 0.44, 0.26, 0.92);

    const SCALE = 0.5;
    /*
     * Resizing the backing store is the expensive part and is skipped when the
     * size is unchanged — but the viewport and uRes are re-uploaded every call.
     * They belong to the program, not the canvas, so a remount at the same size
     * (StrictMode, or routing away and back) would otherwise leave a fresh
     * program with uRes = vec2(0), and uv = fragCoord / 0.0 renders pure black.
     */
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };

    const draw = (t: number) => {
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    resize();
    draw(0);
    setLive(true);

    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let running = false;
    const start = Date.now();

    const loop = () => {
      resize();
      draw((Date.now() - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    const run = (on: boolean) => {
      if (on === running) return;
      running = on;
      if (on) raf = requestAnimationFrame(loop);
      else cancelAnimationFrame(raf);
    };

    // Only animate while the hero is actually on screen.
    const io = new IntersectionObserver(([e]) => run(!!e?.isIntersecting && !still.matches), { threshold: 0 });
    io.observe(canvas);

    const ro = new ResizeObserver(() => {
      resize();
      if (!running) draw((Date.now() - start) / 1000);
    });
    ro.observe(canvas);

    const onMotion = () => run(!still.matches);
    still.addEventListener("change", onMotion);

    const onLost = (e: Event) => {
      e.preventDefault();
      run(false);
      setLive(false);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      run(false);
      io.disconnect();
      ro.disconnect();
      still.removeEventListener("change", onMotion);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={ref} className={`lp-vol${live ? " on" : ""}`} aria-hidden="true" />;
}
