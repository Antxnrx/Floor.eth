/**
 * Copy and figures for the public site: the landing page and the docs page.
 *
 * Two rules hold everywhere in this file. Every number is reproduced by
 * something in this repo and carries the path that reproduces it; community
 * figures we have not reproduced are either absent or labelled as theirs
 * (docs/00-evidence-policy.md). And the live readings are not written here at
 * all — they are derived from the resolver fixtures in `./mock`, so if a
 * fixture is rescanned the page changes with it.
 */

import { chainName } from "@floor/core";
import type { EvidenceBundle, Grade } from "@floor/core";
import { ASSETS, binding, findAsset } from "./mock";

export const site = {
  name: "Floor",
  /** docs/01-overview.md:5 */
  pitch: "Kelp's attacked bridge route had one checker for 12.5 months. Every lender accepted rsETH anyway.",
  description:
    "Floor continuously rates the effective security of onchain collateral and gives lenders evidence to reduce exposure with bounded enforcement.",
  repo: "https://github.com/MeghVyas3132/Floor.eth",
} as const;

/* ---------- hero ---------- */

export interface HeroLine {
  text: string;
  /** The third line is set apart by weight and style rather than colour. */
  soft?: boolean;
}

export const hero = {
  lines: [
    { text: "Security ratings for" },
    { text: "onchain collateral," },
    { text: "with bounded enforcement.", soft: true },
  ] satisfies HeroLine[],
  /** The plain sentence, for the heading's accessible name. */
  label: "Security ratings for onchain collateral, with bounded enforcement.",
  sub: "Floor continuously checks the effective security of collateral: who can create or release it, which independent verifiers must agree, and how quickly its controls can change. Lenders can use the evidence to reduce new exposure automatically.",
  stages: ["Resolve", "Assess", "Evidence", "Respond"],
  foot: "Security posture, at a pinned block",
  /**
   * The inputs a grade is computed from. Every term is named and defined
   * somewhere below, which is why the strip is hidden from assistive
   * technology rather than duplicated into it: it is the vocabulary of the
   * page shown as a list of parts, not a second copy of the content.
   */
  marquee: [
    "Effective state",
    "Verifier threshold",
    "Timelock delay",
    "Rate limits",
    "Mint authority",
    "Send and receive libraries",
    "Oracle pins",
    "Delegates and owners",
    "Pinned block",
    "Recomputable evidence",
  ],
} as const;

/* ---------- the live readings ---------- */

export interface ScanView {
  key: string;
  tab: string;
  symbol: string;
  chain: string;
  block: string;
  grade: Grade;
  /** The constraint that caps the grade — the part a reader can argue with. */
  binding: string;
  facts: { term: string; value: string }[];
  routes: { chain: string; verifiers: number | null }[];
}

const receives = (b: EvidenceBundle) => b.verdict.routes.filter((r) => r.direction === "receive");

const toView = (key: string, tab: string): ScanView | null => {
  const a = findAsset(key);
  if (!a?.bundle) return null;
  return {
    key,
    tab,
    symbol: a.symbol,
    chain: a.chain,
    block: a.block.toLocaleString("en-US"),
    grade: a.grade,
    binding: binding(a),
    facts: [
      { term: "Inbound routes read", value: String(a.receiveRoutes) },
      { term: "On one effective verifier", value: `${a.singleVerifier} of ${a.receiveRoutes}` },
      { term: "Receive libraries unpinned", value: `${a.unpinned} of ${a.receiveRoutes}` },
      { term: "Bridge authority", value: a.controller },
    ],
    routes: receives(a.bundle).map((r) => ({ chain: chainName(r.eid), verifiers: r.effectiveIndependent })),
  };
};

/**
 * The two real scans, in the order they are read: the state the lenders were
 * accepting, then the state today. Both are resolver fixtures, so the panel is
 * a reading rather than an illustration of one.
 */
export const scans: ScanView[] = [
  toView("rseth-prehack", "rsETH · day before the drain"),
  toView("rseth-now", "rsETH · today"),
].filter((s): s is ScanView => s !== null);

/** Every scan the prototype can open, real ones first. */
export const openScans = ASSETS.map((a) => ({
  key: a.key,
  symbol: a.symbol,
  label: a.mock ? `${a.label} · invented UI state` : a.label,
  grade: a.grade,
  mock: a.mock,
}));

/* ---------- figures ---------- */

export interface Figure {
  value: string;
  label: string;
  source: string;
}

