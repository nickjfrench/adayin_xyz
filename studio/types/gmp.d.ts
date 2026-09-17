import type {} from 'react'

// <gmp-place-autocomplete> is a Google Maps JS custom element; @types/google.maps
// does not declare it under React 19's JSX namespace.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'gmp-place-autocomplete': any
    }
  }
}
