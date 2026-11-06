/**
 * The docs page: the same system as the landing with the argument put back.
 *
 * The split between the two pages is deliberate. The landing states the result
 * and opens a scan; everything that has to be *read* — the incident, the rule
 * pack, the measurement, the limits — lives here, where a reader who came for
 * the argument can take it at its own length. There is no canvas on this page
 * and nothing animates except the reveal: it is a document.
 */

import {
  Band,
  ScanInvite,
  SiteFoot,
  SiteHead,
  useAnchorScroll,
  useSiteShell,
} from "../components/siteChrome";
import {
  audiences,
  buildNote,
  built,
  definition,
  diagram,
  docsCopy,
  docsHeadNav,
  docsNav,
  grades,
  limits,
  measured,
  openScans,
  reference,
  replay,
  runtime,
  site,
  spec,
  stack,
  stageProse,
  timeline,
  why,
  whyNow,
} from "../data/site";
import "../site.css";

/** The router owns the hash, so an in-page anchor has to carry the route. */
const anchor = (id: string) => `#/docs#${id}`;

/** Four cells of headroom under a grade name. See .fl-meter. */
function Meter({ cells }: { cells: readonly ("on" | "off" | "void")[] }) {
  return (
    <div className="fl-meter" aria-hidden="true">
      {cells.map((c, i) => (
        <i key={i} className={c === "on" ? "" : `is-${c}`} />
      ))}
    </div>
  );
}

