// @ts-check

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import sanity from '@sanity/astro';
import svelte from '@astrojs/svelte';

// astro.config.mjs runs before Astro's env loading, so read PUBLIC_* via Vite's loadEnv.
const { PUBLIC_SANITY_PROJECT_ID, PUBLIC_SANITY_DATASET } = loadEnv(
	process.env.NODE_ENV ?? 'development',
	process.cwd(),
	'',
);

// https://astro.build/config
export default defineConfig({
	integrations: [
		sanity({
			projectId: PUBLIC_SANITY_PROJECT_ID,
			dataset: PUBLIC_SANITY_DATASET,
			useCdn: false,
		}),
		svelte(),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
