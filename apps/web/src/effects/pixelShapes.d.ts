/** Teardown handle shared by the imperative effects in this folder. */
export interface EffectHandle {
  destroy(): void;
}

/** The wireframes `mountPixelShapes` knows how to draw. */
export type PixelShapeKind = "sphere" | "cube" | "octahedron" | "frustum";

/**
 * Mounts every `[data-pixel-shape]` under `root` as a slowly turning wireframe
 * that quantises to 4px cells while its `[data-shape-card]` ancestor is
 * hovered. No-ops under `prefers-reduced-motion` and on coarse pointers.
 */
export function mountPixelShapes(root?: ParentNode | null): EffectHandle;
