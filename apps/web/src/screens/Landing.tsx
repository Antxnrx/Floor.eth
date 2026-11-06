import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { built, figures, gap, nav, pipeline, replay, routeTicker, site, stack, verdict, verify } from "../data/landing";
import "../landing.css";

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&/<>";

/**
 * Scrambles through random glyphs and resolves to `text` the first time it
 * scrolls into view. Separators are never scrambled and every frame is the
 * same length as the final string, so monospace figures never reflow.
 */
function Decode({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [out, setOut] = useState(text);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setInterval>;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        const frames = 15;
        let frame = 0;
        timer = setInterval(() => {
          frame += 1;
          const shown = Math.floor((frame / frames) * text.length);
          setOut(
            [...text]
              .map((c, i) => (i < shown || !/[A-Za-z0-9]/.test(c) ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
              .join(""),
          );
          if (frame >= frames) { clearInterval(timer); setOut(text); }
        }, 45);
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => { io.disconnect(); clearInterval(timer); };
  }, [text]);

  return <span ref={ref}>{out}</span>;
}

/** The router owns the hash, so scrolling to a section anchor is ours to do. */
const useAnchorScroll = () => {
  useEffect(() => {
    const go = () => {
      const id = location.hash.slice(1);
      if (!id || id.startsWith("/")) return;
      document.getElementById(id)?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    };
    go();
    addEventListener("hashchange", go);
    return () => removeEventListener("hashchange", go);
  }, []);
};

/** Reveals children once they cross into view. One observer for the whole page. */
const useReveal = () => {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const targets = root.current?.querySelectorAll(".rv");
    if (!targets?.length) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      targets.forEach((t) => t.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -12% 0px" },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);
  return root;
};

const Band = ({ id, n, label, children }: { id?: string; n: string; label: string; children: ReactNode }) => (
  <section className="lp-band" id={id}>
    <div className="lp-wrap">
      <p className="lp-eyebrow rv">
        {n} · {label}
      </p>
      {children}
    </div>
  </section>
);

export function Landing() {
  const root = useReveal();
  useAnchorScroll();

  return (
    <div className="lp" ref={root}>
      <header className="lp-head">
        <div className="lp-wrap">
          <a className="lp-brand" href="#/">
            FLOOR
          </a>
          <nav>
            {nav.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <a className="lp-cta lp-cta-solid" href="#/scan">
            Live scan →
          </a>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-glow" />
        <div className="lp-wrap">
          <div>
            <p className="lp-eyebrow rv">Collateral security rating</p>
            <h1 className="lp-h1 rv">
              {site.line.split(", with")[0]}, <em>with bounded enforcement.</em>
            </h1>
            <p className="lp-quote rv">{site.pitch}</p>
            <div className="lp-actions rv">
              <a className="lp-cta lp-cta-solid" href="#replay">
                See the replay
              </a>
              <a className="lp-cta" href={site.repo} target="_blank" rel="noreferrer">
                Read the repo
              </a>
            </div>
          </div>

          <div className="lp-verdict rv">
            <div className="lp-verdict-top">
              <b>{verdict.asset}</b>
              <span>
                block {verdict.block} · {verdict.when}
              </span>
            </div>
            <div className="lp-verdict-body">
              <div className="lp-grade">
                <i />
                {verdict.grade}
              </div>
              <p className="lp-capped">
                Capped because <b>{verdict.capped}</b>.
              </p>
              <ul>
                {verdict.also.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-figures">
        <div className="lp-wrap">
          {figures.map((f) => (
            <div className="lp-fig rv" key={f.value}>
              <b><Decode text={f.value} /></b>
              <p>{f.label}</p>
              <span className="lp-src">{f.source}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-marquee" aria-label="rsETH receive routes at block 24,908,284">
        <div className="lp-track">
          {[0, 1].map((copy) =>
            routeTicker.map((r) => (
              <span className="lp-tick" key={`${copy}-${r.chain}`} aria-hidden={copy === 1}>
                <b>{r.chain}</b>
                <span className={r.verifiers === 1 ? "lp-one" : "lp-many"}>
                  {r.verifiers === null ? "unresolved" : `${r.verifiers} verifier${r.verifiers === 1 ? "" : "s"}`}
                </span>
              </span>
            )),
          )}
        </div>
      </section>

      <Band id="gap" n="01" label="Why nobody caught it">
        <h2 className="lp-h2 rv">The config was public the whole time.</h2>
        <p className="lp-sub rv">
          It was flagged on Aave's own governance forum fifteen months out, and again twelve days out. The gap was never
          detection. It was that nothing graded the standing state, and nothing acted on the grade.
        </p>
        <div className="lp-gap">
          {gap.map((g) => (
            <div className="rv" key={g.head}>
              <h3>{g.head}</h3>
              <p>{g.body}</p>
              <span className="lp-src">{g.source}</span>
            </div>
          ))}
        </div>
      </Band>

      <Band id="replay" n="02" label="Proof">
        <h2 className="lp-h2 rv">{replay.head}</h2>
        <p className="lp-sub rv">{replay.sub}</p>
        <div className="lp-replay">
          <div className="lp-side rv">
            <h3>{replay.without.label}</h3>
            <p className="lp-outcome">{replay.without.outcome}</p>
            <p className="lp-note">{replay.without.body}</p>
          </div>
          <div className="lp-side lp-side-on rv">
            <h3>{replay.with.label}</h3>
            <p className="lp-outcome">{replay.with.outcome}</p>
            <p className="lp-note">{replay.with.body}</p>
          </div>
        </div>
        <p className="lp-src rv" style={{ marginTop: 16 }}>
          {replay.source}
        </p>
      </Band>

      <Band id="pipeline" n="03" label="How it runs">
        <h2 className="lp-h2 rv">Six steps, each one reproducible by someone who distrusts us.</h2>
        <div className="lp-pipe">
          {pipeline.map((p) => (
            <div className="rv" key={p.step}>
              <h3>{p.step}</h3>
              <p>{p.body}</p>
              <span className="lp-src">{p.tag}</span>
            </div>
          ))}
        </div>
      </Band>

      <Band id="built" n="04" label="What exists">
        <h2 className="lp-h2 rv">Shipped, with the tests that back it.</h2>
        <table className="lp-table rv">
          <thead>
            <tr>
              <th>Package</th>
              <th>What it does</th>
              <th>Tests</th>
            </tr>
          </thead>
          <tbody>
            {built.map((b) => (
              <tr key={b.path}>
                <td>{b.path}</td>
                <td>{b.what}</td>
                <td>{b.tests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Band>

      <section className="lp-band lp-verify" id="verify">
        <div className="lp-wrap">
          <div>
            <p className="lp-eyebrow rv">05 · Trust</p>
            <h2 className="lp-h2 rv">{verify.head}</h2>
            <p className="lp-sub rv">{verify.body}</p>
            <div className="lp-actions rv">
              <a className="lp-cta lp-cta-solid" href={`#${verify.cta.to}`}>
                {verify.cta.label}
              </a>
            </div>
          </div>
          <div className="lp-meter rv">
            <div className="lp-meter-top">
              <b><Decode text="624 / 624" /></b>
              <span>reads reproduced</span>
            </div>
            <div className="lp-bar">
              <i />
            </div>
            <ul className="lp-steps">
              <li>Bundle pulled from Swarm</li>
              <li>Hash matches the Arkiv record</li>
              <li>Every read replayed on an independent RPC</li>
              <li>Rules re-run, same grade</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <p className="lp-eyebrow rv">Built on</p>
          <div className="lp-stack">
            {stack.map((s) => (
              <div className="rv" key={s.name}>
                <b>{s.name}</b>
                <span>{s.role}</span>
              </div>
            ))}
          </div>
          <div className="lp-foot-end">
            <span>Floor · ETHGlobal Mumbai 2026</span>
            <a href={site.repo} target="_blank" rel="noreferrer">
              Repository
            </a>
            <a href="#/scan">Live scan</a>
            <a href="#/rules">Rule pack</a>
            <span className="lp-spacer">Every figure on this page is reproducible from the repo.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
