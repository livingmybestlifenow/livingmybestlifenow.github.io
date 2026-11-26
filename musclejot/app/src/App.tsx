import { useState } from 'react'
import { HistoryScreen } from './screens/HistoryScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { LogScreen } from './screens/LogScreen'
import { MoreScreen } from './screens/MoreScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { StoreProvider, useStore } from './store'
import { Wordmark } from './ui'

type Tab = 'log' | 'history' | 'progress' | 'library' | 'more'

const TABS: { id: Tab; label: string }[] = [
  { id: 'log', label: 'Log' },
  { id: 'history', label: 'History' },
  { id: 'progress', label: 'Progress' },
  { id: 'library', label: 'Library' },
  { id: 'more', label: 'More' },
]

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const { ready, error } = useStore()
  const [tab, setTab] = useState<Tab>('log')
  if (!ready) {
    return <p className="px-4 pt-8 text-mist">Opening the log on this device…</p>
  }
  if (error) {
    return (
      <p className="px-4 pt-8 text-bad" role="alert">
        {error}
      </p>
    )
  }
  return (
    <div className="mx-auto min-h-dvh max-w-5xl md:grid md:grid-cols-[220px_minmax(0,1fr)]" data-testid="app-ready">
      <aside className="hidden px-4 pt-8 md:block">
        <Wordmark className="text-2xl" />
        <p className="mt-2 text-sm leading-relaxed text-mist">Workouts on this device.</p>
        <nav className="mt-6 grid gap-2" aria-label="Primary">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={
                tab === item.id
                  ? 'min-h-12 rounded-2xl bg-panel px-3 text-left font-semibold text-ambertext'
                  : 'min-h-12 rounded-2xl px-3 text-left font-medium text-cream'
              }
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28 md:pb-10">
        {tab === 'log' ? <LogScreen goMore={() => setTab('more')} /> : null}
        {tab === 'history' ? <HistoryScreen /> : null}
        {tab === 'progress' ? <ProgressScreen /> : null}
        {tab === 'library' ? <LibraryScreen /> : null}
        {tab === 'more' ? <MoreScreen /> : null}
      </main>
      <nav className="tabbar" aria-label="Primary">
        {TABS.map((item) => (
          <TabButton key={item.id} active={tab === item.id} label={item.label} onClick={() => setTab(item.id)} />
        ))}
      </nav>
    </div>
  )
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'flex min-h-12 flex-col items-center justify-center text-xs font-semibold text-ambertext'
          : 'flex min-h-12 flex-col items-center justify-center text-xs font-medium text-mist'
      }
    >
      {label}
    </button>
  )
}
