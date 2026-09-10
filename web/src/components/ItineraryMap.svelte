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
  onMount(() => {
    const cleanup = createItineraryMap(container, stops);
    return () => cleanup?.();
  });
</script>

<div bind:this={container} class="h-80 w-full" role="region" aria-label="Itinerary route map"></div>
