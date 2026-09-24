import js from '@eslint/js'
import astro from 'eslint-plugin-astro'
import svelte from 'eslint-plugin-svelte'
import prettier from 'eslint-config-prettier/flat'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { pinTsconfigRootDir, typescriptRecommended } from '../eslint.base.mjs'

export default [
  // Global ignores, relative to this file. `pnpm lint` runs from the workspace root,
  // so build output and Astro's generated directory must be excluded here.
  { ignores: ['dist/', '.astro/'] },

  pinTsconfigRootDir(import.meta.dirname),

  js.configs.recommended,
  ...typescriptRecommended(),

  ...astro.configs.recommended,
  ...svelte.configs.recommended,

  // svelte-eslint-parser delegates `<script lang="ts">` to espree unless a parser is
  // given, which fails on TypeScript syntax (web/src/components/PortableLink.svelte).
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      globals: { ...globals.browser },
    },
  },

  // astro.config.mjs and friends read process.env.
  { files: ['**/*.{js,mjs,cjs,ts}'], languageOptions: { globals: { ...globals.node } } },

  // Must follow svelte.configs.recommended: it switches off the svelte rules Prettier owns.
  ...svelte.configs.prettier,
  prettier,
]
