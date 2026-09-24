import tseslint from 'typescript-eslint'

/** Files the TypeScript parser and the typescript-eslint rules apply to. */
export const TYPESCRIPT_FILES = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts']

/**
 * Pins the `tsconfigRootDir` the TypeScript parser falls back to.
 *
 * Reading `tseslint.configs.recommended` (see below) registers the directory of the config
 * file doing the read as a candidate `tsconfigRootDir`. With one config file per workspace
 * package that inference collects several candidates and typescript-eslint refuses to parse
 * at all, so each package pins its own directory. `.astro` and `.svelte` need it too: their
 * parsers delegate inline `<script>` blocks to the TypeScript parser.
 */
export function pinTsconfigRootDir(rootDir) {
  return { files: ['**/*'], languageOptions: { parserOptions: { tsconfigRootDir: rootDir } } }
}

/**
 * typescript-eslint's recommended rules, registered under `namespace`.
 *
 * `tseslint.configs.recommended` registers the plugin as `@typescript-eslint` and its
 * rule objects carry no `files` key. Sanity's studio preset registers the same plugin
 * as `typescript/` for the same files, so studio passes that namespace to keep one rule
 * instance per rule — otherwise every overlapping rule reports twice.
 */
export function typescriptRecommended(namespace = '@typescript-eslint') {
  const rename = (rule) => rule.replace(/^@typescript-eslint\//, `${namespace}/`)

  return [
    {
      files: TYPESCRIPT_FILES,
      languageOptions: { parser: tseslint.parser, sourceType: 'module' },
      plugins: { [namespace]: tseslint.plugin },
    },
    ...tseslint.configs.recommended
      .filter((config) => config.rules)
      .map((config) => ({
        files: config.files ?? TYPESCRIPT_FILES,
        rules: Object.fromEntries(
          Object.entries(config.rules).map(([rule, option]) => [rename(rule), option]),
        ),
      })),
  ]
}
