/**
 * The "look here" blink for a pin that was just focused — kept standalone so
 * switching it off or retuning it never touches map code: the map only hands
 * over the marker's element (see focus() in itineraryMap.ts).
 */
export const PIN_FLASH = {
  /** false → focusing still zooms and centres; it just skips the blink. */
  enabled: true,
  /** Blinks per focus. */
  blinks: 5,
  /** Milliseconds per half blink (fade out, back). */
  halfPeriodMs: 180,
  /** Opacity at the darkest point of a blink. */
  minOpacity: 0.1,
  /** Start delay in ms */
  startDelay: 250,
};

/** Blinks `el` `PIN_FLASH.blinks` times. No-op when the effect is disabled,
 * the user prefers reduced motion, or the step has no pin to blink. */
export function flashPin(el?: HTMLElement | null): void {
  if (!PIN_FLASH.enabled || !el) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // Restart cleanly on repeat clicks instead of stacking animations.
  el.getAnimations().forEach((a) => a.cancel());
  el.animate(
    [{ opacity: 1 }, { opacity: PIN_FLASH.minOpacity }, { opacity: 1 }],
    {
      duration: PIN_FLASH.halfPeriodMs * 2,
      iterations: PIN_FLASH.blinks,
      easing: "ease-in-out",
      delay: PIN_FLASH.startDelay,
    },
  );
}
