<script>
  import { onMount } from 'svelte';
  import StopModal from './StopModal.svelte';

  /** @type {Array<import('../utils/sanity').Post['stops'][number] & {imageUrl?: string}>} */
  let { stops = [], recommendations = [] } = $props();

  let selectedStop = $state(null);

  onMount(() => {
    const stopEls = document.querySelectorAll('.stop-title[data-stop-index]');
    const recEls = document.querySelectorAll('[data-recommendation-index]');

    function handleStopClick(e) {
      const idx = Number(e.currentTarget.dataset.stopIndex);
      if (idx >= 0 && idx < stops.length) {
        selectedStop = stops[idx];
      }
    }

    function handleRecClick(e) {
      const idx = Number(e.currentTarget.dataset.recommendationIndex);
      if (idx >= 0 && idx < recommendations.length) {
        selectedStop = recommendations[idx];
      }
    }

    stopEls.forEach(el => el.addEventListener('click', handleStopClick));
    recEls.forEach(el => el.addEventListener('click', handleRecClick));
    return () => {
      stopEls.forEach(el => el.removeEventListener('click', handleStopClick));
      recEls.forEach(el => el.removeEventListener('click', handleRecClick));
    };
  });
</script>

<StopModal bind:stop={selectedStop} onclose={() => selectedStop = null} />
