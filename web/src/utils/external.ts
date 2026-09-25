/**
 * Outbound-link policy shared by `Link.astro` and `Link.svelte`: which hrefs
 * leave the site, the Umami attributes that record the click, and the ↗ icon
 * markup. Both components are thin wrappers over this module — Astro pages and
 * Svelte islands have to render the anchor themselves, so everything that can
 * be shared (detector, attrs, icon, prop shape) lives here.
 */

/** Umami event name for outbound clicks — see the Events page in the dashboard. */
export const OUTBOUND_EVENT = 'outbound-link-click'

/** Props both `Link` flavours accept. */
export interface LinkProps {
  href: string
  /** Umami event name; `null` renders the link untracked. */
  event?: string | null
  /** Render the ↗ icon marking the link as external. */
  showIcon?: boolean
  /** Caller-provided layout classes. */
  class?: string
}

/** What an outbound anchor adds to the caller's href and class. */
export interface ExternalLinkAttrs {
  target: '_blank'
  rel: string
  'data-umami-event'?: string
  'data-umami-event-url'?: string
}

/**
 * True for hrefs that point at another origin: absolute `http(s)://` URLs and
 * protocol-relative `//host/path` ones. Relative paths stay on site, and
 * `mailto:`/`tel:` never get a new tab. A fully spelled-out adayin.xyz URL
 * counts as external too — content links internally with relative paths.
 */
export function isExternalUrl(href: string | null | undefined): boolean {
  return typeof href === 'string' && /^(?:https?:)?\/\//i.test(href.trim())
}

/**
 * `_blank` + `noopener noreferrer`, plus the Umami pair its tracker binds on
 * click (docs.umami.is/docs/guides/track-outbound-links).
 */
export function externalLinkAttrs(href: string, event?: string | null): ExternalLinkAttrs {
  const name = event === null ? null : (event ?? OUTBOUND_EVENT)
  return {
    target: '_blank',
    rel: 'noopener noreferrer',
    ...(name === null ? {} : { 'data-umami-event': name, 'data-umami-event-url': href }),
  }
}

/**
 * The ↗ icon flagging an outbound link, as markup so one definition serves both
 * flavours (`set:html` / `{@html}`). Classes: a font-relative `ml` gap, `size`
 * tracks the surrounding text size, `align` keeps it sitting on the baseline.
 */
export const EXTERNAL_ICON_SVG =
  '<svg class="ml-[0.25em] inline-block size-[1em] align-[-0.125em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>'