export const figures: Figure[] = [
  { value: "12.5mo", label: "the attacked route ran on one verifier, unnoticed", source: "docs/03 · onchain timeline" },
  { value: "$0", label: "borrowed on Aave in the fork replay, with Floor live", source: "contracts/test/fork/KelpReplay.t.sol" },
  { value: "624/624", label: "onchain reads re-verified in the browser, no trust in us", source: "packages/verifier" },
  { value: "20/34", label: "Ethereum adapters release their whole escrow on one message", source: "docs/09 · block 26,351,514" },
];

/* ---------- what Floor is ---------- */

export const definition = {
  lead: "Floor is a security rating for onchain collateral.",
  rest: " It reads the live control surface of an asset — every route that can create or release it — and publishes a grade a lender can act on, with the evidence to recompute it.",
  /** The same sentence standing on its own, where there is a heading above it. */
  lede: "Floor reads the live control surface of an asset — every route that can create or release it — and publishes a grade a lender can act on, with the evidence to recompute it.",
  claims: [
    {
      term: "Pinned",
      body: "Every grade names the block it was computed at, so two people reading it are reading the same chain.",
    },
    {
      term: "Lender-defined",
      body: "Thresholds come from the lender’s own risk framework. Floor encodes the rules; it does not invent them.",
    },
    {
      term: "Bounded",
      body: "A response can only reduce new exposure. Floor never moves funds, and never restores exposure on its own.",
    },
  ],
} as const;

/* ---------- why it exists ---------- */

export const why = {
  head: "Collateral can look safe while its weakest route stays exposed.",
  columns: [
    {
      head: "The risk is in the effective setup",
      body: [
        "A bridged token depends on more than its contract: bridge routes, verifiers, owners, delegates, upgrade keys, timelocks and rate limits all shape who can create or release it. A field left at zero inherits a default somebody else controls, and an optional threshold can make “three verifiers” mean “any one of three”.",
        "None of that is hidden. It is spread across contracts on several chains, in fields whose meaning depends on which other fields are set — which is why it goes unread until it matters.",
      ],
    },
    {
      head: "Most monitoring waits for a change",
      body: [
        "Guardians and alerting fire on movement: a transaction, a parameter edit, a price break. That catches drift and misses everything that was already wrong and simply stayed that way.",
        "Floor grades standing state instead. The question is not “what changed since yesterday” but “what is true at this block”, which is the only question that has an answer when the dangerous setting has not moved in a year.",
      ],
    },
  ],
} as const;

/**
 * The incident as four dated points on one line. Every row is from
 * docs/03-kelp-onchain-timeline.md, which reads them from Ethereum mainnet.
 * No figure here is rounded up.
 */
export const timeline = {
  head: "One route, one verifier, twelve and a half months.",
  scope: "rsETH · Ethereum mainnet",
  moments: [
    {
      when: "2 Apr 2025",
      what: "A wallet acting as the adapter’s delegate sets one route to a single required verifier, sending the change directly rather than through the owning multisig.",
    },
    {
      when: "Aug 2025 → Apr 2026",
      what: "Control moves to a 3-of-6 Safe. The verifier setting is never touched again, so nothing that watches for change has anything to report. At the end of it, 24 of 26 Ethereum routes stood on one verifier.",
    },
    {
      when: "18 Apr 2026",
      what: "That verifier’s own nodes are fed a false view of the source chain and outside providers are knocked offline. A forged message releases 116,500 rsETH.",
      breaks: true,
    },
    {
      when: "+22 blocks",
      what: "The first borrow against the released collateral lands about four and a half minutes after the drain. The first lender freeze comes roughly 88 minutes after it.",
    },
  ],
  source: "docs/03-kelp-onchain-timeline.md",
} as const;

/**
 * The one number on the site that came from an incident rather than from the
 * product, so it is set apart and its scope is stated in the same breath.
 * See docs/00-evidence-policy.md.
 */
export const replay = {
  caption: "The same block, replayed",
  claim: "With Floor in the path, the borrow reverts:",
  figure: "$0 borrowed on Aave.",
  why: "The grade at the block before the drain is BREACHED: a single effective verifier on the attacked route, a receive library left unpinned, and no timelock on the controlling multisig. Each of those is a published rule, failed.",
  scope: "A scoped result from an Aave Ethereum fork — not a claim that Floor prevented the real incident, or its losses on the other lenders that took the same collateral.",
  source: "contracts/test/fork/KelpReplay.t.sol",
} as const;

