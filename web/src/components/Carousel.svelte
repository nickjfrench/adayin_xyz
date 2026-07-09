<script>
  let {
    items = [],
    startIndex = 0,
    onclose,
  } = $props();

  let currentIndex = $state(0);

  $effect(() => {
    currentIndex = Math.min(Math.max(startIndex, 0), Math.max(items.length - 1, 0));
  });

  function prev() {
    if (currentIndex > 0) currentIndex--;
  }

  function next() {
    if (currentIndex < items.length - 1) currentIndex++;
  }

  function handleKeydown(e) {
    if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'Escape') onclose?.();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if items.length > 0}
  {@const slide = items[currentIndex]}
  <div class="relative">
    <!-- Image -->
    {#if slide.imageUrl}
      <img
        src={slide.imageUrl}
        alt={slide.title}
        class="aspect-video w-full rounded-xl object-cover"
      />
    {:else}
      <div class="aspect-video w-full rounded-xl bg-gradient-to-br from-sea-100 to-sea-200"></div>
    {/if}

    <!-- Content -->
    <div class="mt-4">
      <h3 class="font-display text-lg font-semibold text-sea-800">{slide.title}</h3>
      {#if slide.description}
        <p class="mt-2 text-sm leading-relaxed text-sea-700">{slide.description}</p>
      {/if}
      {#if slide.link}
        <a
          href={slide.link}
          target="_blank"
          rel="noopener noreferrer"
          class="mt-3 inline-block font-display text-sm font-medium text-sea-600 hover:text-sea-500"
        >
          Visit link →
        </a>
      {/if}
    </div>

    <!-- Navigation -->
    {#if items.length > 1}
      <div class="mt-4 grid grid-cols-3 items-center">
        <div>
          <button
            onclick={prev}
            disabled={currentIndex === 0}
            class="rounded-lg bg-sea-100 px-3 py-1.5 text-sm font-medium text-sea-700 hover:bg-sea-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-sea-100"
          >
            ← Prev
          </button>
        </div>

        <div class="flex justify-center gap-1.5">
          {#if items.length <= 7}
            {#each items as _, i}
              <button
                onclick={() => currentIndex = i}
                class="h-2 w-2 rounded-full cursor-pointer transition-colors {i === currentIndex ? 'bg-sea-600' : 'bg-sea-200 hover:bg-sea-300'}"
                aria-label="Go to slide {i + 1}"
              ></button>
            {/each}
          {:else}
            <span class="text-sm text-sea-500">{currentIndex + 1} of {items.length}</span>
          {/if}
        </div>

        <div class="flex justify-end">
          <button
            onclick={next}
            disabled={currentIndex === items.length - 1}
            class="rounded-lg bg-sea-100 px-3 py-1.5 text-sm font-medium text-sea-700 hover:bg-sea-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-sea-100"
          >
            Next →
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}
