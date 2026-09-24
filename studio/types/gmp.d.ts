import type { Ref } from 'react'

// <gmp-place-autocomplete> is a Google Maps JS custom element; @types/google.maps
// does not declare it under React 19's JSX namespace. Only the props the search
// overlay passes are described.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'gmp-place-autocomplete': {
        ref?: Ref<google.maps.places.PlaceAutocompleteElement | null>
        'ongmp-select'?: (event: google.maps.places.PlacePredictionSelectEvent) => void
      }
    }
  }
}
