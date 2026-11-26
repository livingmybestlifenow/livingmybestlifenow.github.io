export const APP_NAME = 'StubJot'

export const CONFIRM_NOTE =
  'Confirming the amount, date, vendor, and category keeps your records accurate.'

export const DISCLAIMER =
  'Records here are what you confirm on this device. StubJot is not tax advice.'

export const CATEGORIES = [
  { id: 'fuel', label: 'Fuel' },
  { id: 'meals', label: 'Meals' },
  { id: 'supplies', label: 'Supplies' },
  { id: 'parking', label: 'Parking' },
  { id: 'tolls', label: 'Tolls' },
  { id: 'phone', label: 'Phone & data' },
  { id: 'fees', label: 'Fees' },
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'other', label: 'Other' },
] as const

export type CategoryId = (typeof CATEGORIES)[number]['id']

export type Receipt = {
  id: string
  createdAt: number
  updatedAt: number
  amountCents: number | null
  date: string | null
  vendor: string
  category: CategoryId
  note: string
  verified: boolean
  photoId: string | null
  ocrSnippet: string
  glare: boolean
  blur: boolean
}

export type PhotoRecord = {
  id: string
  blob: Blob
  width: number
  height: number
  createdAt: number
}

export type Draft = {
  amount: string
  date: string
  vendor: string
  category: CategoryId
  note: string
}

export type CropBox = {
  x: number
  y: number
  w: number
  h: number
}

export const DEFAULT_CROP: CropBox = { x: 0.1, y: 0.08, w: 0.8, h: 0.78 }

export function categoryLabel(id: string): string {
  return CATEGORIES.find((item) => item.id === id)?.label ?? 'Other'
}

export function asCategory(value: string): CategoryId {
  return CATEGORIES.some((item) => item.id === value) ? (value as CategoryId) : 'other'
}
