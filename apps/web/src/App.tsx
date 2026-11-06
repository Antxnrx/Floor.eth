import { useEffect, useState } from "react";
import { Dashboard } from "./screens/Dashboard";
import { Asset } from "./screens/Asset";
import { Verify } from "./screens/Verify";
import { About, Blast, Check, Enforcement, Kelp, Rules } from "./screens/Others";
import { LiveMarket } from "./screens/LiveMarket";
import { LIVE } from "./data/live";

/** Hash router (works on static hosting and Swarm /bzz/ URLs without server rewrites). */
const useHash = () => {
  const [h, setH] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => { setH(location.hash.slice(1) || "/"); window.scrollTo(0, 0); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return h;
};

/** Two main tabs; the rest are secondary pages. */
const NAV = [
  ["/", "Live market"],
  ["/kelp", "Kelp simulation"],
] as const;
const SECONDARY = [
  ["/scan", "rsETH scan"],
  ["/blast", "Blast radius"],
  ["/check", "Pre-sign check"],
  ["/rules", "Rules"],
  ["/about", "About"],
] as const;

export function App() {
  const path = useHash();
  const [, root, arg = ""] = path.split("/");
  const screen = (() => {
    switch (root) {
      case "": return <LiveMarket />;
      case "scan": return <Dashboard />;
      case "asset": return <Asset id={arg} />;
      case "verify": return <Verify id={arg} />;
      case "kelp": return <KelpSimulation />;
      case "enforcement": return <KelpSimulation />;
      case "blast": return <Blast />;
      case "check": return <Check />;
      case "rules": return <Rules />;
      case "about": return <About />;
      default: return <p>Not found</p>;
    }
  })();
  return (
    <>
      <div className="proto">Live market = read from every Aave V3 market right now · Kelp simulation = the real attack replayed, and the loop it drove on testnets · MOCK = invented UI states, kept labelled</div>
      <nav>
        <a className="brand" href="#/">Floor</a>
        {NAV.map(([to, label]) => <a key={to} href={`#${to}`} className={`main ${(to === "/" ? root === "" : path.startsWith(to)) ? "on" : ""}`}>{label}</a>)}
        <span className="spacer" />
        {SECONDARY.map(([to, label]) => <a key={to} href={`#${to}`} className={path.startsWith(to) ? "on" : ""}>{label}</a>)}
        <a href={`${LIVE.verifyPage}dataset.html`}>Bridge dataset</a>
        <a href={LIVE.verifyPage}>Verify</a>
      </nav>
      <main>{screen}</main>
    </>
  );
}

/** Kelp simulation: the replay of the real attack, then the live loop it drove on testnets. */
function KelpSimulation() {
  return (
    <>
      <Kelp />
      <Enforcement />
    </>
  );
}
