/** Read-only Arkiv check for scripts/check-live.sh: the live rating, dataset and flight recorder, as JSON. */
import { DEPLOYMENT, RSETH, WRITER } from "@floor/deployments";
import { arkivReader, findRating, timeline, unboundedAdapters } from "../src/browser.js";

const c = arkivReader((u, i) => fetch(u, i) as never, DEPLOYMENT.chains.arkiv.rpc);
const r = await findRating(c, WRITER, RSETH);
const u = await unboundedAdapters(c as never, WRITER);
const t = await timeline(c as never, WRITER, RSETH);
console.log(JSON.stringify({ grade: r?.grade, swarmRef: r?.swarmRef, hash: r?.bundleHash, unbounded: u.length, events: t.length }));
