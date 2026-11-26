import type { Draft } from './types'

export type Route =
  | { name: 'list'; flash?: string }
  | { name: 'add' }
  | { name: 'manual'; draft: Draft }
  | { name: 'capture'; file: File | null; draft: Draft | null }
  | { name: 'confirm'; id: string }
  | { name: 'detail'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'more' }
