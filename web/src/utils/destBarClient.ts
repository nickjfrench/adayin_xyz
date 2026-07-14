/**
 * Client-side helpers shared by every page that renders a DestBar.
 * All selectors are scoped to the current document.
 */

/** Toggle active/inactive chip styles to reflect the selected slug. */
export function setActiveChip(slug: string) {
  document.querySelectorAll<HTMLElement>(".dest-jump").forEach((chip) => {
    const isActive = chip.dataset.dest === slug;
    chip.classList.toggle("bg-sea-500", isActive);
    chip.classList.toggle("text-white", isActive);
    chip.classList.toggle("font-semibold", isActive);
    chip.classList.toggle("border", !isActive);
    chip.classList.toggle("border-sea-100", !isActive);
    chip.classList.toggle("text-sea-700", !isActive);
    chip.classList.toggle("font-medium", !isActive);
    chip.classList.toggle("hover:bg-sea-600", isActive);
    chip.classList.toggle("hover:bg-sea-50", !isActive);
    chip.classList.toggle("hover:border-sea-300", !isActive);
  });
}

/** Show/hide `.post-card` elements and update heading + empty state. */
export function filterGrid(slug: string, city?: string) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".post-card"));
  const heading = document.getElementById("stories-heading");
  const empty = document.getElementById("stories-empty");
  let visible = 0;
  cards.forEach((card) => {
    const show = slug === "all" || card.dataset.destination === slug;
    card.hidden = !show;
    if (show) visible++;
  });
  if (heading) heading.textContent = slug === "all" ? "Latest day plans" : `A day in ${city ?? ""}`;
  if (empty) empty.hidden = visible !== 0;
}

/** Push the current selection into the URL without a full navigation. */
export function syncUrl(slug: string) {
  const url = new URL(window.location.href);
  if (slug === "all") url.searchParams.delete("dest");
  else url.searchParams.set("dest", slug);
  history.replaceState({}, "", url);
}

/**
 * Wire up `.dest-jump` chip click handlers and apply the deep-link from `?dest=`.
 *
 * `onSelect` is called whenever a chip is activated — use it to hook
 * page-specific behaviour (e.g. hero crossfade on the home page).
 */
export function initDestBar(
  onSelect?: (slug: string, city?: string) => void,
) {
  function select(slug: string) {
    setActiveChip(slug);
    const chip = slug === "all" ? null : document.querySelector<HTMLElement>(`.dest-jump[data-dest="${slug}"]`);
    const city = chip?.dataset.city;
    filterGrid(slug === "all" ? "all" : slug, city);
    onSelect?.(slug, city);
    syncUrl(slug);
  }

  // Chip click handlers
  document.querySelectorAll<HTMLElement>(".dest-jump").forEach((chip) => {
    chip.addEventListener("click", () => select(chip.dataset.dest!));
  });

  // Deep-link: /?dest=slug pre-selects a destination
  const initial = new URL(window.location.href).searchParams.get("dest");
  if (initial) {
    select(initial);
  } else {
    setActiveChip("all");
  }

  // Expose select so the hero dropdown (or anything else) can drive the bar.
  (window as any).__destBarSelect = select;
}
