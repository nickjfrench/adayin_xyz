/**
 * Wire click-to-scroll arrow buttons for a `[data-scroll-chips]` container.
 *
 * Structure expected:
 *   <div data-scroll-chips>
 *     <button data-sc-prev>…</button>
 *     <div data-sc-track class="overflow-x-auto …">…chips…</div>
 *     <button data-sc-next>…</button>
 *   </div>
 *
 * Prev/Next are hidden when the track can't scroll in that direction, and both
 * hidden when the track has no horizontal overflow. Idempotent.
 */
export function initScrollChips(container: HTMLElement): () => void {
  const track = container.querySelector<HTMLElement>('[data-sc-track]');
  const prev = container.querySelector<HTMLElement>('[data-sc-prev]');
  const next = container.querySelector<HTMLElement>('[data-sc-next]');
  if (!track || !prev || !next) return () => {};

  const step = () => Math.max(track.clientWidth * 0.8, 80);

  function update() {
    const max = track.scrollWidth - track.clientWidth;
    const canScroll = max > 1;
    prev.classList.toggle('hidden', !(canScroll && track.scrollLeft > 0));
    next.classList.toggle('hidden', !(canScroll && track.scrollLeft < max - 1));
  }

  const onPrev = (e: Event) => { e.preventDefault(); e.stopPropagation(); track.scrollBy({ left: -step(), behavior: 'smooth' }); };
  const onNext = (e: Event) => { e.preventDefault(); e.stopPropagation(); track.scrollBy({ left: step(), behavior: 'smooth' }); };

  prev.addEventListener('click', onPrev);
  next.addEventListener('click', onNext);
  track.addEventListener('scroll', update, { passive: true });
  const ro = new ResizeObserver(update);
  ro.observe(track);
  update();

  return () => {
    prev.removeEventListener('click', onPrev);
    next.removeEventListener('click', onNext);
    track.removeEventListener('scroll', update);
    ro.disconnect();
  };
}

export function initAllScrollChips(): void {
  document.querySelectorAll<HTMLElement>('[data-scroll-chips]:not([data-sc-initialized])').forEach((c) => {
    c.setAttribute('data-sc-initialized', '');
    initScrollChips(c);
  });
}