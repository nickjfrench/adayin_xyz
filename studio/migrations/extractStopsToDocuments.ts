import {
  defineMigration,
  createOrReplace,
  patch,
  at,
  set,
  del,
  transaction,
  type SanityDocument,
  type MigrationContext,
  type NodeMigration,
} from '@sanity/migrate'

const VALID_TYPES = new Set(['stop', 'travel', 'startLocation', 'endLocation'])

const documentHandler = (async (doc: SanityDocument, context: MigrationContext) => {
  // Drop deprecated recommendation document types entirely.
  if (doc._type === 'recommendationsModal' || doc._type === 'recommendationType') {
    return del(doc._id!)
  }
  if (doc._type !== 'post') return

  const stops = (doc as Record<string, unknown>).stops
  if (!Array.isArray(stops) || stops.length === 0) return

  // Idempotent: already migrated (first member is a reference, not an inline object).
  const first = stops[0] as Record<string, unknown>
  if (first && '_ref' in first && !('title' in first)) return

  // The new `stop` document type requires a stopType reference; load the "stop"
  // stopType doc id once (cached for this migration process). Prerequisite: a
  // stopType document with name.current === "stop" must exist in the dataset.
  let stopTypeId: string | undefined
  async function getStopTypeId(): Promise<string> {
    if (stopTypeId) return stopTypeId
    const id = await context.client.fetch(
      '*[_type == "stopType" && name.current == "stop"][0]._id',
    )
    stopTypeId = id as string
    return id as string
  }

  const newRefs: Array<{_type: 'reference'; _ref: string; _key: string}> = []
  const mutations: ReturnType<typeof createOrReplace>[] = []

  for (let i = 0; i < stops.length; i++) {
    const item = stops[i] as Record<string, unknown>
    const type = item._type
    if (typeof type !== 'string' || !VALID_TYPES.has(type)) continue

    const key = (item._key as string | undefined) ?? `stop-${i}`
    const docId = `${type}-${doc._id}-${key}` // deterministic + unique per (post, member)

    // Strip array-member scaffolding; keep the rest as the document body.
    const {_type: _ignoredType, _key: _ignoredKey, ...rest} = item
    const newDoc: Record<string, unknown> = {_id: docId, _type: type, ...rest}

    if (type === 'stop') {
      const id = await getStopTypeId()
      newDoc.stopType = {_type: 'reference', _ref: id}
    }

    mutations.push(createOrReplace(newDoc as unknown as SanityDocument))
    newRefs.push({_type: 'reference', _ref: docId, _key: key})
  }

  // Clear recommendations (old recommendationsModal refs are invalid now);
  // replace stops with references to the newly created documents.
  return transaction([
    ...mutations,
    patch(doc._id!, [at('stops', set(newRefs)), at('recommendations', set([]))]),
  ])
}) as unknown as NodeMigration['document'];

export default defineMigration({
  title: 'Extract inline stops into documents; drop recommendations',
  documentTypes: ['post', 'recommendationsModal', 'recommendationType'],
  migrate: {
    document: documentHandler,
  },
})
