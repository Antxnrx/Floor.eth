/** Read-only Arkiv check for scripts/check-live.sh: the live rating, dataset and flight recorder, as JSON. */
import { arkivReader, findRating, timeline, unboundedAdapters } from "../src/browser.js";

const WRITER = "0x563567A5788820093f71951DA383838D71ad2360";
const RSETH = "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7";
const c = arkivReader((u, i) => fetch(u, i) as never);
const r = await findRating(c, WRITER, RSETH);
const u = await unboundedAdapters(c as never, WRITER);
const t = await timeline(c as never, WRITER, RSETH);
console.log(JSON.stringify({ grade: r?.grade, swarmRef: r?.swarmRef, hash: r?.bundleHash, unbounded: u.length, events: t.length }));
