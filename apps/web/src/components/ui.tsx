import type { Grade, Outcome } from "@floor/core";
import type { ReactNode } from "react";

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

export const Stat = ({ value, label, source }: { value: string; label: string; source?: string }) => (
  <div className="stat">
    <b>{value}</b>
    <span>{label}</span>
    {source && <small>{source}</small>}
  </div>
);

export const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
export const Link = ({ to, children }: { to: string; children: ReactNode }) => <a href={`#${to}`}>{children}</a>;
