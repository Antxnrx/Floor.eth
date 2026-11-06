# Third-party assets in `public/`

## `embers-*.avif` / `embers-*.webp` / `embers-*.jpg`

Long-exposure abstract light-streak photograph, used as the source texture for the
cursor-driven canvas magnifier section.

| | |
| --- | --- |
| Title | *Sparkling Blurred Yellow Light* |
| Photographer | Luis Quintero (`@jibarofoto`) |
| Source | https://www.pexels.com/photo/sparkling-blurred-yellow-light-16577536/ |
| Photographer profile | https://www.pexels.com/@jibarofoto/ |
| Licence | [Pexels License](https://www.pexels.com/license/) |
| Original | 6000x4000 JPEG |
| Modifications | Cropped to a 6000x3000 band (2:1, offset y=900 from the top), downscaled, re-encoded to AVIF / WebP / JPEG |

### Licence position

Verified against https://www.pexels.com/license/ on 2026-11-06.

Under the Pexels License the photo is **free to use, including commercially**, and
**may be modified** ("You can modify the photos and videos from Pexels. Be creative
and edit them as you like.").

**Attribution is not required.** The licence states verbatim: *"Attribution is not
required. Giving credit to the photographer or Pexels is not necessary but always
appreciated."* The credit above is therefore voluntary, recorded for provenance
rather than to satisfy a licence obligation.

Relevant restrictions, none of which this use runs into:

- Don't sell unaltered copies (poster, print, physical product) without modifying first.
- Don't redistribute or sell the photo on other stock photo or wallpaper platforms.
- Don't use it as part of a trade mark, design mark, trade name, business name or service mark.
- Don't imply endorsement by people or brands shown.
- Identifiable people may not appear in a bad light or in an offensive way.
  (Not applicable — the photograph is wholly abstract and contains no people.)

If you want the credit surfaced in the UI rather than only here, this is the string to use:

> Photo by Luis Quintero on Pexels

---

## `arm_bones.glb` — provenance NOT established

**Open item before submission.** This is the rigged hand model the hero scene loads
(`src/scenes/Scene.js`, via `Arm.load`). It arrived with the source project and no
licence, author or origin is recorded anywhere in this repo.

Until someone states where it came from, treat it as undocumented third-party work:
ETHGlobal allows open-source assets *with transparency* and disallows pre-event
project assets ([docs/18](../../../../docs/18-ethglobal-rules.md)), and this file
cannot currently satisfy either test. Either record the source and licence here, or
replace the model with one whose licence is known.

`arm.glb` (4.4 MB) was removed: nothing referenced it.

---

## Not covered by this file

The vendored Codrops effect code under `src/effects/` carries its own licence in
`src/effects/LICENSE-codrops`. `gridImage.*` and `fluidCursor.*` likewise carry
`LICENSE-codepen-grid` and `LICENSE-fluid-pixel` beside them.