export const whyNow = {
  head: "Why this is live now",
  items: [
    {
      term: "There is now a standard to fail",
      body: "Aave’s DAO approved a risk framework by Snapshot vote in July 2026. Collateral is expected to meet it continuously, not once at listing.",
    },
    {
      term: "Defaults moved, settings did not",
      body: "After the incident, LayerZero said protocol defaults would be no less than a three-of-three verifier configuration. A default is not an application’s effective setting, and most applications set their own.",
    },
    {
      term: "One fewer independent reader",
      body: "Chaos Labs stepped away from Aave in April 2026, leaving a single risk provider on the largest lending market.",
    },
    {
      term: "A second stack to read",
      body: "CCIP 2.0 launched in September 2026 with its own verifier sets and thresholds, so the same posture questions now have to be asked twice per asset.",
    },
  ],
  close:
    "When the weakness sits in something many markets share rather than in one asset, the only instrument most lenders have is a broad freeze — on 29 October 2026 Aave froze 292 reserves while one exploiter’s position was assessed. Knowing which markets actually depend on a given verifier, library or key is what makes a narrower answer possible.",
} as const;

/* ---------- how it works ---------- */

/**
 * The pipeline as a diagram: many readings converge on one decision, and the
 * decision fans out into a small, bounded set of actions. Edges are declared
 * on the host and drawn from the laid-out boxes by effects/beams.js. Below
 * `lg` the three columns stack, so the fan-in and fan-out would cross the
 * boxes between them — the narrow list drops to the spine, which is the part
 * that still reads vertically.
 */
export const diagram = {
  head: "From onchain state to a bounded response.",
  lede: "Floor reads the live configuration of the bridges, keys and libraries a collateral asset depends on, grades that reading against a lender’s published rule pack, and publishes the reads the grade was computed from. Enforcement is the last stage and the narrowest one: an opt-in adapter can lower a cap or stop new borrowing. It cannot move anyone’s funds.",
  edges:
    "src-routes>resolve, src-control>resolve, src-market>resolve, src-declared>resolve, resolve>assess, assess>evidence, evidence>respond, respond>out-cap, respond>out-freeze, respond>out-mirror",
  edgesNarrow: "resolve>assess, assess>evidence, evidence>respond",
  inputs: {
    label: "Read at a pinned block",
    pins: [
      { id: "src-routes", text: "Bridge routes — required and optional verifiers, thresholds, receive libraries" },
      { id: "src-control", text: "Control — delegates, Safe owners and threshold, timelock delay" },
      { id: "src-market", text: "Market — oracle, mint authority, caps and LTV in force" },
      { id: "src-declared", text: "Declared — the issuer’s Manifest, where one is published" },
    ],
  },
  stages: [
    { id: "resolve", n: "001", tag: "Resolve", shape: "sphere", head: "Resolve the graph" },
    { id: "assess", n: "002", tag: "Assess", shape: "cube", head: "Apply the rule pack" },
    { id: "evidence", n: "003", tag: "Evidence", shape: "octahedron", head: "Publish the reads" },
    { id: "respond", n: "004", tag: "Respond", shape: "frustum", head: "Bound the exposure" },
  ],
  outputs: {
    label: "Opt-in, and bounded",
    pins: [
      { id: "out-cap", text: "Supply cap lowered on a lender adapter" },
      { id: "out-freeze", text: "New borrowing stopped; re-enabling stays with the curator" },
      { id: "out-mirror", text: "Signed grade mirrored for other consumers" },
    ],
  },
} as const;

/**
 * The stages again, in prose. The diagram carries the shape of the pass; this
 * carries what each stage actually does, and the two are kept apart so neither
 * has to be read at the wrong size.
 */
export const stageProse = [
  {
    term: "Resolve the graph",
    body: "Every bridge route an asset can arrive on, with the verifier set, receive library, control keys, timelock, oracle and mint authority behind it — read at one block so the result can be recomputed later.",
  },
  {
    term: "Apply the rule pack",
    body: "Defaults, optional thresholds and shared operators are resolved to the setting actually in force, then checked against a versioned lender policy and the issuer’s declared Manifest.",
  },
  {
    term: "Publish the reads",
    body: "A grade ships with the block, the onchain reads and the rule version it came from, so a third party can reproduce it from public data instead of trusting the label.",
  },
  {
    term: "Bound the exposure",
    body: "Where a lender has opted in, a falling grade can lower a cap or close new borrowing. Nothing is liquidated, nothing is moved, and turning it back on is the lender’s decision.",
  },
] as const;

