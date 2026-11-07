import type { Grade, Outcome } from "@floor/core";
import type { ReactNode } from "react";
import type { PixelShapeKind } from "../effects/pixelShapes";

export const GradeChip = ({ g }: { g: Grade | Outcome }) => <span className={`chip chip-${g.toLowerCase()}`}>{g}</span>;
export const Mock = () => <span className="chip chip-mock" title="Invented for UI states only">MOCK</span>;
export const Real = () => <span className="chip chip-real" title="Real onchain scan">REAL</span>;

export const Card = ({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) => (
  <section className="card">
    {(title || right) && (
      <header className="card-h">
        <h3>{title}</h3>
        {right}
      </header>
    )}
    {children}
  </section>
);

/**
 * The landing's wireframe solid, reused here as a section mark.
 *
 * Each kind means what the effect assigns it (src/effects/pixelShapes.js): the
 * sphere is a graph read through its own structure, the cube is a policy with a
 * rule on every face, the octahedron is evidence, the frustum is a cap. So the
 * shape over a block says what kind of block it is before the heading does, and
 * it is the same drawing the home page used to say the same thing.
 *
 * Must stay a childless leaf: the effect appends a canvas inside it, and React
 * would discard that on any re-render that touched the element's children.
 */
export const ShapeMark = ({ kind }: { kind: PixelShapeKind }) => <div className="shape-mark" data-pixel-shape={kind} />;

/**
 * A titled block that reads its own hover for the shape inside it, with the
 * provenance of what it shows stated in the header rather than in a caption
 * underneath. Used for the charts and for the verify hand-off.
 */
export const Panel = ({
  mark,
  title,
  lede,
  badge,
  flat,
  children,
}: {
  mark: PixelShapeKind;
  title: string;
  lede: string;
  badge?: ReactNode;
  /** Open on the page under a single rule, rather than boxed. For the one that
   *  closes a section: a third box next to two would read as a card grid. */
  flat?: boolean;
  children: ReactNode;
}) => (
  <section className={flat ? "panel panel-flat" : "panel"} data-shape-card>
    <header className="panel-h">
      <ShapeMark kind={mark} />
      <div className="panel-text">
        <h3>{title}</h3>
        <p>{lede}</p>
      </div>
      {badge && <div className="panel-badge">{badge}</div>}
    </header>
    {children}
  </section>
);

export const Stat = ({ value, label, source }: { value: string; label: string; source?: string }) => (
  <div className="stat">
    <b>{value}</b>
    <span>{label}</span>
    {source && <small>{source}</small>}
  </div>
);

export const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
export const Link = ({ to, children }: { to: string; children: ReactNode }) => <a href={`#${to}`}>{children}</a>;
