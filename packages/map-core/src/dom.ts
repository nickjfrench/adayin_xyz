/**
 * Browser-DOM half of the map kit — renderer-free helpers the studio and the
 * web both use. Nothing here may import a map library or touch a map instance:
 * the callers own the elements, the values and the triggers.
 */

/** Tooltip content for a user-authored label. A string handed to a map library
 * as tooltip/popup content is written with `innerHTML` in some renderers, so a
 * label containing markup would render (and execute) as HTML; an element
 * carrying a text node stays text everywhere. */
export function tooltipText(text: string): HTMLElement {
  const el = document.createElement('div')
  el.textContent = text
  return el
}

/**
 * Circular pin as a DOM element — a coloured dot with a white ring — for map
 * markers that take an element rather than an icon definition. Color is
 * required: the studio pin is teal.
 */
export function dotElement(size: number, color: string): HTMLElement {
  const ring = Math.max(2, Math.round(size / 8))
  const el = document.createElement('span')
  el.style.cssText =
    `display:block;width:${size}px;height:${size}px;border-radius:9999px;` +
    `background:${color};box-shadow:0 0 0 ${ring}px #fff, 0 1px 3px rgba(0,0,0,0.35)`
  return el
}

/**
 * White pill carrying a label — 12px/600, text-safe, and deliberately styled
 * inline: it renders over map tiles where the site stylesheet's type scale
 * doesn't sit, and every caller (web label marker, focus tests) wants the same
 * look. The caller owns placement.
 */
export function textLabelElement(label: string): HTMLElement {
  const el = document.createElement('span')
  el.style.cssText =
    'display:inline-block;font:600 12px/1.2 system-ui, sans-serif;color:#1f2937;' +
    'background:rgba(255,255,255,0.9);border:1px solid rgba(0,0,0,0.15);border-radius:4px;' +
    'padding:1px 5px;white-space:nowrap'
  el.textContent = label
  return el
}

/**
 * Blink tuning, owned by each caller so retuning stays next to the call
 * (web's itineraryMap focus(), the studio's place search).
 */
export interface PinFlashOptions {
  /** false → the caller still focuses/zooms and centres; it just skips the blink. */
  enabled: boolean
  /** Blinks per flash. */
  blinks: number
  /** Milliseconds per half blink (fade out, back). */
  halfPeriodMs: number
  /** Opacity at the darkest point of a blink. */
  minOpacity: number
  /** Start delay in ms. */
  startDelay: number
}

/**
 * The "look here" blink for a pin that was just placed or focused. The caller
 * owns the element it hands over, the values and the trigger; this owns the
 * mechanism: fade there and back, restarted on a repeat rather than stacked,
 * and skipped for a user who prefers reduced motion.
 */
export function flashPin(el: HTMLElement | null | undefined, opts: PinFlashOptions): void {
  if (!opts.enabled || !el) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  el.getAnimations().forEach((a) => a.cancel())
  el.animate([{ opacity: 1 }, { opacity: opts.minOpacity }, { opacity: 1 }], {
    duration: opts.halfPeriodMs * 2,
    iterations: opts.blinks,
    easing: 'ease-in-out',
    delay: opts.startDelay,
  })
}
