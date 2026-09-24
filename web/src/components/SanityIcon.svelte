<script>
  /**
   * Inline icon from a Sanity icon document. Icon picker stores SVG markup, not
   * a URL, so the only way to render it is `{@html}` — the markup is written in
   * the Studio, never by a visitor. The wrapper's `[&>svg]` rule sizes whatever
   * the markup contains; callers own size and colour.
   */
  let { svg, class: className = '' } = $props()
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- Studio-authored icon markup, not user input -->
<span class="inline-block [&>svg]:h-full [&>svg]:w-full {className}">{@html svg}</span>
