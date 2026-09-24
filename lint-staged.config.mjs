/**
 * Staged-file gate, run by the `.husky/pre-commit` hook.
 *
 * ESLint runs first because its fixes can introduce formatting churn; Prettier then owns
 * the final bytes of everything staged, so a commit can never carry IDE-formatted code.
 * Commands resolve the workspace configs from the repo root, not the editor's settings.
 */
export default {
  '*.{js,mjs,cjs,ts,tsx,svelte,astro}': 'eslint --fix --no-warn-ignored',
  '*': 'prettier --write --ignore-unknown',
}
