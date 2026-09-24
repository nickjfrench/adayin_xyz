/**
 * Staged-file gate, run by the `.husky/pre-commit` hook.
 *
 * One glob per file class, because lint-staged runs different globs in parallel
 * workers: with an overlapping `'*'` glob an `eslint --fix` can land after the
 * `prettier --write` that reformatted the same file, committing bytes that fail
 * `pnpm format:check`. Inside a glob the array runs serially, so ESLint's fixes
 * are in place before Prettier owns the final bytes of everything it can parse.
 * Commands resolve the workspace configs from the repo root, not the editor's.
 */
const CODE_FILES = '*.{js,mjs,cjs,ts,tsx,svelte,astro}'

export default {
  [CODE_FILES]: ['eslint --fix --no-warn-ignored', 'prettier --write --ignore-unknown'],
  [`!(${CODE_FILES})`]: 'prettier --write --ignore-unknown',
}
