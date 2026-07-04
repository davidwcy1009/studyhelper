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

/** Callback fired when an image is drag-resized: which image (by id + which
 *  occurrence in the source, 0-based) and the new pixel width. */
type OnImageResize = (id: string, occurrence: number, widthPx: number) => void

const MIN_IMG_WIDTH = 40

/**
 * Renders markdown (with KaTeX math) and resolves img:<id> image sources
 * to object URLs backed by IndexedDB blobs.
 *
 * When `editableImages` is set, each blob image gets a drag handle; releasing
 * it calls `onResize` so the caller can persist the width into the source.
 */
export function Markdown({
  source,
  className,
  editableImages,
  onResize,
}: {
  source: string
  className?: string
  editableImages?: boolean
  onResize?: OnImageResize
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the latest callback reachable without re-running the render effect.
  const onResizeRef = useRef<OnImageResize | undefined>(onResize)
  onResizeRef.current = onResize

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    const urls: string[] = []
    const seen = new Map<string, number>()
    el.innerHTML = renderMarkdown(source)
    el.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') ?? ''
      if (!src.startsWith('img:')) return
      const id = src.slice(4)
      const occurrence = seen.get(id) ?? 0
      seen.set(id, occurrence + 1)
      db.images.get(id).then((asset) => {
        if (cancelled || !asset) return
        const url = URL.createObjectURL(asset.blob)
        urls.push(url)
        img.src = url
      })
      if (editableImages) attachResizeHandle(el, img, id, occurrence, onResizeRef)
    })
    return () => {
      cancelled = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [source, editableImages])

  return <div className={`md ${className ?? ''}`} ref={ref} />
}

/** Wrap an image in a relative container and add a bottom-right drag handle. */
function attachResizeHandle(
  container: HTMLElement,
  img: HTMLImageElement,
  id: string,
  occurrence: number,
  onResizeRef: React.MutableRefObject<OnImageResize | undefined>,
) {
  const wrap = document.createElement('span')
  wrap.className = 'img-wrap'
  img.replaceWith(wrap)
  wrap.appendChild(img)

  const handle = document.createElement('span')
  handle.className = 'img-resize-handle'
  handle.setAttribute('role', 'slider')
  handle.setAttribute('aria-label', 'Resize image')
  wrap.appendChild(handle)

  let startX = 0
  let startW = 0
  let dragging = false

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragging = true
    startX = e.clientX
    startW = img.getBoundingClientRect().width
    handle.setPointerCapture(e.pointerId)
    wrap.classList.add('resizing')
  })
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const max = container.clientWidth || startW
    const w = Math.max(MIN_IMG_WIDTH, Math.min(max, Math.round(startW + (e.clientX - startX))))
    img.style.width = `${w}px`
  })
  const finish = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    handle.releasePointerCapture?.(e.pointerId)
    wrap.classList.remove('resizing')
    onResizeRef.current?.(id, occurrence, Math.round(img.getBoundingClientRect().width))
  }
  handle.addEventListener('pointerup', finish)
  handle.addEventListener('pointercancel', finish)
}
