import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getLastExportAt, listReceipts, setLastExportAt, storagePersisted, storageUsageLabel } from './db'
import type { Receipt } from './types'

type StoreValue = {
  receipts: Receipt[]
  ready: boolean
  loadError: string | null
  lastExportAt: number | null
  persistent: boolean | null
  usageLabel: string | null
  reload: () => Promise<void>
  markExported: () => Promise<void>
  retry: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastExportAt, setExported] = useState<number | null>(null)
  const [persistent, setPersistent] = useState<boolean | null>(null)
  const [usageLabel, setUsageLabel] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const reload = useCallback(async () => {
    const [rows, exported, persisted, usage] = await Promise.all([
      listReceipts(),
      getLastExportAt(),
      storagePersisted(),
      storageUsageLabel(),
    ])
    setReceipts(rows)
    setExported(exported)
    setPersistent(persisted)
    setUsageLabel(usage)
    setLoadError(null)
    setReady(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    reload().catch((error: unknown) => {
      if (cancelled) return
      setLoadError(error instanceof Error ? error.message : 'The receipts on this device could not be read.')
    })
    return () => {
      cancelled = true
    }
  }, [reload, attempt])

  const markExported = useCallback(async () => {
    const now = Date.now()
    await setLastExportAt(now)
    setExported(now)
  }, [])

  const value = useMemo<StoreValue>(
    () => ({
      receipts,
      ready,
      loadError,
      lastExportAt,
      persistent,
      usageLabel,
      reload,
      markExported,
      retry: () => setAttempt((value) => value + 1),
    }),
    [receipts, ready, loadError, lastExportAt, persistent, usageLabel, reload, markExported],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('Store missing')
  return value
}
