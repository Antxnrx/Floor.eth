/**
 * Shared furniture for the two public pages: the header, the scan invitation,
 * the photo plate, the footer, and the two hooks that make the page behave
 * (scroll reveal plus in-view gating, and in-page anchor scrolling, which the
 * hash router leaves to whoever owns the page).
 */

import { Fragment, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { footer, invite, site } from "../data/site";
import type { HeroLine } from "../data/site";
import { mountInView } from "../effects/inView";

/**
 * Custom properties are not part of `CSSProperties`, and every stagger on this
 * page is driven by one, so the cast lives here once instead of at each use.
 */
export const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&/<>";

/**
 * Scrambles through random glyphs and resolves to `text` the first time it
 * scrolls into view. Separators are never scrambled and every frame is the same
 * length as the final string, so monospace figures never reflow.
 */
export function Decode({ text }: { text: string }) {
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
          if (frame >= frames) {
            clearInterval(timer);
            setOut(text);
          }
        }, 45);
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, [text]);

  return <span ref={ref}>{out}</span>;
}

/**
 * The headline, split so each character can catch in turn (see .fl-char). The
 * counter runs across the whole headline rather than per line, so the light
 * travels down the block instead of restarting at every line's left edge.
 *
 * Words stay whole inline-blocks so a line can still break between them, and
 * the heading carries the sentence as its accessible name — a hundred one-letter
 * spans are a drawing of the headline, not a reading of it.
 */
export function CatchLines({ lines }: { lines: readonly HeroLine[] }) {
  let i = 0;
  return (
    <>
      {lines.map((line) => (
        <span key={line.text} className={`fl-line${line.soft ? " fl-line--soft" : ""}`}>
          {line.text.split(" ").map((word, w, words) => (
            <Fragment key={`${word}-${w}`}>
              <span className="fl-word">
                {[...word].map((ch) => {
                  const n = i++;
                  return (
                    <span key={n} className="fl-char" style={stagger(n)}>
                      {ch}
                    </span>
                  );
                })}
              </span>
              {w < words.length - 1 ? " " : null}
            </Fragment>
          ))}
        </span>
      ))}
    </>
  );
}

/**
 * Brings the page to life: one reveal observer for every `.fl-rv` under the
 * root, and the in-view gate the CSS loops and the beam pulses hang off.
 *
 * `.fl--js` is added only once there is an observer that will take the reveal
 * back off again, so a visitor with no script, a headless screenshot and a
 * reduced-motion reader all get the finished page rather than a blank one.
 */
export function useSiteShell(title: string) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const undo: (() => void)[] = [];

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = el.querySelectorAll<HTMLElement>(".fl-rv");
    if (targets.length && !reduce && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }),
        { rootMargin: "0px 0px -12% 0px" },
      );
      el.classList.add("fl--js");
      targets.forEach((t) => io.observe(t));
      undo.push(() => {
        io.disconnect();
        el.classList.remove("fl--js");
      });
    }

    const inview = mountInView(el);
    undo.push(() => inview.destroy());

    return () => undo.forEach((f) => f());
  }, []);

  return root;
}

/**
 * The router owns the hash, so scrolling to a section is the page's job. Two
 * forms arrive here: a bare `#why` from a link on the same page, and the
 * `#/docs#spec` of a cross-page link, where everything after the second `#` is
 * the anchor.
 */
export function useAnchorScroll() {
  useEffect(() => {
    const go = () => {
      const raw = location.hash.slice(1);
      const cut = raw.indexOf("#");
      const id = cut === -1 ? (raw.startsWith("/") ? "" : raw) : raw.slice(cut + 1);
      if (!id) return;
      document.getElementById(id)?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    };
    go();
    addEventListener("hashchange", go);
    return () => removeEventListener("hashchange", go);
  }, []);
}

export interface NavLink {
  to: string;
  label: string;
}

