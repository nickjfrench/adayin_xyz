import {defineMigration, at, set, type NodePatch} from '@sanity/migrate'

// Parens/brackets/quotes excluded so a URL wrapped like "(https://…/)" doesn't swallow the ")".
const URL_RE = /\bhttps?:\/\/[^\s<>()\[\]{}"']+/g
const TRAILING_PUNCT = /[.,;:!?'"*]+$/

type Link = {start: number; end: number; url: string}

export function findLinks(text: string): Link[] {
  const links: Link[] = []
  URL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = URL_RE.exec(text)) !== null) {
    const url = m[0].replace(TRAILING_PUNCT, '') // don't link a sentence's trailing comma/period
    if (url.length <= 'https://'.length) continue // degenerate match → plain text
    links.push({start: m.index, end: m.index + url.length, url})
  }
  return links
}

// "text … <url> …" → one Portable Text block per source line, URLs wrapped in link markDefs.
export function textToBlocks(text: string, seed: string): Array<Record<string, unknown>> {
  const paras = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  let n = 0
  const k = () => `${seed}${n++}`
  return paras.map((para) => {
    const children: Array<Record<string, unknown>> = []
    const markDefs: Array<Record<string, unknown>> = []
    let cursor = 0
    for (const link of findLinks(para)) {
      if (link.start > cursor) {
        children.push({_type: 'span', _key: k(), text: para.slice(cursor, link.start), marks: []})
      }
      const linkKey = k()
      markDefs.push({_type: 'link', _key: linkKey, href: link.url})
      children.push({_type: 'span', _key: k(), text: link.url, marks: [linkKey]})
      cursor = link.end
    }
    if (cursor < para.length) {
      children.push({_type: 'span', _key: k(), text: para.slice(cursor), marks: []})
    }
    if (children.length === 0) children.push({_type: 'span', _key: k(), text: '', marks: []})
    return {_type: 'block', _key: k(), style: 'normal', markDefs, children}
  })
}

export default defineMigration({
  title: 'Convert text fields to Portable Text with auto-linked URLs',
  documentTypes: ['stop', 'travel'],
  migrate: {
    document(doc) {
      const patches: NodePatch[] = []
      for (const field of ['description', 'longDesc'] as const) {
        const value = (doc as Record<string, unknown>)[field]
        if (typeof value === 'string' && value.trim()) {
          patches.push(at(field, set(textToBlocks(value, field))))
        }
      }
      const callouts = (doc as Record<string, unknown>).callouts
      if (Array.isArray(callouts)) {
        let changed = false
        const newCallouts = callouts.map((member, i) => {
          const body = (member as Record<string, unknown>)?.body
          if (typeof body === 'string' && body.trim()) {
            changed = true
            return {...member, body: textToBlocks(body, `c${i}-`)}
          }
          return member
        })
        if (changed) patches.push(at('callouts', set(newCallouts)))
      }
      return patches.length > 0 ? patches : undefined
    },
  },
})
