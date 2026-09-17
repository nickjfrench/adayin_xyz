// @ts-check

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import sanity from '@sanity/astro';
import svelte from '@astrojs/svelte';

import partytown from '@astrojs/partytown';

import sitemap from '@astrojs/sitemap';

// astro.config.mjs runs before Astro's env loading, so read PUBLIC_* via Vite's loadEnv.
const { PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET } = loadEnv(
    process.env.NODE_ENV ?? 'development',
    process.cwd(),
    '',
);

// The Studio is its own app (studio/), never embedded here, so @sanity/astro's
// "module dedupe" dev plugin has nothing to dedupe. Left enabled it injects the
// Studio's React deps into Vite's optimizeDeps.include, which this workspace has
// no node_modules entry for — six "Failed to resolve dependency" warnings per
// `astro dev`. The plugin checks this flag when it registers itself.
process.env.SANITY_ASTRO_DISABLE_MODULE_DEDUPE ??= '1';

// https://astro.build/config
export default defineConfig({
site: 'https://adayin.xyz',
    integrations: [sanity({
        projectId: PUBLIC_SANITY_PROJECT_ID,
        dataset: PUBLIC_SANITY_DATASET,
        useCdn: false,
        }), svelte(), partytown({
      config: {
        forward: ["dataLayer.push"],
      },
}), sitemap()],
    vite: {
        plugins: [tailwindcss()],
    },
});