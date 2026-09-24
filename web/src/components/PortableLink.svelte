<script lang="ts">
  // Portable Text link mark override — renders links that open in a new tab.
  import type { MarkComponentProps } from '@portabletext/svelte'
  import type { Snippet } from 'svelte'

  let { portableText, children }: { portableText: MarkComponentProps; children?: Snippet } =
    $props()

  const value = $derived(
    portableText.value as { href?: string; url?: string; link?: string } | undefined,
  )
  const href = $derived(value?.href ?? value?.url ?? value?.link)
</script>

{#if typeof href === 'string'}
  <a {href} target="_blank" rel="noopener noreferrer">{@render children?.()}</a>
{:else}
  {@render children?.()}
{/if}
