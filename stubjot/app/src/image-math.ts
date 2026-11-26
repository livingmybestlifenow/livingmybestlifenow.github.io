import { DEFAULT_CROP, type CropBox } from './types'

export type Quality = {
  glare: boolean
  blur: boolean
  blurScore: number
  hotRatio: number
}

export function detectDocumentBox(gray: Uint8Array, width: number, height: number): CropBox | null {
  if (width < 16 || height < 16) return null
  const mag = new Float32Array(width * height)
  let sum = 0
  let count = 0
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const i = y * width + x
      const gx =
        -gray[i - width - 1] +
        gray[i - width + 1] -
        2 * gray[i - 1] +
        2 * gray[i + 1] -
        gray[i + width - 1] +
        gray[i + width + 1]
      const gy =
        -gray[i - width - 1] -
        2 * gray[i - width] -
        gray[i - width + 1] +
        gray[i + width - 1] +
        2 * gray[i + width] +
        gray[i + width + 1]
      const value = Math.hypot(gx, gy)
      mag[i] = value
      sum += value
      count += 1
    }
  }
  const mean = count ? sum / count : 0
  const threshold = Math.max(48, mean * 2)
  const row = new Float32Array(height)
  const col = new Float32Array(width)
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      if (mag[y * width + x] < threshold) continue
      row[y] += 1
      col[x] += 1
    }
  }
  const rowCut = Math.max(4, width * 0.12)
  const colCut = Math.max(4, height * 0.12)
  let top = -1
  let bottom = -1
  let left = -1
  let right = -1
  for (let y = 0; y < height; y += 1) {
    if (row[y] >= rowCut) {
      top = y
      break
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    if (row[y] >= rowCut) {
      bottom = y
      break
    }
  }
  for (let x = 0; x < width; x += 1) {
    if (col[x] >= colCut) {
      left = x
      break
    }
  }
  for (let x = width - 1; x >= 0; x -= 1) {
    if (col[x] >= colCut) {
      right = x
      break
    }
  }
  if (top < 0 || left < 0 || bottom <= top || right <= left) return null
  const boxW = right - left
  const boxH = bottom - top
  const area = (boxW * boxH) / (width * height)
  if (area < 0.12 || area > 0.94) return null
  const padX = boxW * 0.03
  const padY = boxH * 0.03
  const x = Math.max(0, left - padX) / width
  const y = Math.max(0, top - padY) / height
  const w = Math.min(width, right + padX) / width - x
  const h = Math.min(height, bottom + padY) / height - y
  if (w < 0.2 || h < 0.2) return null
  return { x, y, w, h }
}

export function assessGray(gray: Uint8Array, width: number, height: number): Quality {
  let sum = 0
  let sumSq = 0
  let n = 0
  const step = width > 800 ? 3 : 2
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const i = y * width + x
      const lap = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i]
      sum += lap
      sumSq += lap * lap
      n += 1
    }
  }
  const mean = n ? sum / n : 0
  const blurScore = n ? sumSq / n - mean * mean : 0
  const cell = 32
  let hot = 0
  let cells = 0
  if (width >= cell && height >= cell) {
    for (let y = 0; y + cell <= height; y += cell) {
      for (let x = 0; x + cell <= width; x += cell) {
        let cellSum = 0
        let cellSq = 0
        const count = cell * cell
        for (let yy = 0; yy < cell; yy += 1) {
          const row = (y + yy) * width
          for (let xx = 0; xx < cell; xx += 1) {
            const value = gray[row + x + xx]
            cellSum += value
            cellSq += value * value
          }
        }
        const cellMean = cellSum / count
        const variance = cellSq / count - cellMean * cellMean
        cells += 1
        if (cellMean >= 250 && variance < 40) hot += 1
      }
    }
  }
  const hotRatio = cells ? hot / cells : 0
  return {
    glare: hotRatio >= 0.012,
    blur: blurScore < 45,
    blurScore,
    hotRatio,
  }
}

export function clampCrop(box: CropBox): CropBox {
  const min = 0.12
  let { x, y, w, h } = box
  w = Math.max(min, Math.min(1, w))
  h = Math.max(min, Math.min(1, h))
  x = Math.min(Math.max(0, x), 1 - w)
  y = Math.min(Math.max(0, y), 1 - h)
  return { x, y, w, h }
}

export function moveCrop(start: CropBox, mode: 'move' | 'nw' | 'ne' | 'sw' | 'se', dx: number, dy: number): CropBox {
  let { x, y, w, h } = start
  if (mode === 'move') {
    x += dx
    y += dy
  } else {
    if (mode === 'nw' || mode === 'sw') {
      x += dx
      w -= dx
    }
    if (mode === 'ne' || mode === 'se') w += dx
    if (mode === 'nw' || mode === 'ne') {
      y += dy
      h -= dy
    }
    if (mode === 'sw' || mode === 'se') h += dy
  }
  return clampCrop({ x, y, w, h })
}

export function fallbackCrop(): CropBox {
  return { ...DEFAULT_CROP }
}