export const audiences = [
  {
    head: "For issuers: Floor Check and Manifest (planned)",
    body: "A Manifest states the security settings an issuer intends to run — which verifiers are required, which library is pinned, what delay a change has to sit through. Floor Check simulates a proposed Safe transaction against that statement before anyone signs it, and the same check runs in CI so drift is caught as a failing build rather than as an incident.",
  },
  {
    head: "For risk teams: attestations and feeds",
    body: "Grades are signed and can be mirrored to other chains, with the history kept alongside the evidence. Lenders, curators, insurers and exchanges read the same posture data, which is the difference between four teams maintaining four private spreadsheets and four teams disagreeing about one public number.",
  },
] as const;

export const buildNote =
  "Current build, live on testnets: LayerZero effective-state resolver, Aave rule pack v0, a live read of all 24 Aave V3 markets, fork replay and browser verifier. A Chainlink CRE workflow writes the grade on Ethereum Sepolia, CCIP mirrors it to Base Sepolia, and there it cut a Morpho vault’s cap to 0. Floor Check, the Manifest and the Safe guard are planned. Rating CCIP-bridged assets is on the roadmap. Nothing runs on mainnet.";

/** README.md "How it runs". Each step names the thing that actually runs. */
export const runtime = [
  { step: "Resolve", body: "Read the asset's effective config at a pinned block, cross-checked across 3 independent RPCs.", tag: "packages/resolver" },
  { step: "Bundle", body: "Freeze the evidence into a hashed bundle. Bytes to Swarm, index to Arkiv.", tag: "packages/publish" },
  { step: "Grade", body: "Every CRE node re-reads the evidence at that block and agrees a lower-bound grade.", tag: "cre/floor-rating" },
  { step: "Attest", body: "The signed report lands in FloorRegistry, and CCIP 2.0 mirrors it to a second chain.", tag: "contracts" },
  { step: "Enforce", body: "Morpho caps cut to zero, Aave reserves freeze. Never a pause, never a blocked repay.", tag: "FloorSentinel" },
  { step: "Verify", body: "Anyone replays every read in their own browser and reproduces the grade.", tag: "packages/verifier" },
] as const;

/** README.md repo map. Test counts are what `pnpm -r test` and `forge test` report. */
export const built = [
  { path: "packages/core", what: "Rule pack, effective-independence math, canonical hashing", tests: "17" },
  { path: "packages/resolver", what: "LayerZero scanner, 3-RPC cross-check, inbound-limit probe", tests: "12 live" },
  { path: "packages/verifier", what: "Browser verifier: raw replay, grade reproduction, traffic meter", tests: "9 live" },
  { path: "packages/publish", what: "Arkiv schemas and queries, Swarm upload, re-runnable importer", tests: "6 + round trip" },
  { path: "cre/floor-rating", what: "Chainlink CRE workflow, compiles to WASM", tests: "8 + 3 e2e" },
  { path: "contracts", what: "Registry, broadcaster, CCIP mirror, sentinel, freeze enforcer", tests: "35 incl. forks" },
] as const;

export const stack = [
  { name: "Chainlink CRE", role: "Consensus grading and the signed report" },
  { name: "CCIP 2.0", role: "Status changes carried to a second chain" },
  { name: "Arkiv", role: "Queryable rating and route history" },
  { name: "Swarm", role: "Evidence bundles, addressed by hash" },
] as const;

/* ---------- what we check ---------- */

export const spec = {
  head: "A security grade with reasons you can inspect.",
  lede: "Thresholds belong to the lender, not to Floor. The first rule pack encodes the Aave Risk Framework approved by Snapshot vote, including its minimum of three independent verifiers on every Aave-exposed route — and it is versioned, so a grade always names the edition of the rules that produced it.",
  rows: [
    {
      term: "Verifier threshold",
      body: "At least 3 independent verifiers per route, counted as required, never as required plus optional",
    },
    {
      term: "Control and upgrades",
      body: "Bridge and library changes gated by a timelock, with delegates and Safe thresholds resolved to the path actually usable today",
    },
    {
      term: "Route limits",
      body: "Inbound and outbound bounds checked separately, because only the inbound one bounds what a forged message can release",
    },
    {
      term: "Libraries and dependencies",
      body: "Pinned receive library, oracle, mint authority and the implementation address behind every proxy",
    },
  ],
} as const;

/** A cell of headroom: filled, empty, or no reading at all. */
export type MeterCell = "on" | "off" | "void";

