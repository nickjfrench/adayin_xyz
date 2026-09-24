# Styling Patterns

## Header Variant System

The `<header>` element carries a `data-variant="light" | "dark"` attribute that is the **single source of truth** for text color and shadow across the entire nav.

- **Light** — white text with etched shadow, used over dark hero images.
- **Dark** — `sea-800` text with light shadow, used on light-background pages.

### How it works

1. **Initial render:** The Astro `variant` prop sets `data-variant` at build time.
2. **Scroll-driven flip:** A JS `scroll` handler in `Header.astro` watches the hero section. When the hero scrolls past the header, it sets `header.dataset.variant = "dark"`; when the hero is visible again, `"light"`.
3. **CSS targeting the header itself:** Because the header IS the `group`, `group-data-*` would look for a _parent_ group. Instead, the header's own color and text-shadow are set via CSS `[data-variant]` selectors in a `<style is:global>` block.
4. **CSS targeting descendants:** All child elements (Logo, GlassLink, summary) use Tailwind's `group-data-[variant=dark]:…` / `group-data-[variant=light]:…` modifiers. The header has `class="group …"` so these resolve correctly.

### Mobile dropdown

The mobile dropdown's `GlassLink` instances pass `variant="dark"` explicitly. Since `data-variant` is always present on the header, `group-data-[variant=dark]` styles apply. The explicit prop means the component doesn't emit `group-data-[variant=light]` classes — dark styling persists regardless of the header's current variant.

## Scroll-Driven Compact State

A JS-toggled `.scrolled` class reduces header padding and logo size when `scrollY > 12px`. Hysteresis (dead band between 6 and 12px) prevents flutter. Defined in the `<style is:global>` block in `Header.astro`.

## Glass Nav Pattern

The nav bar uses a translucent glass effect:

```text
border-white/25 bg-foam/25 backdrop-blur-md shadow-lg
```

The dark variant overrides the shadow tint: `group-data-[variant=dark]:shadow-sea-900/5`.

## Custom Color Palette

Defined in `src/styles/global.css` via Tailwind v4's `@theme` block with OKLCH values:

| Token    | Hue     | Purpose                                                                           |
| -------- | ------- | --------------------------------------------------------------------------------- |
| `sea-*`  | 185°    | Teal brand + UI (50–900)                                                          |
| `sand-*` | 80°     | Warm golden accents (50–500)                                                      |
| `foam`   | 80°     | Near-white background tint                                                        |
| `deep`   | 185°    | Near-black with teal cast                                                         |
| `stop-*` | 48–346° | Categorical itinerary map colors — one of six hues per stop (pins, regions, arcs) |

## Component Conventions

- **`Logo`** and **`GlassLink`** accept a `variant` prop (`"light" | "dark"`, default `"dark"`).
- Both use `group-data-[variant=dark]:…` for runtime color/shadow flips driven by the header's `data-variant`.
- Build-time ternaries handle the initial variant; `group-data-*` handles the scroll-driven flip.

## Outbound Links

Anchors go through `Link.astro`, or `Link.svelte` inside islands. Both wrap the same policy in `src/utils/external.ts` and auto-detect the href:

- **External** — absolute `http(s)://` or protocol-relative `//host`: `target="_blank"`, `rel="noopener noreferrer"`, the ↗ icon, and the Umami pair `data-umami-event="outbound-link-click"` + `data-umami-event-url` that the script in `BaseLayout.astro` records as an outbound event.
- **On-site, `mailto:`, `tel:`** — plain anchor with the caller's classes only.

Options: `showIcon={false}` drops the ↗ where another icon already signals the destination (`MapLink` does this), `event={null}` renders the link untracked, `class` is the caller's layout. Put new behaviour in `utils/external.ts`, not in the two templates — islands can't render Astro components, so the anchor itself is duplicated and only the shared module stays in sync.
