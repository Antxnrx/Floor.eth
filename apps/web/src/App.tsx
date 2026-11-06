import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Dashboard } from "./screens/Dashboard";
import { Asset } from "./screens/Asset";
import { Verify } from "./screens/Verify";
import { About, Blast, Check, Enforcement, Kelp, Rules } from "./screens/Others";

const Landing = lazy(() => import("./screens/Landing").then((m) => ({ default: m.Landing })));
const Docs = lazy(() => import("./screens/Docs").then((m) => ({ default: m.Docs })));

/** The landing page's in-page anchors (`#gap`, `#replay`, …) live in the same
 *  hash as the router. Routes are the ones that start with a slash. */
const isRoute = (h: string) => h.startsWith("/");

/**
 * The route, with any in-page anchor cut off. A docs link is written
 * `#/docs#spec`: the first segment is the route and everything after the second
 * `#` is the section, which the page itself scrolls to (see useAnchorScroll).
 */
const routeOf = () => {
  const raw = location.hash.slice(1) || "/";
  const cut = raw.indexOf("#");
  return cut === -1 ? raw : raw.slice(0, cut) || "/";
};

/** Hash router (works on static hosting and Swarm /bzz/ URLs without server rewrites). */
const useHash = () => {
  const [h, setH] = useState(routeOf);
  const prev = useRef(h);
  useEffect(() => {
    // Only reset scroll when the route itself changes; a bare #section, or a
    // #/docs#section while already on the docs page, is a page scrolling within
    // itself.
    const on = () => {
      const next = routeOf();
      setH(next);
      if (isRoute(next) && next !== prev.current) window.scrollTo(0, 0);
      prev.current = next;
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return h;
};

const NAV = [
  ["/scan", "Live scan"],
  ["/kelp", "Kelp replay"],
  ["/enforcement", "Enforcement"],
  ["/blast", "Blast radius"],
  ["/check", "Pre-sign check"],
  ["/rules", "Rules"],
  ["/about", "About"],
] as const;

export function App() {
  const path = useHash();
  // The two public pages bring their own chrome and dark theme, so they bypass
  // the prototype banner and nav below. The landing also owns every non-route
  // hash, since its in-page anchors are written bare.
  if (path === "/docs") return <Suspense fallback={null}><Docs /></Suspense>;
  if (path === "/" || !isRoute(path)) return <Suspense fallback={null}><Landing /></Suspense>;
  const [, root, arg = ""] = path.split("/");
  const screen = (() => {
    switch (root) {
      case "scan": return <Dashboard />;
      case "asset": return <Asset id={arg} />;
      case "verify": return <Verify id={arg} />;
      case "kelp": return <Kelp />;
      case "enforcement": return <Enforcement />;
      case "blast": return <Blast />;
      case "check": return <Check />;
      case "rules": return <Rules />;
      case "about": return <About />;
      default: return <p>Not found</p>;
    }
  })();
  return (
    <>
      <div className="proto">Prototype for design handoff · REAL = actual onchain scans · MOCK = invented UI states</div>
      <nav>
        <a className="brand" href="#/">FLOOR</a>
        {NAV.map(([to, label]) => <a key={to} href={`#${to}`} className={path.startsWith(to) ? "on" : ""}>{label}</a>)}
      </nav>
      <main>{screen}</main>
    </>
  );
}