export function SiteHead({ links, current }: { links: readonly NavLink[]; current?: string }) {
  return (
    <header className="fl-head">
      <div className="fl-band">
        <div className="fl-rail fl-head__row">
          <a className="fl-head__brand" href="#/">
            {site.name.toLowerCase()}
          </a>
          <nav className="fl-head__nav" aria-label="Site">
            {links.map((l) => (
              <a key={l.to} href={l.to} aria-current={l.to === current ? "true" : undefined}>
                {l.label}
              </a>
            ))}
          </nav>
          <a className="fl-cta fl-cta--solid" href="#/scan">
            Run a scan
            <span className="fl-cta__arrow" aria-hidden="true">
              &rarr;
            </span>
          </a>
        </div>
      </div>
    </header>
  );
}

/**
 * The page's one loud band, and the product's front door. The list beside the
 * heading is every scan the prototype can open, so the CTA is not the only way
 * in — and the two real ones lead.
 */
export function ScanInvite({ scans }: { scans: readonly { key: string; symbol: string; label: string; grade: string; mock: boolean }[] }) {
  return (
    <section className="fl-invite fl-dark fl-band" id="scan">
      <div className="fl-rail">
        <div className="fl-invite__grid">
          <div>
            <h2 className="fl-rv">{invite.head}</h2>
            <p className="fl-rv">{invite.body}</p>
            <div className="fl-invite__actions fl-rv">
              <a className="fl-cta fl-cta--solid" href="#/scan">
                Run a live scan
                <span className="fl-cta__arrow" aria-hidden="true">
                  &rarr;
                </span>
              </a>
              <a className="fl-cta" href="#/verify/rseth-prehack">
                Verify it in your browser
              </a>
            </div>
            <p className="fl-src">{invite.source}</p>
          </div>

          <ul className="fl-invite__list fl-rv">
            {scans.map((s) => (
              <li key={s.key}>
                <a href={`#/asset/${s.key}`}>
                  <b>{s.symbol}</b>
                  <span>
                    {s.grade}
                    {s.mock ? " · mock" : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * The closing visual plate. The photo lives in public/ and is referenced
 * relatively rather than from `/`: the build sets `base: "./"` so the bundle can
 * be served off a Swarm `/bzz/<ref>/` URL, and Vite rewrites `base` into HTML
 * and imported assets but not into a string in a component.
 */
export function SitePlate() {
  return (
    <figure className="fl-plate" id="texture" data-grid-image>
      <picture>
        <source type="image/avif" srcSet="embers-1600.avif 1600w, embers-3200.avif 3200w" sizes="100vw" />
        <source type="image/webp" srcSet="embers-1600.webp 1600w, embers-3200.webp 3200w" sizes="100vw" />
        <img
          src="embers-2400.jpg"
          alt="Long-exposure streaks of yellow light against black."
          width={2400}
          height={1200}
          loading="eager"
          fetchPriority="low"
          decoding="async"
        />
      </picture>
      {/* Over the photo rather than in it; see .fl-plate-mark. */}
      <p className="fl-plate-mark" aria-hidden="true">
        floor
      </p>
    </figure>
  );
}

export function SiteFoot() {
  return (
    <footer className="fl-foot fl-dark fl-band">
      <div className="fl-rail">
        <div className="fl-foot__cols">
          {footer.cols.map((col) =>
            "links" in col ? (
              <nav key={col.head} aria-label={col.head}>
                <p className="fl-foot__head">{col.head}</p>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.to}>
                      <a href={l.to}>{l.label}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : (
              <div key={col.head}>
                <p className="fl-foot__head">{col.head}</p>
                <p className="fl-foot__body">{col.body}</p>
              </div>
            ),
          )}
        </div>

        <div className="fl-foot__end">
          {footer.end.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>

        {/* The sign-off: the hero's pixel face read as large as the page allows. */}
        <p className="fl-signoff" aria-hidden="true">
          floor
        </p>
      </div>
    </footer>
  );
}

/** A content band with its sticky label rail. */
export function Band({
  id,
  label,
  note,
  aside,
  children,
}: {
  id: string;
  label: string;
  note?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="fl-sec fl-band" id={id}>
      <div className="fl-rail">
        <aside className="fl-aside">
          <p className="fl-kicker">{label}</p>
          {note ? <p className="fl-aside-note">{note}</p> : null}
          {aside}
        </aside>
        <div>{children}</div>
      </div>
    </section>
  );
}
