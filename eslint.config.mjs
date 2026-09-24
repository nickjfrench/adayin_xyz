import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import globals from 'globals'

// Covers the workspace-root files only (`eslint.config.mjs`, `prettier.config.mjs`,
// `eslint.base.mjs`). ESLint resolves the nearest config per file, so `studio/`, `web/`
// and `packages/map-core/` use their own `eslint.config.mjs` instead of this one.
export default [
  { files: ['**/*.{js,mjs,cjs}'], languageOptions: { globals: { ...globals.node } } },

  js.configs.recommended,
  prettier,
]
