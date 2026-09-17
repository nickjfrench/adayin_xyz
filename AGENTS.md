# Agents.md file for ADayIn codebase

## Project Overview

A Day In XYZ is a travel blog and itinerary listing for tailored and tested day trips with realistic expectations on what you can achieve in one day.

This is a static site generated with Astro with content built from Sanity CMS. 
Sanity schema's and custom components are found in `studio` and Astro code is found in `web`.

Sanity Studio and the Astro site are delivered via Cloudflare Pages.

## Development Process

1. Clarify and ask questions.
2. Investigate codebase and look for shared implementations so you don't reinvent the wheel.
3. Continue with development and testing.
4. Always review your own work thoroughly by looking at the uncommited git diff.

## Rules

- Don't commit, stash, or push anything unless explicitly asked.
- Use pnpm always, never use NPM. The repo is a pnpm workspace: `studio`, `web`, and `packages/map-core` — the shared map kit (MapLibre rendering + renderer-free stored-contract logic) consumed by both apps. `pnpm --filter` selects by package name (`adayin-xyz-studio`, `adayin-xyz-web`, `@adayin/map-core`), not by directory.
- Don't try to run the server, check if the ports are running (4321 for web) and (3333 for sanity) and connect via that.
- Don't try to connect to Sanity via the browser, it requires auth. Ask the user to troubleshoot.

## Map kit (`packages/map-core`)

- Shared by `studio` and `web` as plain TS source — no build step. Subpaths: `@adayin/map-core` (alias of `/core`) — types, the stored member contract, geometry; `/geojson` — stored↔GeoJSON conversion and circle maths; `/dom` — DOM-only effects; `/basemap` — MapLibre bootstrap. `core` and `geojson` are renderer-free, so build-time/SSR code may import them (`web`'s mapFocus does); `dom` and `basemap` are browser-only.
- `core.ts` — renderer-free and DOM-free logic: types, the stored contract (`serializeMapFeature`, `mapFeatureBounds`, `mapFeaturesSignature`), geometry. The vitest suite runs in plain Node, so nothing browser-only belongs here.
- `geojson.ts` — pure conversion between stored items and GeoJSON features, plus `circleRing`/`distanceMeters` on the sphere stored radii were measured on (Leaflet's R = 6371000).
- `dom.ts` — DOM-only helpers (`tooltipText`, `textLabelElement`, `dotElement`, `flashPin`); `basemap.ts` — client-only: the MapLibre worker URL and the one basemap style (OpenFreeMap Bright).
- The studio draws and edits regions with `@geoman-io/maplibre-geoman-free` under `studio/components/map/`: `StopMapInput.tsx` is the combined pin+region editor, `LocationInput.tsx` the plain pin editor, `shapes.ts` the stored↔Geoman bridge, `googlePlaces.tsx` the renderer-agnostic Places search, `mapConfig.ts` the studio's values. Stored items are always merged, never rebuilt: untouched fields (labels, keys) stay verbatim.
- Share the mechanism, own the policy: a helper belongs in the kit when both apps need the same behaviour, but values, options and triggers stay at the call site in each app (e.g. `PIN_FLASH` in `web/src/utils/itineraryMap.ts` and `studio/components/map/mapConfig.ts`).
- Studio-only (Geoman, Sanity inputs) and web-only (Astro/Svelte glue) code stays in its app.

## UI Styling

- For anything in `web/` match the styling outlined in `web/STYLING.md`.
- Prefer Tailwind CSS and Astro Components over custom CSS classes.
- Use Svelte Components when state and interactivity needs to be managed outside what can be achieved with simple in JS and Astro.
