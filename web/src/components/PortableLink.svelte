<script lang="ts">
  // Portable Text link mark override. @portabletext/svelte hands the mark
  // definition itself in `portableText.value`, so the href may sit under any of
  // the keys the Studio's link annotation has used. Link settles tab target,
  // icon and Umami event.
  import type { MarkComponentProps } from '@portabletext/svelte'
  import type { Snippet } from 'svelte'
  import Link from './Link.svelte'

  let { portableText, children }: { portableText: MarkComponentProps; children?: Snippet } =
    $props()

  const value = $derived(
    portableText.value as { href?: string; url?: string; link?: string } | undefined,
  )
  const href = $derived(value?.href ?? value?.url ?? value?.link)
</script>

{#if typeof href === 'string'}
  <Link {href}>{@render children?.()}</Link>
{:else}
  {@render children?.()}
{/if}
