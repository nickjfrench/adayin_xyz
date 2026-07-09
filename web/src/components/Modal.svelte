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
  class="m-auto max-w-2xl rounded-2xl bg-foam p-6 backdrop:bg-sea-900/60 backdrop:backdrop-blur-sm"
>
  {#if open}
    <div in:fly={{ y: 20, duration: 200 }} out:fade={{ duration: 150 }}>
      {@render children()}
    </div>
  {/if}
</dialog>
