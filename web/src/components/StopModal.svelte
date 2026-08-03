<script>
  import Modal from './Modal.svelte';

  /**
   * Stop detail modal — works with any of the 4 stop document types.
   *
   * Usage:
   *   <StopModal stop={selectedStop} onclose={() => selectedStop = null} />
   *
   * The `stop` prop is a dereferenced stop/travel/startLocation/endLocation doc.
   * Null = closed. Set to a stop object to open.
   */

  let { stop = $bindable(null), onclose } = $props();

  let show = $state(false);

  $effect(() => {
    show = stop != null;
  });

  function close() {
    stop = null;
    onclose?.();
  }

  const isTravel = $derived(stop?._type === 'travel');
  const isStart = $derived(stop?._type === 'startLocation');
  const isEnd = $derived(stop?._type === 'endLocation');

  const mapsLink = $derived(
    stop?.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`
      : null
  );

  const hasMeta = $derived(
    stop && (stop.time || stop.duration || (stop.cost != null && stop.cost > 0))
  );

  const hasBody = $derived(
    stop && (stop.longDesc || stop.callouts?.length > 0 || stop.link || mapsLink)
  );
</script>

{#snippet body()}
  {#if stop.longDesc}
    <p class="text-sm italic text-sea-600">{stop.longDesc}</p>
  {/if}

  {#if stop.callouts?.length > 0}
    <div class="mt-4 flex flex-col gap-2">
      {#each stop.callouts as callout}
        <p class="flex items-start gap-2 text-sm text-sea-700">
          {#if callout.kind?.icon?.svg}
            <span class="inline-block h-3.5 w-3.5 shrink-0 mt-0.5 [&>svg]:h-full [&>svg]:w-full {callout.kind?.labelColor ?? 'text-sand-500'}">{@html callout.kind.icon.svg}</span>
          {:else}
            <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full {callout.kind?.labelColor ?? 'bg-sand-400'}"></span>
          {/if}
          <span>{callout.body}</span>
        </p>
      {/each}
    </div>
  {/if}

  {#if stop.link}
    <div class="mt-4">
      <a href={stop.link} target="_blank" rel="noopener noreferrer" class="inline-block font-display text-sm font-medium text-sea-600 hover:text-sea-500">
        Visit link →
      </a>
    </div>
  {/if}

  {#if mapsLink}
    <div class="mt-4">
      <a href={mapsLink} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-xs text-sea-500 transition-colors hover:text-sea-700">
        <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
        {stop.address}
      </a>
    </div>
  {/if}
{/snippet}

<Modal bind:open={show} onclose={close}>
  {#if stop}
    <div class="-m-6">
      <!-- Image banner with hero-style gradient -->
      <div class="relative">
        {#if stop.imageUrl}
          <img src={stop.imageUrl} alt={stop.title ?? ''} class="aspect-[21/9] w-full object-cover" />
        {:else}
          <div class="aspect-[21/9] w-full bg-gradient-to-br from-sea-200 to-sea-300"></div>
        {/if}
        <div class="absolute inset-0 bg-gradient-to-t from-sea-900/80 via-sea-900/30 to-sea-900/10"></div>

        <!-- Type badge + Title — overlaid on image -->
        <div class="absolute inset-x-0 bottom-0 z-10 px-6 pb-8">
          {#if isStart}
            <span class="inline-flex items-center gap-2 rounded-full bg-green-500/95 px-3 py-1 font-display text-xs font-semibold uppercase tracking-wide text-white ring-1 ring-white/20">
              Start location
            </span>
          {:else if isEnd}
            <span class="inline-flex items-center gap-2 rounded-full bg-sand-400/95 px-3 py-1 font-display text-xs font-semibold uppercase tracking-wide text-white ring-1 ring-white/20">
              End location
            </span>
          {:else if isTravel && stop.travelType?.label}
            <span class="inline-flex items-center gap-2 rounded-full bg-sea-500/95 px-3 py-1 font-display text-xs font-semibold uppercase tracking-wide text-white ring-1 ring-white/20">
              {#if stop.travelType.icon?.svg}
                <span class="inline-block h-3 w-3 [&>svg]:h-full [&>svg]:w-full">{@html stop.travelType.icon.svg}</span>
              {/if}
              {stop.travelType.label}
            </span>
          {:else if stop.stopType?.label}
            <span class="inline-flex items-center gap-2 rounded-full bg-sea-500/95 px-3 py-1 font-display text-xs font-semibold uppercase tracking-wide text-white ring-1 ring-white/20">
              {#if stop.stopType.icon?.svg}
                <span class="inline-block h-3 w-3 [&>svg]:h-full [&>svg]:w-full">{@html stop.stopType.icon.svg}</span>
              {/if}
              {stop.stopType.label}
            </span>
          {:else}
            <span class="inline-flex items-center gap-2 rounded-full bg-sea-500/95 px-3 py-1 font-display text-xs font-semibold uppercase tracking-wide text-white ring-1 ring-white/20">
              Stop
            </span>
          {/if}

          {#if stop.title}
            <h2 class="mt-3 font-display text-2xl font-semibold leading-snug text-white drop-shadow-md">{stop.title}</h2>
          {/if}
        </div>
      </div>

      <!-- Glass metadata bar -->
      {#if hasMeta}
      <div class="relative z-10 -mt-5 mx-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-white/90 px-5 py-3 text-sm font-medium text-sea-700 shadow-lg backdrop-blur-sm">
        {#if stop.time}
          <span class="inline-flex items-center gap-1.5 text-sea-600">
            <svg class="h-3.5 w-3.5 text-sand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            {stop.time}
          </span>
        {/if}
        {#if stop.duration}
          <span class="text-sea-400">·</span>
          <span class="text-sea-500">{stop.duration}</span>
        {/if}
        {#if stop.cost != null && stop.cost > 0}
          <span class="text-sea-400">·</span>
          <span class="inline-flex items-center gap-1 text-sea-600">
            <svg class="h-3.5 w-3.5 text-sand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            {stop.cost}
          </span>
        {/if}
      </div>

      {/if}

      <!-- Content -->
      {#if hasBody}
      <div class="px-6 pt-5 pb-6">
        {@render body()}
      </div>
      {/if}
    </div>
  {/if}
</Modal>
