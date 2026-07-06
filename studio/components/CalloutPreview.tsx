import {useClient} from 'sanity'
import {Stack, Text} from '@sanity/ui'
import {useEffect, useState} from 'react'

export function CalloutPreview(props: {kind?: {_ref?: string}; body?: string}) {
  const client = useClient({apiVersion: '2025-03-01'})
  const [label, setLabel] = useState<string | null>(null)
  const ref = props.kind?._ref

  useEffect(() => {
    if (!ref) {
      setLabel(null)
      return
    }
    let cancelled = false
    client.fetch<{label?: string} | null>('*[_id == $id][0]{label}', {id: ref}).then((doc) => {
      if (!cancelled) setLabel(doc?.label ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [ref, client])

  return (
    <Stack space={2}>
      <Text size={1} weight="semibold">
        {label ?? ref ?? 'Callout'}
      </Text>
      {props.body && (
        <Text size={1} muted>
          {props.body}
        </Text>
      )}
    </Stack>
  )
}
