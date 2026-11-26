type OcrWorker = import('tesseract.js').Worker

let pending: Promise<OcrWorker | null> | null = null
let current: OcrWorker | null = null
let stopped = false
let onProgress: ((value: number) => void) | null = null

function logger(message: { status?: string; progress?: number }) {
  if (message.status === 'recognizing text' && typeof message.progress === 'number') onProgress?.(message.progress)
}

function asset(path: string): string {
  return new URL(path, new URL('/stubjot/', window.location.origin)).toString()
}

async function create(): Promise<OcrWorker> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    workerPath: asset('tesseract/worker.min.js'),
    corePath: asset('tesseract'),
    langPath: asset('tessdata'),
    workerBlobURL: false,
    gzip: true,
    logger,
  })
  await worker.setParameters({
    tessedit_pageseg_mode: '6' as import('tesseract.js').PSM,
    user_defined_dpi: '200',
  })
  return worker
}

export function warmOcr(): Promise<OcrWorker | null> {
  stopped = false
  if (!pending) {
    pending = create()
      .then((worker) => {
        current = worker
        if (stopped) {
          current = null
          void worker.terminate()
          return null
        }
        return worker
      })
      .catch((error: unknown) => {
        pending = null
        current = null
        throw error
      })
  }
  return pending
}

export async function stopOcr(): Promise<void> {
  stopped = true
  const worker = current
  current = null
  pending = null
  if (worker) await worker.terminate().catch(() => undefined)
}

export async function recognizeReceipt(blob: Blob, progress?: (value: number) => void): Promise<string> {
  onProgress = progress ?? null
  try {
    const worker = await warmOcr()
    if (!worker) throw new Error('On-device reading stopped.')
    const result = await worker.recognize(blob)
    return result.data.text ?? ''
  } catch (error) {
    await stopOcr()
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`On-device reading failed. ${message}`)
  } finally {
    onProgress = null
  }
}
