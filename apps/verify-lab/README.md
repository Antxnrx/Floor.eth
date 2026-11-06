# verify-lab

Minimal page that runs the Floor browser verifier with every chain read routed through EF Anon-RPC. No Floor server is involved. It is the integration reference for `apps/web`: copy `makeTransport()` and the `verifyBundle()` call from `src/main.ts`.

```bash
pnpm install
pnpm --filter @floor/verify-lab dev        # http://127.0.0.1:5181
```

URL options: `?net=nym|tor-js|passthrough|direct`, `&auto` (start on load), `&tamper` (flip one recorded byte, must give MISMATCH), `&rpc=<url,url>`, `&batch=10&conc=6&timeout=20000`.

What the page shows:
- status: VERIFIED / MISMATCH / UNVERIFIED_RPC (never VERIFIED if any read failed);
- traffic meter: reads per route and the share through Anon-RPC (the 2 bootstrap reads of the specifier contract go direct, by design, and are shown);
- per-request diagnostics (latency, HTTP status per provider, JSON-RPC errors).

Measured runs, provider compatibility and caveats: [`docs/evidence/anon-rpc/2026-11-06-browser-runs.md`](../../docs/evidence/anon-rpc/2026-11-06-browser-runs.md).

Rules: never label passthrough as anonymous; keep the Content-Security-Policy compatible with the harness's srcdoc bootstrap (see the harness README) or serve its iframe page yourself.
