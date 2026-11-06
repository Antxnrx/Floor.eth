import { useEffect, useState } from "react";
import { Dashboard } from "./screens/Dashboard";
import { Asset } from "./screens/Asset";
import { Verify } from "./screens/Verify";
import { About, Blast, Check, Enforcement, Kelp, Rules } from "./screens/Others";
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

const NAV = [
  ["/", "Live scan"],
  ["/kelp", "Kelp replay"],
  ["/enforcement", "Enforcement"],
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
      case "": return <Dashboard />;
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
      <div className="proto">REAL = onchain scans and the live testnet deployment · MOCK = invented UI states, kept labelled</div>
      <nav>
        <a className="brand" href="#/">Floor</a>
        {NAV.map(([to, label]) => <a key={to} href={`#${to}`} className={(to === "/" ? root === "" : path.startsWith(to)) ? "on" : ""}>{label}</a>)}
        <a href={`${LIVE.verifyPage}dataset.html`}>Bridge dataset</a>
      </nav>
      <main>{screen}</main>
    </>
  );
}
