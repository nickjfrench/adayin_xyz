<script>
  import { onMount } from 'svelte';
  import Modal from './Modal.svelte';
  import Carousel from './Carousel.svelte';

  let { slides = [] } = $props();

  let show = $state(false);
  let startIndex = $state(0);

  onMount(() => {
    const btns = document.querySelectorAll('[data-extend-index]');
    function handleClick(e) {
      const idx = Number(e.currentTarget.dataset.extendIndex);
      startIndex = Math.min(Math.max(idx, 0), slides.length - 1);
      show = true;
    }
    btns.forEach(btn => btn.addEventListener('click', handleClick));
    return () => btns.forEach(btn => btn.removeEventListener('click', handleClick));
  });
</script>

<Modal bind:open={show} onclose={() => show = false}>
  <Carousel items={slides} {startIndex} onclose={() => show = false} />
</Modal>
