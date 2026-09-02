import {useClient} from 'sanity'
import {Stack, Text} from '@sanity/ui'
import {useEffect, useState} from 'react'

export function CalloutPreview(props: {kind?: {_ref?: string}; body?: unknown}) {
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
  const bodyText = Array.isArray(props.body)
    ? props.body
        .map((b: {children?: Array<{text?: string}>}) =>
          (b.children ?? []).map((c) => c.text ?? '').join(''),
        )
        .join(' ')
    : typeof props.body === 'string'
      ? props.body
      : ''

  return (
    <Stack space={2}>
      <Text size={1} weight="semibold">
        {label ?? ref ?? 'Callout'}
      </Text>
      {bodyText && (
        <Text size={1} muted>
          {bodyText}
        </Text>
      )}
    </Stack>
  )
}
