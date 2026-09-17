/// <reference types="google.maps" />

// TS 6 no longer picks @types/google.maps up implicitly, hence the reference
// above; and CSS side-effect imports (maplibre-gl.css, maplibre-geoman.css,
// mapInput.css) ship no declarations of their own, which TS 6 reports as
// TS2882 without the wildcard below.
declare module '*.css'

// Vite emits a URL string for `?worker&url` imports (map-core's basemap.ts).
declare module '*?worker&url' {
  const url: string
  export default url
}