export const grades: { name: Grade; cells: MeterCell[]; body: string }[] = [
  { name: "OK", cells: ["on", "on", "on", "on"], body: "Meets the selected lender rules at the scanned block." },
  { name: "DEGRADED", cells: ["on", "on", "off", "off"], body: "Weaker than required, with headroom left; a lender may lower caps." },
  { name: "BREACHED", cells: ["on", "off", "off", "off"], body: "A hard rule fails; new exposure can be reduced where a lender has opted in." },
  { name: "UNKNOWN", cells: ["void", "void", "void", "void"], body: "Evidence missing or a dependency unmapped. Not a pass, and not a zero." },
];

/**
 * One check run with Floor's own tooling, reported with its block and its
 * failures. It is the clearest statement of what "we check this" means: a
 * number, where it came from, and the cases the probe could not settle.
 */
export const measured = {
  head: "One of those rules, measured rather than asserted.",
  body: [
    "Aave’s framework asks that a bridge bound how much a single inbound message can release. To find out whether that bound exists, Floor calls each adapter at a pinned block from the LayerZero endpoint address, with a correctly formed credit from the route’s own configured peer, and classifies the result by revert reason. Simulation only, on a fork — never a broadcast.",
    "Of 64 LayerZero adapters over Aave-listed tokens on 8 chains (rerun 2026-11-07): 31 had no inbound bound: they accepted a credit for their entire escrow, or minted the maximum amount. 4 enforced a real per-message limit, 4 returned a test error we count as neither a pass nor a failure, 4 held nothing to bound, 15 had no active peers, and 6 are LayerZero v1, which this probe does not cover. The probe refuses to run at all unless the same call is first rejected from a non-endpoint address and from a wrong peer.",
  ],
  scope:
    "This measures the application layer, not drainability: a real attack still has to defeat the verifier layer first. Floor does not claim to have reproduced the community’s multi-chain “35 of 39” figure — the lists overlap and agree on every adapter both could probe, and the rest is the next step.",
  ledger: [
    { term: "Scope", value: "8 chains, 2026-11-07" },
    { term: "Adapters probed", value: "64" },
    { term: "No inbound bound", value: "31" },
    { term: "Bounded", value: "4" },
    { term: "Inconclusive", value: "4 custom codec" },
  ],
  source: "docs/09 · packages/resolver inbound-limit probe",
} as const;

/**
 * The limits of each enforcement point. Both halves are stated for every
 * point, because a monitoring product that only publishes the left half is the
 * thing this site is arguing against.
 */
export const limits = {
  head: "Where Floor can act, and where it cannot.",
  rows: [
    {
      term: "CI and pre-sign check (planned)",
      catches: "Catches a planned config, library or delegate change that lowers the floor — before anyone signs it.",
      blind: "Blind to anything sent outside the pipeline, such as a transaction from an EOA delegate.",
    },
    {
      term: "Safe guard, fail-open (planned)",
      catches: "Catches weakening through the Safe’s own signed path, including batched calls and configs that only look like three verifiers.",
      blind: "Blind to modules, EOA and timelock delegates, bridge default changes, other chains — and to a quorum that removes the guard first. Not deployed on funded Safes.",
    },
    {
      term: "Continuous monitoring",
      catches: "Catches all of the above, plus default changes, owner and delegate changes, modules and the same asset on other chains. This is the source of truth.",
      blind: "Has nothing to block with. It can only publish and feed the enforcers.",
    },
    {
      term: "Lender enforcers",
      catches: "Catches new exposure taken against collateral that is already BREACHED.",
      blind: "Leaves existing positions alone. That is a design decision, not a gap: no forced unwinds.",
    },
  ],
  close:
    "Enforcers only ever reduce new exposure. Floor never moves funds, never pauses a protocol, never blocks repayment, withdrawal or liquidation, and never re-enables collateral by itself. A lender or curator has to opt in, and a human decides when exposure is restored.",
} as const;

/* ---------- the scan invitation ---------- */

export const invite = {
  head: "Read the grade, then recompute it yourself.",
  body: "The scan opens on a real resolver fixture: every route, every verifier set, every library, at a named block. The browser verifier pulls the same evidence, replays the reads through an independent RPC and tells you whether it got the same answer — on mainnet it has reproduced 624 of 624 reads.",
  source: "packages/verifier · 9 live tests",
} as const;

/* ---------- docs ---------- */

/**
 * The docs page's own chrome — the lines that introduce sections whose content
 * is written further up this file. Kept here with everything else so the page
 * component holds markup and no prose.
 */
