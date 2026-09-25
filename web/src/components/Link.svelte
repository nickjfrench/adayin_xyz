<script lang="ts">
  /**
   * Svelte twin of `Link.astro` — islands can't render Astro components, so the
   * anchor itself is rebuilt here. Everything shareable (detector, Umami
   * attributes, icon markup, prop shape) comes from `utils/external`.
   */
  import type { Snippet } from 'svelte'
  import {
    EXTERNAL_ICON_SVG,
    externalLinkAttrs,
    isExternalUrl,
    type LinkProps,
  } from '../utils/external'

  interface Props extends LinkProps {
    children?: Snippet
  }

  let { href, event, showIcon = true, class: className, children }: Props = $props()

  const external = $derived(isExternalUrl(href))
  const attrs = $derived(external ? externalLinkAttrs(href, event) : {})
</script>

<!-- eslint-disable svelte/no-at-html-tags -- static icon markup from utils/external, never user input -->
<a {href} class={className} {...attrs}>
  {@render children?.()}{#if external && showIcon}{@html EXTERNAL_ICON_SVG}{/if}
</a>
