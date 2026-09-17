<script>
  import { onMount } from 'svelte';

  /**
   * Ordered slim itinerary items; array index === index in the modal island's
   * stops array (both derive from the same filtered array in [slug].astro).
   * @type {import('../utils/itineraryMap').MapStopItem[]}
   */
  let { stops = [] } = $props();

  let container;
  let backdrop;
  /** @type {import('maplibre-gl').Map | null} */
  let map = $state(null);
  let enlarged = $state(false);

  // MapLibre is a client-only bundle, and most page views never reach this
  // section — so the renderer loads when the placeholder gets close (see the
  // IntersectionObserver below). One promise serves every caller: the observer,
  // "Show on Map" clicks, and unmount cleanup all await the same build.
  let loaded = null;
  let destroyed = false;
  let retryTimer = null;
  let autoRetryUsed = false;
  const RETRY_DELAY_MS = 3000;
  function loadMap() {
    loaded ??= import('../utils/itineraryMap')
      .then(({ createItineraryMap }) => {
        if (destroyed) return null;
        const built = createItineraryMap(container, stops);
        if (!built) return null;
        map = built.map;
        // The page may already be enlarged by the time the bundle lands.
        if (enlarged) map.scrollZoom.enable();
        return built;
      })
      .catch((error) => {
        // A failed chunk request must not poison the memo — one delayed retry
        // re-runs the build (dev-server re-optimization, flaky network), and a
        // "Show on Map" click calls loadMap again whatever happened. The map is
        // progressive enhancement; the page reads fine without it. One automatic
        // retry only: a chunk that is gone for good (stale deploy) must not
        // re-fetch every RETRY_DELAY_MS for as long as the page stays open.
        loaded = null;
        console.error('Itinerary map failed to load', error);
        if (!destroyed && retryTimer === null && !autoRetryUsed) {
          autoRetryUsed = true;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            loadMap();
          }, RETRY_DELAY_MS);
        }
        return null;
      });
    return loaded;
  }

  onMount(() => {
    // "Show on Map" buttons in the stop list (StopCard.astro) hand their click to
    // the map. They are server-rendered and this island mounts after them, hence
    // the query rather than a prop. A click before the map has loaded waits on
    // the same build and then flies.
    const buttons = document.querySelectorAll('[data-show-on-map]');
    const onShowOnMap = async (e) => {
      const index = Number(e.currentTarget.dataset.showOnMap);
      const built = await loadMap();
      built?.focus(index);
    };
    buttons.forEach((el) => el.addEventListener('click', onShowOnMap));

    // One viewport of scroll ahead, so the map is built before it is looked at.
    // The placeholder wrapper already reserves the height, so a late build
    // cannot shift the page (no CLS).
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        // Keep observing until the build actually succeeded: a failed chunk load
        // resets the memo (see loadMap), so a later re-entry can rebuild.
        loadMap().then((built) => {
          if (built || destroyed) observer.disconnect();
        });
      },
      { rootMargin: '800px' },
    );
    observer.observe(container);

    return () => {
      destroyed = true;
      clearTimeout(retryTimer);
      retryTimer = null;
      observer.disconnect();
      buttons.forEach((el) => el.removeEventListener('click', onShowOnMap));
      loaded?.then((built) => built?.destroy());
    };
  });

  function toggleEnlarge() {
    enlarged = !enlarged;
  }

  // While enlarged (fixed overlay): lock page scroll behind it, close on
  // Escape, and close on click-outside. Click-outside lives on document
  // rather than the backdrop div, which keeps the div free of click
  // semantics in markup (a11y) — keyboard users close via Escape.
  $effect(() => {
    // The overlay also closes on Escape / backdrop click, so sync in one
    // place, where every open and close path lands, rather than in the toggle
    // alone. A stale size would crop the view and land focus flights off screen.
    map?.scrollZoom[enlarged ? 'enable' : 'disable']();
    // The frame can outlive the island: a callback queued just before teardown
    // still runs, and MapLibre forbids any call on a removed map. `destroyed` is
    // set before destroy() runs, so it covers the whole teardown window.
    requestAnimationFrame(() => {
      if (!destroyed) map?.resize();
    });
    if (!enlarged) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // A stop modal is a native <dialog> on top; ESC belongs to it first —
      // its own close handler consumes that press. Only close the map once
      // no modal dialog is open.
      if (document.querySelector('dialog[open]')) return;
      enlarged = false;
    };
    // Only a click on the backdrop itself closes; clicks on its children
    // (the map) must not, hence target identity rather than bubbling.
    const onClick = (e) => {
      if (e.target === backdrop) enlarged = false;
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  });
</script>

<!--
   The map div gets `relative z-0`: MapLibre's controls use z-index 2 and its
   popups 3, and the overlay button is z-10, so without a stacking context the
   map chrome would paint over it. Its class string stays STATIC: Svelte
   rewrites `class` on updates, which would wipe the `maplibregl-map` class
   MapLibre adds at runtime and break canvas sizing — all reactive sizing lives
   on the wrapper instead.
-->
<!-- Escape + click-outside handling are programmatic (window keydown,
      document click); the div is purely the modal backdrop. -->
<div
  bind:this={backdrop}
  class={enlarged
    ? 'fixed inset-0 z-50 flex items-center justify-center bg-sea-900/25 backdrop-blur-2xs'
    : ''}
>
  <!-- The wrapper keeps its fixed height until the renderer lands, so lazy
        loading can never shift the page. -->
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
      class="absolute top-2 left-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/80 text-sea-600 shadow-sm backdrop-blur-sm transition hover:bg-white border-1 border-[oklch(0.2_0.03_185)]/30"
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
  /* Hover labels bound in itineraryMap.ts: MapLibre's default white popup,
      retinted to the site's display font and sea palette. Three classes beat
      maplibre-gl.css's own `.maplibregl-popup-content` rules whatever the
      stylesheet order; the tip keeps its default white, so the box reads white. */
  :global(.maplibregl-popup.itinerary-tooltip) {
    max-width: 16rem;
  }

  :global(.maplibregl-popup.itinerary-tooltip .maplibregl-popup-content) {
    max-width: 16rem;
    padding: 3px 8px;
    border-radius: 6px;
    background: #fff;
    color: var(--color-sea-800);
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
    text-align: center;
    white-space: normal;
    box-shadow: 0 1px 4px color-mix(in srgb, var(--color-sea-900) 30%, transparent);
  }
</style>
