import { useEffect, useRef } from 'react'
import { Marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import DOMPurify from 'dompurify'
import { db } from './db'
import 'katex/dist/katex.min.css'

const marked = new Marked({ gfm: true, breaks: true })
marked.use(markedKatex({ throwOnError: false, nonStandard: false }))

// Allow our custom img:<uuid> scheme (blob-backed images) alongside the defaults.
const URI_ALLOWED =
  /^(?:(?:https?|mailto|tel|data|img):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

export function renderMarkdown(source: string): string {
  const raw = marked.parse(source, { async: false }) as string
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    ALLOWED_URI_REGEXP: URI_ALLOWED,
  })
}

/**
 * Renders markdown (with KaTeX math) and resolves img:<id> image sources
 * to object URLs backed by IndexedDB blobs.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    const urls: string[] = []
    el.innerHTML = renderMarkdown(source)
    el.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') ?? ''
      if (!src.startsWith('img:')) return
      const id = src.slice(4)
      db.images.get(id).then((asset) => {
        if (cancelled || !asset) return
        const url = URL.createObjectURL(asset.blob)
        urls.push(url)
        img.src = url
      })
    })
    return () => {
      cancelled = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [source])

  return <div className={`md ${className ?? ''}`} ref={ref} />
}
