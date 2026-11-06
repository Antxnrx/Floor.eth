import { useEffect, type RefObject } from "react";
import { mountPixelShapes } from "./pixelShapes";

/**
 * Mounts the wireframe shapes declared under `root` and tears them down again.
 *
 * The effect owns a canvas it appends inside each `[data-pixel-shape]` host,
 * which React does not know about — so every host must stay a childless leaf in
 * the markup. Re-running on a route change is deliberate: the hosts are new
 * elements by then and the old handles are pointing at detached nodes.
 */
export function usePixelShapes(root: RefObject<HTMLElement | null>, key: string): void {
  useEffect(() => {
    const shapes = mountPixelShapes(root.current);
    return () => shapes.destroy();
    // `root` is a ref and never changes identity; `key` is the remount signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
