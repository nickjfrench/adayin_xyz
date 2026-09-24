/**
 * Glyph markup for a stop dot — one source of truth for the rail timeline
 * (StopCard.astro) and the map pins (itineraryMap.ts), so the two can't drift.
 *
 * Icons arrive from Sanity as Font Awesome SVGs carrying their own sizing
 * (`style="width:1.5em;height:1em"`), which beats any utility class on a
 * wrapper — leaving the glyph oversized and off-centre. `stopGlyph` strips
 * that sizing and hands the icon to the caller's `.stop-glyph` box (see
 * global.css), so the box alone decides the size and the dot's flex layout
 * centres it.
 */

export interface StopGlyphSource {
  /** `_type` of the stop doc: stop | travel | startLocation | endLocation. */
  type: string
  /** Travel-leg icon (`travelType.icon.svg`); only travel legs render it. */
  icon?: string | null
}

/** Standby glyph for a plain stop — the pin the rail timeline uses. */
const PIN_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>'

/** Standby glyph for a travel leg without an icon of its own. */
const ARROW = '<span class="text-[10px] font-bold">→</span>'

const SVG_TAG = /^\s*<svg\b[^>]*>/i
// Only bare width/height/style attributes match — `stroke-width` stays put.
const OWN_SIZING = /\s(?:style|width|height)=("[^"]*"|'[^']*')/gi

/**
 * Drops an icon's own width/height/style so the wrapper's size utilities
 * decide its box — what any Sanity icon needs before CSS can size it.
 */
function stripIconSizing(svg: string): string {
  return svg.replace(SVG_TAG, (tag) => tag.replace(OWN_SIZING, ''))
}

function iconBox(svg: string, boxClass: string): string {
  // `block` matters: an inline-level svg sits on a text baseline inside the box
  // and drifts by the descender; the box owns both axes instead.
  return `<span class="${boxClass} [&>svg]:block [&>svg]:h-full [&>svg]:w-full">${stripIconSizing(svg)}</span>`
}

/**
 * Inner markup for a stop dot: the type's glyph in a `boxClass`-sized
 * `.stop-glyph` span, or the bare start/end letter.
 */
export function stopGlyph(stop: StopGlyphSource, boxClass: string): string {
  switch (stop.type) {
    case 'startLocation':
      return 'S'
    case 'endLocation':
      return 'E'
    case 'travel':
      return stop.icon ? iconBox(stop.icon, boxClass) : ARROW
    default:
      return iconBox(PIN_ICON, boxClass)
  }
}
