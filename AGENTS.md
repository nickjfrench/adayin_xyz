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
- Use pnpm always, never use NPM. The repo is a pnpm workspace: `studio`, `web`, and `packages/map-core` — the shared map kit (Leaflet render + Leaflet-free logic) consumed by both apps. `pnpm --filter` selects by package name (`adayin-xyz-studio`, `adayin-xyz-web`, `@adayin/map-core`), not by directory.
- Don't try to run the server, check if the ports are running (4321 for web) and (3333 for sanity) and connect via that.
- Don't try to connect to Sanity via the browser, it requires auth. Ask the user to troubleshoot.

## Map kit (`packages/map-core`)

- Shared by `studio` and `web` as plain TS source — no build step. `@adayin/map-core` (alias of `@adayin/map-core/core`) is Leaflet-free and safe to import from build-time/SSR code; the Leaflet half is split behind `@adayin/map-core/render` (primitives, DOM effects) and `@adayin/map-core/tiles`, which are browser-only.
- `core.ts` — Leaflet-free and DOM-free logic: types, geometry, URL helpers. `web`'s mapFocus imports it during the Astro build and the vitest suite runs in plain Node, so nothing browser-only belongs here.
- `render.ts` — the browser half: Leaflet primitives (`dotIcon`, `featureLayer`, `featureBounds`) and DOM effects (`flashPin`); `tiles.ts` — the shared tile layer.
- Share the mechanism, own the policy: a helper belongs in the kit when both apps need the same behaviour, but values, options and triggers stay at the call site in each app (e.g. `PIN_FLASH` in `web/src/utils/itineraryMap.ts` and `studio/components/leaflet/leafletConfig.ts`).
- Studio-only (geoman, Sanity inputs) and web-only (Astro/Svelte glue) code stays in its app.

## UI Styling

- For anything in `web/` match the styling outlined in `web/STYLING.md`.
- Prefer Tailwind CSS and Astro Components over custom CSS classes.
- Use Svelte Components when state and interactivity needs to be managed outside what can be achieved with simple in JS and Astro.