export const docsCopy = {
  top: {
    head: "What Floor reads, how it grades, and what it is allowed to do.",
    lede: "The landing page states the result. This is the argument behind it: the failure it was built after, the rules a grade is computed against, one of those rules measured rather than asserted, and the limit on every point where Floor can act.",
  },
  runtime: {
    head: "What runs, in the order it runs.",
    lede: "Six steps from an onchain read to a grade somebody else can reproduce. Each one names the package that does it.",
    built: "What is built, and what it is tested against",
    builtNote: "Test counts are what pnpm -r test and forge test report.",
    stack: "The rails it runs on",
  },
  index: {
    head: "Everything else, indexed.",
    lede: "Each screen of the prototype, with the file or document behind it. The two real scans read a pinned fixture; the rest are invented UI states and say so on the screen.",
  },
} as const;

export const docsNav = [
  { id: "definition", label: "What Floor is" },
  { id: "why", label: "Why it exists" },
  { id: "how", label: "How it works" },
  { id: "runtime", label: "What runs" },
  { id: "spec", label: "What we check" },
  { id: "limits", label: "Limits" },
  { id: "index", label: "Reference" },
] as const;

/** The prototype screens and the written record, as one index. */
export const reference = [
  { to: "/scan", head: "Live scan", body: "Every asset the prototype can grade, real fixtures first.", src: "screens/Dashboard" },
  { to: "/asset/rseth-prehack", head: "rsETH at block 24,908,284", body: "Route table, verifier sets and the failing rules behind the grade.", src: "fixtures/rseth-24908284.json" },
  { to: "/verify/rseth-prehack", head: "Browser verifier", body: "Replays every onchain read in your own browser and reproduces the grade.", src: "packages/verifier" },
  { to: "/kelp", head: "Kelp replay", body: "The attacker's real transactions on a mainnet fork, with and without Floor.", src: "contracts/test/fork" },
  { to: "/enforcement", head: "Enforcement timeline", body: "What a falling grade sets off, stage by stage, with the bounds on each.", src: "FloorSentinel" },
  { to: "/blast", head: "Blast radius", body: "Which markets depend on a given verifier, library or key.", src: "docs/02" },
  { to: "/check", head: "Pre-sign check", body: "A proposed Safe transaction simulated against the issuer's Manifest.", src: "Floor Check" },
  { to: "/rules", head: "Rule pack", body: "Each rule with the exact clause it encodes and where that clause is published.", src: "packages/core" },
  { to: "/about", head: "Evidence policy", body: "What we reproduced, what we did not, and how each claim is labelled.", src: "docs/00" },
] as const;

/* ---------- chrome ---------- */

export const headNav = [
  { to: "#how", label: "How it works" },
  { to: "#why", label: "Why it exists" },
  { to: "#/docs", label: "Docs" },
] as const;

/**
 * The same bar on the docs page. In-page anchors are written `#/docs#id`
 * rather than `#id`: the router owns the hash, and a bare `#id` is the
 * landing page's own anchor form — following one from here would navigate away.
 */
export const docsHeadNav = [
  { to: "#/", label: "Overview" },
  { to: "#/docs#how", label: "How it works" },
  { to: "#/docs#why", label: "Why it exists" },
] as const;

export const footer = {
  cols: [
    {
      head: "What this is",
      body: "A lender-side security rating for onchain collateral, built from live effective state and evidence anyone can recompute.",
    },
    {
      head: "Sections",
      links: [
        { to: "#/", label: "Overview" },
        { to: "#/docs", label: "Documentation" },
        { to: "#/live", label: "Live market" },
        { to: "#/kelp", label: "Kelp simulation" },
        { to: "#/scan", label: "rsETH scan" },
        { to: "#/rules", label: "Rule pack" },
        { to: "#/about", label: "Evidence policy" },
      ],
    },
    {
      head: "Capabilities",
      links: [
        { to: "#/blast", label: "Floor Graph — the dependency map" },
        { to: "#/check", label: "Floor Check — pre-sign and CI" },
        { to: "#/docs#spec", label: "Floor Rating — graded against a rule pack" },
        { to: "#/enforcement", label: "Floor Enforcers — opt-in, reduce only" },
      ],
    },
    {
      head: "Who it is for",
      body: "Lenders and curators setting caps on collateral they did not issue; issuers who want their security posture checkable rather than argued; insurers and exchanges reading the same evidence.",
    },
  ],
  end: ["Evidence led. Human controlled.", "Every grade names its block, its reads and its rule version"],
} as const;
