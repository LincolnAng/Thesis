"use client";

import { useEffect } from "react";
import { applyTextSize, useTextSize } from "@/lib/summary/text-size";

/**
 * Puts the saved text size onto the document.
 *
 * Applied in an effect rather than during render because the server has no idea which size
 * this device chose — rendering it directly would mismatch on hydration. The flash is one
 * frame and only for people who changed it.
 */
export function TextSizeEffect() {
  const [size] = useTextSize();
  useEffect(() => {
    applyTextSize(size);
  }, [size]);
  return null;
}
