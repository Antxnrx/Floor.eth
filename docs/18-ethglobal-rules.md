# 18 · ETHGlobal rules (verbatim) and what they mean for us

Sources, read 2026-11-06:
- Event details: https://ethglobal.com/events/mumbai/info/details
- Rules & Code of Conduct: https://ethglobal.com/rules
- (`/events/mumbai/info/rules` and `/guides` return 404; rules live in the two pages above.)

## Deadline and submission

- "All projects must be submitted by **Saturday, November 7th 2026** at **09:00 am IST**. Late submissions won't be accepted, so be sure to plan ahead!"
- "Head over to your Hacker Dashboard to submit your project. You'll fill out the form with essential details like your project title, description, and a link to your repository."
- "On the last step of the submission form, you can select up to **3 Partner Prizes** to apply for. If a partner has multiple tracks, you can be eligible for all of them while only counting as 1 Partner Prize. **Please ensure to select these prizes carefully** as it is the only way for partners to assess your project."
- Two submission options: (1) "Finalist and Partner Prizes" (requires presenting at the finalist judging session); (2) "Partner Prizes Only": "For each partner prize, you'll need to explain how you've used or integrated their tools, provide feedback, and share relevant comments."

**For us:** choose option 1. Picks: Chainlink, Arkiv (+ Swarm bonus, which doesn't use a pick), Ethereum Foundation. Prepare per-partner integration text and feedback in advance.

## Build rules

- Classic track: "all work on your project must begin after the hackathon officially starts. Any prior project-specific code, designs, or assets are not allowed unless they're from public libraries or starter kits. Projects built before the event may still participate but won't qualify for **partner prizes** or the **Finalist category**."
- "**Version Control:** … Submissions with large single commits or missing histories may be disqualified."
- "**Any repositories with single commits of large files without proper history will be default assumed to be unqualified unless proven otherwise.**"
- "**Open Source Libraries & Boilerplates:** You're welcome to use open-source libraries and starter kits … but be transparent."
- "**Include Everything:** … Clearly distinguish between what's new and what's reused."
- Pre-existing work: "you must disclose any pre-existing work in writing to the ETHGlobal team and include full details in your submission … undisclosed pre-existing work … the project may be disqualified, prizes revoked, and the team may be banned from future events."

**For us:**
- Commit small and often, with clear messages.
- No pre-event project code in this repo. Pre-event *research notes* exist outside this repo. If any of it is used, disclose it in the README as research, not code.
- List every library and starter kit used (forge-std, Safe contracts, LayerZero devtools, Chainlink templates, Arkiv SDK, bee-js, Anon-RPC).

## AI tools

- "The use of AI tools (e.g., …) is generally permitted…"
- "**Attribution:** Clearly document in your submission where and how AI tools were used in the project. This includes specifying which parts of the code, specific files, or assets were generated or assisted by AI."
- "**Involvement:** AI tools should be used to assist your development process, not to create the entire project. Submissions that rely entirely on AI without meaningful contributions from team members may not be eligible for partner prizes or finalist consideration."
- "**Spec-Driven Development:** … you must include all spec files, prompts, and planning artifacts in your submission repository."

**For us:** keep an `AI-USAGE.md` at the repo root listing files and areas AI assisted with (research, docs, fork tests, code). Keep these docs in the repo. Humans must own the design decisions and be able to explain every part.

## Judging

- Finalist session: "Each team has **7 minutes** to present: **4 minutes** for the demo, followed by **3 minutes** for Q&A with the judges."
- Criteria: **Technicality**, **Originality**, **Practicality** ("How complete and functional is your project?"), **Usability** (UI/UX/DX), **WOW Factor**.
- "Partners will judge submissions based on the project materials you submit." "Partner prize winners will be announced during the closing ceremony."
- Finalists (prizes page): top 10 teams; 3–5 people: 1,000 USDC prize + 500 USDC travel per person.

## Demo video

- "**Must be between 2 and 4 minutes**: Videos under 2 minutes or over 4 minutes will be automatically rejected during upload."
- "DO NOT export the video in any resolution less than 720p" · "DO NOT speed up the video to fit under the time limit" · "DO NOT use mobile phones to record the video submission" · "DO NOT use a text to speech synthesizer / AI Voiceover" · slides: "no more than **4 bullet points per slide**."
- The EF CROPS prize also requires "A demo video (3 minutes max)". **Target: 2:30–2:55.**

## Conduct

- Stake refund: submit before the deadline ("Partial or incomplete hacks are still eligible"), and be checked in and physically present.
- IP: "You (and your team) will own any developments made by you during The Event."

## Not stated on these pages

Team size limits; finalist selection method; payout/KYC details; whether finalist prizes stack with partner prizes; a formal Continuity Track definition beyond the rule text.
