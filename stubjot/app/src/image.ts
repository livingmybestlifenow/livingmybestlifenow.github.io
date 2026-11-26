import { assessGray, detectDocumentBox, fallbackCrop } from './image-math'
import type { CropBox } from './types'

const WORKING_EDGE = 2000
const OUTPUT_EDGE = 1600

export function grayFromRgba(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0
  }
  return gray
}

function fitCanvas(source: CanvasImageSource, width: number, height: number, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Could not prepare the photo on this device.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function grabVideoFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) throw new Error('The camera is not ready yet. Hold still and try again.')
  return fitCanvas(video, width, height, WORKING_EDGE)
}

export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  try {
    const bitmap = await createImageBitmap(file)
    try {
      return fitCanvas(bitmap, bitmap.width, bitmap.height, WORKING_EDGE)
    } finally {
      bitmap.close()
    }
  } catch {
    throw new Error('That photo could not be opened. Choose a JPEG or take the photo in StubJot.')
  }
}

export function suggestCrop(canvas: HTMLCanvasElement): CropBox {
  const sample = fitCanvas(canvas, canvas.width, canvas.height, 480)
  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return fallbackCrop()
  const image = context.getImageData(0, 0, sample.width, sample.height)
  return detectDocumentBox(grayFromRgba(image.data, sample.width, sample.height), sample.width, sample.height) ?? fallbackCrop()
}

export function qualityOf(canvas: HTMLCanvasElement, crop: CropBox): { glare: boolean; blur: boolean } {
  const sx = Math.max(0, Math.round(crop.x * canvas.width))
  const sy = Math.max(0, Math.round(crop.y * canvas.height))
  const sw = Math.max(1, Math.round(crop.w * canvas.width))
  const sh = Math.max(1, Math.round(crop.h * canvas.height))
  const sample = document.createElement('canvas')
  const scale = Math.min(1, 480 / Math.max(sw, sh))
  sample.width = Math.max(1, Math.round(sw * scale))
  sample.height = Math.max(1, Math.round(sh * scale))
  const context = sample.getContext('2d', { willReadFrequently: true })
  if (!context) return { glare: false, blur: false }
  context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sample.width, sample.height)
  const image = context.getImageData(0, 0, sample.width, sample.height)
  const quality = assessGray(grayFromRgba(image.data, sample.width, sample.height), sample.width, sample.height)
  return { glare: quality.glare, blur: quality.blur }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality))
}

export async function compressCanvas(
  source: HTMLCanvasElement,
  crop: CropBox,
): Promise<{ blob: Blob; width: number; height: number }> {
  const sx = Math.max(0, Math.round(crop.x * source.width))
  const sy = Math.max(0, Math.round(crop.y * source.height))
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(crop.w * source.width)))
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(crop.h * source.height)))
  const scale = Math.min(1, OUTPUT_EDGE / Math.max(sw, sh))
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(sw * scale))
  out.height = Math.max(1, Math.round(sh * scale))
  const context = out.getContext('2d')
  if (!context) throw new Error('Could not prepare the photo on this device.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height)
  let blob = await canvasBlob(out, 'image/webp', 0.8)
  if (!blob || blob.size === 0 || blob.type !== 'image/webp') blob = await canvasBlob(out, 'image/jpeg', 0.82)
  if (!blob || blob.size === 0) throw new Error('Could not compress the photo on this device.')
  return { blob, width: out.width, height: out.height }
}
