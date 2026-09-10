<script>
  import { onMount } from 'svelte';
  import { createItineraryMap } from '../utils/itineraryMap';

  /**
   * Ordered slim itinerary items; array index === index in the modal island's
   * stops array (both derive from the same filtered array in [slug].astro).
   * @type {import('../utils/itineraryMap').MapStopItem[]}
   */
  let { stops = [] } = $props();

  let container;
  /** @type {import('leaflet').Map | null} */
  let map = null;
  let enlarged = $state(false);

  onMount(() => {
    const built = createItineraryMap(container, stops);
    if (!built) return;
    map = built.map;
    return built.destroy;
  });

  function toggleEnlarge() {
    enlarged = !enlarged;
    // Leaflet doesn't observe container resizes; recalculate after the class flip.
    requestAnimationFrame(() => map?.invalidateSize());
  }

  // While enlarged (fixed overlay): lock page scroll behind it, close on Escape.
  $effect(() => {
    if (!enlarged) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') enlarged = false;
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<!--
  The map div gets `relative z-0`: leaflet's panes/controls use z-index 400–1000
  but .leaflet-container has no z-index of its own, so without a stacking
  context they'd paint over the overlay button. That stacking context makes
  leaflet's own .leaflet-container background (#ddd) the blend backdrop for
  tiles (mix-blend-mode: plus-lighter = additive), blowing them out to white —
  the <style> below keeps it transparent so tile colors stay correct.
  Its class string stays STATIC: Svelte rewrites `class` on updates, which
  would wipe leaflet's runtime-added `leaflet-container` class and break tile
  sizing/overflow — all reactive sizing lives on the wrapper instead.
-->
<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
<!-- Escape handling is on window; the div is purely the modal backdrop. -->
<div
  class={enlarged
    ? 'fixed inset-0 z-50 flex items-center justify-center bg-sea-900/25 backdrop-blur-2xs'
    : ''}
  onclick={(e) => {
    if (enlarged && e.target === e.currentTarget) enlarged = false;
  }}
>
  <div class="relative {enlarged ? 'h-[70vh] w-[70vw] shadow-lg shadow-sea-900/10' : 'h-80'}">
    <div
      bind:this={container}
      class="relative z-0 h-full w-full overflow-hidden rounded-xl border border-sea-100 shadow-sm shadow-sea-900/5"
      role="region"
      aria-label="Itinerary route map"
    ></div>
    <button
      type="button"
      onclick={toggleEnlarge}
      aria-label={enlarged ? 'Shrink map' : 'Enlarge map'}
      class="absolute top-2 right-2 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white/80 text-sea-600 shadow-sm backdrop-blur-sm transition hover:bg-white"
    >
      {#if enlarged}
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      {:else}
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      {/if}
    </button>
  </div>
</div>

<style>
  :global(.leaflet-container) {
    background: transparent;
  }
</style>
