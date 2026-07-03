import { useEffect, useRef, useState } from 'react'

/**
 * A pressure-sensitive sketch canvas (works with Apple Pencil via pointer
 * events). Saves the drawing as a PNG blob.
 */

interface StrokePoint {
  x: number
  y: number
  p: number
}
interface Stroke {
  color: string
  size: number
  erase: boolean
  points: StrokePoint[]
}

const COLORS = ['#1a1a19', '#2a78d6', '#d03b3b', '#0ca30c', '#eda100']
const SIZES = [2, 4, 8]

export function Sketchpad({
  onSave,
  onCancel,
}: {
  onSave: (blob: Blob) => void
  onCancel: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const currentRef = useRef<Stroke | null>(null)
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const [erasing, setErasing] = useState(false)
  const [, bump] = useState(0)

  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    const all = currentRef.current
      ? [...strokesRef.current, currentRef.current]
      : strokesRef.current
    for (const s of all) {
      ctx.strokeStyle = s.erase ? '#ffffff' : s.color
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1]
        const b = s.points[i]
        const w = s.erase ? s.size * 4 : s.size * (0.5 + Math.max(a.p, b.p))
        ctx.lineWidth = w
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      if (s.points.length === 1) {
        const pt = s.points[0]
        ctx.fillStyle = s.erase ? '#ffffff' : s.color
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, (s.erase ? s.size * 4 : s.size) / 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement!
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = parent.getBoundingClientRect()
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      redraw()
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toPoint = (e: React.PointerEvent): StrokePoint => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      p: e.pressure > 0 ? e.pressure : 0.5,
    }
  }

  const onDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId)
    currentRef.current = { color, size, erase: erasing, points: [toPoint(e)] }
    redraw()
  }
  const onMove = (e: React.PointerEvent) => {
    if (!currentRef.current) return
    currentRef.current.points.push(toPoint(e))
    redraw()
  }
  const onUp = () => {
    if (!currentRef.current) return
    strokesRef.current.push(currentRef.current)
    currentRef.current = null
    bump((n) => n + 1)
    redraw()
  }

  const undo = () => {
    strokesRef.current.pop()
    bump((n) => n + 1)
    redraw()
  }
  const clear = () => {
    strokesRef.current = []
    bump((n) => n + 1)
    redraw()
  }
  const save = () => {
    canvasRef.current!.toBlob((blob) => {
      if (blob) onSave(blob)
    }, 'image/png')
  }

  return (
    <div className="sketch-overlay">
      <div className="sketch-toolbar">
        <div className="sketch-tools">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${!erasing && color === c ? 'active' : ''}`}
              style={{ background: c }}
              aria-label={`pen ${c}`}
              onClick={() => {
                setColor(c)
                setErasing(false)
              }}
            />
          ))}
          <span className="sketch-sep" />
          {SIZES.map((s) => (
            <button
              key={s}
              className={`size-btn ${size === s ? 'active' : ''}`}
              aria-label={`size ${s}`}
              onClick={() => setSize(s)}
            >
              <span style={{ width: s + 3, height: s + 3 }} />
            </button>
          ))}
          <span className="sketch-sep" />
          <button
            className={`btn btn-sm ${erasing ? 'btn-primary' : ''}`}
            onClick={() => setErasing((v) => !v)}
          >
            Eraser
          </button>
          <button className="btn btn-sm" onClick={undo} disabled={strokesRef.current.length === 0}>
            Undo
          </button>
          <button className="btn btn-sm" onClick={clear}>
            Clear
          </button>
        </div>
        <div className="sketch-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Add to note
          </button>
        </div>
      </div>
      <div className="sketch-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="sketch-canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
    </div>
  )
}
