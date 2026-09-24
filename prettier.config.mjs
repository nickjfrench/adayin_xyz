/**
 * @see https://prettier.io/docs/configuration
 * @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions}
 */
export default {
  semi: false,
  singleQuote: true,
  printWidth: 100,
  // Must stay last: the Tailwind plugin wraps the other printers to reorder class lists.
  // `prettier-plugin-astro` is pinned to 0.14 because 1.x emits a JSX-shaped AST that
  // `prettier-plugin-tailwindcss` cannot traverse, which silently stops its class sorting
  // in `.astro` files.
  plugins: ['prettier-plugin-astro', 'prettier-plugin-svelte', 'prettier-plugin-tailwindcss'],
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
  tailwindStylesheet: './web/src/styles/global.css',
}
