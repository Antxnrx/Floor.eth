import type { EffectHandle } from "./beams";

/**
 * Toggles `.is-inview` on every `[data-inview]` under `root` while it is on
 * screen, so the page's CSS loops follow the same rule as its canvases.
 */
export function mountInView(root?: ParentNode): EffectHandle;
