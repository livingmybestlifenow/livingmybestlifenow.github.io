import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cameraMessage, openCamera, setTorch, stopStream, torchAvailable } from '../camera'
import { saveCapturedPhoto, saveReceipt } from '../db'
import { parseAmount, todayISO } from '../format'
import { compressCanvas, fileToCanvas, grabVideoFrame, qualityOf, suggestCrop } from '../image'
import { moveCrop } from '../image-math'
import { recognizeReceipt, stopOcr, warmOcr } from '../ocr'
import { parseReceiptText } from '../parse'
import type { CropBox, Draft, Receipt } from '../types'
import { Button } from '../ui'

type Phase = 'opening' | 'live' | 'crop' | 'quality' | 'saving' | 'reading' | 'error'
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se'

export function CaptureScreen({
  file,
  draft,
  onClose,
  onType,
  onSaved,
}: {
  file: File | null
  draft: Draft | null
  onClose: () => void
  onType: () => void
  onSaved: (id: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mounted = useRef(true)
  const busy = useRef(false)
  const savedId = useRef<string | null>(null)
  const left = useRef(false)
  const [sourceFile, setSourceFile] = useState<File | null>(file)
  const [session, setSession] = useState(0)
  const [phase, setPhase] = useState<Phase>('opening')
  const [message, setMessage] = useState(file ? 'Opening the photo…' : 'Opening the camera…')
  const [crop, setCrop] = useState<CropBox>({ x: 0.1, y: 0.08, w: 0.8, h: 0.78 })
  const [issues, setIssues] = useState({ glare: false, blur: false })
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [torchError, setTorchError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [preview, setPreview] = useState(0)

  useEffect(() => {
    mounted.current = true
    void warmOcr().catch(() => undefined)
    return () => {
      mounted.current = false
      void stopOcr()
    }
  }, [])

  useEffect(() => {
    if (sourceFile) {
      let cancelled = false
      setPhase('opening')
      setMessage('Opening the photo…')
      fileToCanvas(sourceFile)
        .then((canvas) => {
          if (cancelled) return
          canvasRef.current = canvas
          setCrop(suggestCrop(canvas))
          setPreview((value) => value + 1)
          setPhase('crop')
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setMessage(error instanceof Error ? error.message : 'That photo could not be opened.')
            setPhase('error')
          }
        })
      return () => {
        cancelled = true
      }
    }

    let cancelled = false
    let wake: { release: () => Promise<void> } | null = null
    setPhase('opening')
    setMessage('Opening the camera…')
    void (async () => {
      try {
        const stream = await openCamera()
        if (cancelled) {
          stopStream(stream)
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) throw new Error('The camera frame is not ready yet.')
        video.srcObject = stream
        video.muted = true
        await video.play()
        const track = stream.getVideoTracks()[0]
        setHasTorch(track ? torchAvailable(track) : false)
        try {
          const nav = navigator as Navigator & {
            wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
          }
          wake = (await nav.wakeLock?.request('screen')) ?? null
        } catch {
          wake = null
        }
        if (!cancelled) setPhase('live')
      } catch (error) {
        if (!cancelled) {
          setMessage(cameraMessage(error))
          setPhase('error')
        }
      }
    })()
    return () => {
      cancelled = true
      stopStream(streamRef.current)
      streamRef.current = null
      void wake?.release().catch(() => undefined)
    }
  }, [sourceFile, session])

  function retake() {
    canvasRef.current = null
    setTorchOn(false)
    if (sourceFile) {
      onClose()
      return
    }
    setSession((value) => value + 1)
  }

  function shutter() {
    const video = videoRef.current
    if (!video || phase !== 'live') return
    try {
      const canvas = grabVideoFrame(video)
      canvasRef.current = canvas
      stopStream(streamRef.current)
      streamRef.current = null
      setTorchOn(false)
      setHasTorch(false)
      setCrop(suggestCrop(canvas))
      setPreview((value) => value + 1)
      setPhase('crop')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The photo could not be taken.')
      setPhase('error')
    }
  }

  function acceptCrop() {
    const canvas = canvasRef.current
    if (!canvas) return
    const next = qualityOf(canvas, crop)
    if (next.glare || next.blur) {
      setIssues(next)
      setPhase('quality')
      return
    }
    void commit(next)
  }

  async function commit(flags: { glare: boolean; blur: boolean }) {
    const canvas = canvasRef.current
    if (!canvas || busy.current) return
    busy.current = true
    setPhase('saving')
    setMessage('Saving the photo on this device…')
    try {
      const image = await compressCanvas(canvas, crop)
      const receipt = await saveCapturedPhoto({
        blob: image.blob,
        width: image.width,
        height: image.height,
        glare: flags.glare,
        blur: flags.blur,
        draft,
      })
      savedId.current = receipt.id
      if (!mounted.current) return
      setPhase('reading')
      setProgress(null)
      setMessage('Reading the receipt on this device…')
      try {
        const text = await recognizeReceipt(image.blob, (value) => {
          if (mounted.current) setProgress(value)
        })
        if (left.current || !mounted.current) return
        const parsed = parseReceiptText(text)
        const drafted = draft ? parseAmount(draft.amount) : null
        const next: Receipt = {
          ...receipt,
          ocrSnippet: text.replace(/\s+/g, ' ').trim().slice(0, 400),
          amountCents: typeof drafted === 'number' ? drafted : (parsed.amountCents ?? receipt.amountCents),
          vendor: receipt.vendor || parsed.vendor,
          category: receipt.category !== 'other' ? receipt.category : parsed.category,
          date: parsed.date && (!draft?.date || draft.date === todayISO()) ? parsed.date : receipt.date,
        }
        await saveReceipt(next)
      } catch {
        // The photo is already in the on-device store.
      }
      finish(receipt.id)
    } catch (error) {
      busy.current = false
      if (!mounted.current) return
      setMessage(error instanceof Error ? error.message : 'The photo could not be saved on this device.')
      setPhase('error')
    }
  }

  function finish(id: string) {
    if (left.current || !mounted.current) return
    left.current = true
    onSaved(id)
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      await setTorch(track, next)
      setTorchOn(next)
      setTorchError(null)
    } catch {
      setTorchError('The light could not be switched on. You can still take the photo.')
    }
  }

  const showVideo = phase === 'opening' || phase === 'live'
  const canvas = canvasRef.current

  return (
    <div className="camera-root fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {phase === 'saving' || phase === 'reading' ? (
          <span className="min-h-12" />
        ) : (
          <button type="button" className="min-h-12 px-1 text-base font-semibold" onClick={onClose}>
            Close
          </button>
        )}
        <p className="font-semibold">StubJot</p>
        {hasTorch && phase === 'live' ? (
          <button type="button" className="min-h-12 min-w-16 px-2 font-semibold text-amber" onClick={() => void toggleTorch()}>
            {torchOn ? 'Light off' : 'Light'}
          </button>
        ) : (
          <span className="min-w-16" />
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          className={showVideo ? 'h-full w-full object-cover' : 'hidden'}
          playsInline
          muted
          autoPlay
        />
        {phase === 'live' ? (
          <div className="receipt-frame" aria-hidden="true">
            <span className="tl" />
            <span className="tr" />
            <span className="bl" />
            <span className="br" />
          </div>
        ) : null}
        {canvas && phase !== 'live' && phase !== 'opening' && phase !== 'error' ? (
          <div className="mx-auto flex h-full max-w-3xl items-center px-4">
            <CropStage key={preview} canvas={canvas} crop={crop} onChange={setCrop} locked={phase !== 'crop'} />
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {torchError ? (
          <p className="text-center text-sm text-amber" role="status">
            {torchError}
          </p>
        ) : null}
        {phase === 'opening' ? (
          <p className="text-center text-mist" role="status">
            {message}
          </p>
        ) : null}
        {phase === 'error' ? (
          <>
            <p className="text-center text-bad" role="alert">
              {message}
            </p>
            <Button variant="secondary" onClick={onType}>
              Type it
            </Button>
          </>
        ) : null}
        {phase === 'live' ? (
          <>
            <p className="text-center text-sm text-white/90">Saved on this phone before reading. Nothing is uploaded.</p>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                className="size-20 rounded-full border-4 border-white bg-white/90 disabled:opacity-40"
                aria-label="Take photo"
                disabled={phase !== 'live'}
                onClick={shutter}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={onType}>
                Type it
              </Button>
              <label className="inline-flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border border-white/30 px-3 text-center font-semibold">
                Choose a photo
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const next = event.target.files?.[0]
                    event.target.value = ''
                    if (!next) return
                    stopStream(streamRef.current)
                    streamRef.current = null
                    setHasTorch(false)
                    setSourceFile(next)
                  }}
                />
              </label>
            </div>
          </>
        ) : null}
        {phase === 'crop' ? (
          <>
            <p className="text-center text-sm text-white/90">Drag the corners if the box misses the receipt.</p>
            <Button onClick={acceptCrop}>Use this photo</Button>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  if (canvasRef.current) setCrop(suggestCrop(canvasRef.current))
                }}
              >
                Reset crop
              </Button>
              <Button variant="secondary" onClick={retake}>
                Retake
              </Button>
            </div>
          </>
        ) : null}
        {phase === 'quality' ? (
          <div data-testid="quality-panel" className="grid gap-3">
            <p className="text-center leading-relaxed" role="status">
              {qualityCopy(issues)}
            </p>
            <Button variant="secondary" onClick={retake}>
              Retake
            </Button>
            <Button onClick={() => void commit(issues)}>Keep photo</Button>
          </div>
        ) : null}
        {phase === 'saving' || phase === 'reading' ? (
          <div className="grid gap-3" aria-busy="true">
            <p className="text-center" role="status">
              {message}
              {phase === 'reading' && progress != null ? ` ${Math.round(progress * 100)}%` : ''}
            </p>
            {phase === 'reading' ? (
              <Button
                variant="secondary"
                onClick={() => {
                  const id = savedId.current
                  void stopOcr()
                  if (id) finish(id)
                }}
              >
                Skip reading
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function qualityCopy(issues: { glare: boolean; blur: boolean }): string {
  if (issues.glare && issues.blur) {
    return 'This photo looks blurry and has glare. A retake is safer, and you can still keep this one.'
  }
  if (issues.glare) return 'Glare is washing out part of this photo. A retake is safer, and you can still keep this one.'
  return 'This photo looks blurry. A retake is safer, and you can still keep this one.'
}

function CropStage({
  canvas,
  crop,
  onChange,
  locked,
}: {
  canvas: HTMLCanvasElement
  crop: CropBox
  onChange: (next: CropBox) => void
  locked: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    canvas.className = 'block h-auto w-full'
    frame.append(canvas)
    return () => canvas.remove()
  }, [canvas])

  function start(event: ReactPointerEvent, mode: Handle) {
    if (locked) return
    event.preventDefault()
    const host = hostRef.current
    if (!host) return
    const bounds = host.getBoundingClientRect()
    const origin = { x: event.clientX, y: event.clientY, crop }
    function move(ev: PointerEvent) {
      const dx = (ev.clientX - origin.x) / bounds.width
      const dy = (ev.clientY - origin.y) / bounds.height
      onChange(moveCrop(origin.crop, mode, dx, dy))
    }
    function end() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }

  const box = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
  }

  return (
    <div ref={hostRef} className="relative w-full">
      <div ref={frameRef} />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-0 left-0 bg-black/60" style={{ top: 0, height: box.top }} />
        <div className="absolute right-0 bottom-0 left-0 bg-black/60" style={{ top: `${(crop.y + crop.h) * 100}%` }} />
        <div className="absolute bg-black/60" style={{ left: 0, top: box.top, width: box.left, height: box.height }} />
        <div
          className="absolute right-0 bg-black/60"
          style={{ left: `${(crop.x + crop.w) * 100}%`, top: box.top, height: box.height }}
        />
      </div>
      <div className="absolute border-2 border-amber" style={box}>
        {locked ? null : (
          <button
            type="button"
            aria-label="Move crop"
            className="pointer-events-auto absolute inset-0 cursor-move bg-transparent"
            onPointerDown={(event) => start(event, 'move')}
          />
        )}
        {locked
          ? null
          : (['nw', 'ne', 'sw', 'se'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-label={`${mode} crop handle`}
                className={`pointer-events-auto absolute size-11 rounded-full border-2 border-amber bg-white ${cornerClass(mode)}`}
                onPointerDown={(event) => start(event, mode)}
              />
            ))}
      </div>
    </div>
  )
}

function cornerClass(mode: Handle): string {
  if (mode === 'nw') return '-top-5 -left-5'
  if (mode === 'ne') return '-top-5 -right-5'
  if (mode === 'sw') return '-bottom-5 -left-5'
  return '-right-5 -bottom-5'
}
