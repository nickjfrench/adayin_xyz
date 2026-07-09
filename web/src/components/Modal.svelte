<script>
  import { fly, fade } from 'svelte/transition';

  let { open = $bindable(false), children, onclose } = $props();

  /** @type {HTMLDialogElement} */
  let dialog;

  $effect(() => {
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  });

  function handleBackdropClick(e) {
    if (e.target === dialog) {
      onclose?.();
    }
  }

  function handleClose() {
    onclose?.();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<dialog
  bind:this={dialog}
  onclose={handleClose}
  onclick={handleBackdropClick}
  class="m-auto max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl border border-white/25 bg-white/60 shadow-lg backdrop-blur-2xl backdrop:bg-sea-900/25 backdrop:backdrop-blur-2xs"
>
  {#if open}
    <div class="relative overflow-auto p-6">
      <button
        type="button"
        tabindex="-1"
        onclick={() => onclose?.()}
        class="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/40 text-sea-700 backdrop-blur-sm hover:bg-white/60 cursor-pointer transition-colors"
        aria-label="Close"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div in:fly={{ y: 20, duration: 200 }} out:fade={{ duration: 150 }}>
        {@render children()}
      </div>
    </div>
  {/if}
</dialog>
