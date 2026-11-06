import { useEffect, useState } from "react";
import { Landing } from "./screens/Landing";
import { Dashboard } from "./screens/Dashboard";
import { Asset } from "./screens/Asset";
import { Verify } from "./screens/Verify";
import { About, Blast, Check, Enforcement, Kelp, Rules } from "./screens/Others";

/** The landing page's in-page anchors (`#gap`, `#replay`, …) live in the same
 *  hash as the router. Routes are the ones that start with a slash. */
const isRoute = (h: string) => h.startsWith("/");

/** Hash router (works on static hosting and Swarm /bzz/ URLs without server rewrites). */
const useHash = () => {
  const [h, setH] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    // Only reset scroll for real route changes; a bare #section is the landing
    // page scrolling within itself (see isRoute).
    const on = () => {
      const next = location.hash.slice(1) || "/";
      setH(next);
      if (isRoute(next)) window.scrollTo(0, 0);
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
  // The landing page brings its own chrome and dark theme, so it bypasses the
  // prototype banner and nav below. It also owns every non-route hash.
  if (path === "/" || !isRoute(path)) return <Landing />;
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
        <a className="brand" href="#/">Floor</a>
        {NAV.map(([to, label]) => <a key={to} href={`#${to}`} className={path.startsWith(to) ? "on" : ""}>{label}</a>)}
      </nav>
      <main>{screen}</main>
    </>
  );
}