export function Docs() {
  const root = useSiteShell(`Documentation — ${site.name}`);
  useAnchorScroll();

  return (
    <div className="fl" ref={root}>
      <SiteHead links={docsHeadNav} current="#/docs" />

      <section className="fl-docs-top fl-band">
        <div className="fl-rail">
          <p className="fl-kicker">Documentation</p>
          <h1>{docsCopy.top.head}</h1>
          <p className="fl-lede">{docsCopy.top.lede}</p>
        </div>
      </section>

      {/* ---------- what Floor is ---------- */}

      <Band
        id="definition"
        label="Contents"
        aside={
          <nav aria-label="Contents">
            <ul className="fl-toc">
              {docsNav.map((s) => (
                <li key={s.id}>
                  <a href={anchor(s.id)}>{s.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        }
      >
        <p className="fl-statement fl-rv">
          {definition.lead}
          <span>{definition.rest}</span>
        </p>

        <dl className="fl-claims">
          {definition.claims.map((c) => (
            <div className="fl-rv" key={c.term}>
              <dt>{c.term}</dt>
              <dd>{c.body}</dd>
            </div>
          ))}
        </dl>

        <p className="fl-note fl-rv">
          {site.pitch} <span className="fl-src">docs/01-overview.md</span>
        </p>
      </Band>

      {/* ---------- why it exists ---------- */}

      <Band id="why" label={docsNav[1].label}>
        <h2 className="fl-h2 fl-rv">{why.head}</h2>

        <div className="fl-two">
          {why.columns.map((col) => (
            <div className="fl-rv" key={col.head}>
              <h3 className="fl-h3">{col.head}</h3>
              {col.body.map((p) => (
                <p className="fl-body" key={p.slice(0, 24)}>
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>

        <div className="fl-headrow fl-next fl-rv">
          <h3>{timeline.head}</h3>
          <p className="fl-src">{timeline.scope}</p>
        </div>

        <div className="fl-rule" data-inview aria-hidden="true">
          <span className="fl-rule__pulse" />
        </div>

        <ol className="fl-moments">
          {timeline.moments.map((m) => (
            <li className={`fl-moment fl-rv${"breaks" in m ? " fl-moment--break" : ""}`} key={m.when}>
              <p className="fl-moment__when">{m.when}</p>
              <p className="fl-moment__what">{m.what}</p>
            </li>
          ))}
        </ol>

        <p className="fl-note fl-rv">
          Nothing in that span changed, which is why nothing watching for change had anything to report.{" "}
          <span className="fl-src">{timeline.source}</span>
        </p>

        {/*
          The one number on the site that came from an incident rather than from
          the product, so it is set apart and its scope is in the same figure.
        */}
        <figure className="fl-replay fl-rv">
          <p className="fl-kicker">{replay.caption}</p>
          <p className="fl-replay__claim">
            {replay.claim} <strong>{replay.figure}</strong>
          </p>
          <figcaption>
            <p className="fl-body">{replay.why}</p>
            <p className="fl-note">{replay.scope}</p>
            <p className="fl-note">
              <span className="fl-src">{replay.source}</span>
            </p>
          </figcaption>
        </figure>

        <div className="fl-headrow fl-next fl-rv">
          <h3>{whyNow.head}</h3>
        </div>

        <dl className="fl-quad">
          {whyNow.items.map((it) => (
            <div className="fl-rv" key={it.term}>
              <dt>{it.term}</dt>
              <dd>{it.body}</dd>
            </div>
          ))}
        </dl>

        <p className="fl-body fl-close fl-rv">
          {whyNow.close}
        </p>
      </Band>

      {/* ---------- how it works ---------- */}

      <Band id="how" label={docsNav[2].label}>
        <h2 className="fl-h2 fl-rv">{diagram.head}</h2>
        <p className="fl-lede fl-rv">{diagram.lede}</p>

        <dl className="fl-quad">
          {stageProse.map((s) => (
            <div className="fl-rv" key={s.term}>
              <dt>{s.term}</dt>
              <dd>{s.body}</dd>
            </div>
          ))}
        </dl>

        <div className="fl-pair">
          {audiences.map((a) => (
            <div className="fl-rv" key={a.head}>
              <h3 className="fl-h3">{a.head}</h3>
              <p className="fl-body">{a.body}</p>
            </div>
          ))}
        </div>

        <p className="fl-build fl-rv">{buildNote}</p>
      </Band>

      {/* ---------- what runs ---------- */}

      <Band id="runtime" label={docsNav[3].label}>
        <h2 className="fl-h2 fl-rv">{docsCopy.runtime.head}</h2>
        <p className="fl-lede fl-rv">{docsCopy.runtime.lede}</p>

        <dl className="fl-rows">
          {runtime.map((r) => (
            <div className="fl-rv" key={r.step}>
              <dt>{r.step}</dt>
              <dd>
                {r.body} <span className="fl-src">{r.tag}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="fl-headrow fl-next fl-rv">
          <h3>{docsCopy.runtime.built}</h3>
          <p className="fl-src">{docsCopy.runtime.builtNote}</p>
        </div>

        <dl className="fl-rows">
          {built.map((b) => (
            <div className="fl-rv" key={b.path}>
              <dt className="fl-src">{b.path}</dt>
              <dd>
                {b.what}
                {/* Some counts are bare numbers, so the cell has to say what it counts. */}
                <span className="fl-src">tests · {b.tests}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="fl-headrow fl-next fl-rv">
          <h3>{docsCopy.runtime.stack}</h3>
        </div>

        <dl className="fl-quad">
          {stack.map((s) => (
            <div className="fl-rv" key={s.name}>
              <dt>{s.name}</dt>
              <dd>{s.role}</dd>
            </div>
          ))}
        </dl>
      </Band>

      {/* ---------- what we check ---------- */}

      <Band id="spec" label={docsNav[4].label}>
        <h2 className="fl-h2 fl-rv">{spec.head}</h2>
        <p className="fl-lede fl-rv">{spec.lede}</p>

        <dl className="fl-rows">
          {spec.rows.map((r) => (
            <div className="fl-rv" key={r.term}>
              <dt>{r.term}</dt>
              <dd>{r.body}</dd>
            </div>
          ))}
        </dl>

        {/* The four grades as headroom rather than as a colour key: the name and
            the sentence carry the meaning, the cells carry how much is left. */}
        <div className="fl-quad">
          {grades.map((g) => (
            <div className="fl-rv" key={g.name}>
              <Meter cells={g.cells} />
              <p className={`fl-grade-name fl-grade-${g.name.toLowerCase()}`}>{g.name}</p>
              <p className="fl-body">{g.body}</p>
            </div>
          ))}
        </div>

        <div className="fl-headrow fl-next fl-rv">
          <h3>{measured.head}</h3>
          <p className="fl-src">{measured.source}</p>
        </div>

        <div className="fl-measured">
          <div className="fl-rv">
            {measured.body.map((p) => (
              <p className="fl-body" key={p.slice(0, 24)}>
                {p}
              </p>
            ))}
            <p className="fl-note">{measured.scope}</p>
          </div>

          <dl className="fl-ledger fl-rv">
            {measured.ledger.map((l) => (
              <div key={l.term}>
                <dt>{l.term}</dt>
                <dd>{l.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Band>

      {/* ---------- limits ---------- */}

      <Band id="limits" label={docsNav[5].label}>
        <h2 className="fl-h2 fl-rv">{limits.head}</h2>

        <dl className="fl-limits">
          {limits.rows.map((r) => (
            <div className="fl-rv" key={r.term}>
              <dt>{r.term}</dt>
              <dd>{r.catches}</dd>
              <dd>{r.blind}</dd>
            </div>
          ))}
        </dl>

        <p className="fl-body fl-close fl-rv">{limits.close}</p>
      </Band>

      {/* ---------- reference ---------- */}

      <Band id="index" label={docsNav[6].label}>
        <h2 className="fl-h2 fl-rv">{docsCopy.index.head}</h2>
        <p className="fl-lede fl-rv">{docsCopy.index.lede}</p>

        <nav className="fl-index" aria-label="Reference">
          {reference.map((r) => (
            <a href={`#${r.to}`} key={r.to}>
              <b>{r.head}</b>
              <span>{r.body}</span>
              <span className="fl-src">{r.src}</span>
            </a>
          ))}
        </nav>
      </Band>

      <ScanInvite scans={openScans} />
      <SiteFoot />
    </div>
  );
}
