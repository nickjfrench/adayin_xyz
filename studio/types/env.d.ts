/// <reference types="google.maps" />

// TS 6 no longer picks @types/google.maps up implicitly, hence the reference
// above; and CSS side-effect imports (leaflet.css, leaflet-geoman.css,
// mapInput.css) ship no declarations of their own, which TS 6 reports as
// TS2882 without the wildcard below.
declare module '*.css'
