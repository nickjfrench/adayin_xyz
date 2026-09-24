/**
 * Vite emits a URL string for `?worker&url` imports; without this declaration
 * TypeScript refuses the import in `basemap.ts`. Each project that compiles
 * map-core source (map-core itself, web, studio) declares it, because ambient
 * module declarations only apply inside their own program.
 */
declare module '*?worker&url' {
  const url: string
  export default url
}
