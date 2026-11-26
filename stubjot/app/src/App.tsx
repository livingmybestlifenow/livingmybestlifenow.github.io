import { useState, type ReactNode } from 'react'
import { emptyDraft } from './format'
import { AddScreen } from './screens/AddScreen'
import { CaptureScreen } from './screens/CaptureScreen'
import { ConfirmScreen } from './screens/ConfirmScreen'
import { DetailScreen } from './screens/DetailScreen'
import { EditScreen } from './screens/EditScreen'
import { ListScreen } from './screens/ListScreen'
import { ManualScreen } from './screens/ManualScreen'
import { MoreScreen } from './screens/MoreScreen'
import { StoreProvider } from './store'
import { APP_NAME, DISCLAIMER } from './types'
import type { Route } from './route'
import { IconAdd, IconMore, IconReceipt } from './ui'

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const [route, setRoute] = useState<Route>({ name: 'list' })
  if (route.name === 'capture') {
    return (
      <CaptureScreen
        file={route.file}
        draft={route.draft}
        onClose={() => setRoute(route.draft ? { name: 'manual', draft: route.draft } : { name: 'add' })}
        onType={() => setRoute({ name: 'manual', draft: route.draft ?? emptyDraft() })}
        onSaved={(id) => setRoute({ name: 'confirm', id })}
      />
    )
  }

  const tab = route.name === 'more' ? 'more' : route.name === 'list' || route.name === 'detail' || route.name === 'edit' ? 'list' : 'add'

  return (
    <div className="mx-auto min-h-dvh max-w-5xl md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden px-4 pt-8 md:block">
        <p className="text-2xl font-semibold tracking-tight">{APP_NAME}</p>
        <p className="mt-1 text-sm leading-relaxed text-mist">Receipts on this device.</p>
        <nav className="mt-6 grid gap-2" aria-label="Primary">
          <SideLink active={tab === 'list'} onClick={() => setRoute({ name: 'list' })}>
            Receipts
          </SideLink>
          <SideLink active={tab === 'add'} onClick={() => setRoute({ name: 'add' })}>
            Add
          </SideLink>
          <SideLink active={tab === 'more'} onClick={() => setRoute({ name: 'more' })}>
            More
          </SideLink>
        </nav>
        <p className="mt-8 text-sm leading-relaxed text-faint">{DISCLAIMER}</p>
      </aside>
      <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-36 md:pb-10">
        {route.name === 'list' ? <ListScreen flash={route.flash} go={setRoute} /> : null}
        {route.name === 'add' ? <AddScreen go={setRoute} /> : null}
        {route.name === 'manual' ? <ManualScreen draft={route.draft} go={setRoute} /> : null}
        {route.name === 'confirm' ? <ConfirmScreen id={route.id} go={setRoute} /> : null}
        {route.name === 'detail' ? <DetailScreen id={route.id} go={setRoute} /> : null}
        {route.name === 'edit' ? <EditScreen id={route.id} go={setRoute} /> : null}
        {route.name === 'more' ? <MoreScreen /> : null}
      </main>
      <nav className="tabbar" aria-label="Primary">
        <TabButton active={tab === 'list'} label="Receipts" onClick={() => setRoute({ name: 'list' })}>
          <IconReceipt />
        </TabButton>
        <TabButton active={tab === 'add'} label="Add" onClick={() => setRoute({ name: 'add' })}>
          <IconAdd />
        </TabButton>
        <TabButton active={tab === 'more'} label="More" onClick={() => setRoute({ name: 'more' })}>
          <IconMore />
        </TabButton>
      </nav>
    </div>
  )
}

function SideLink({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'min-h-12 rounded-2xl bg-panel px-3 text-left font-semibold text-ambertext'
          : 'min-h-12 rounded-2xl px-3 text-left font-medium text-cream'
      }
    >
      {children}
    </button>
  )
}

function TabButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? 'flex min-h-12 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-ambertext' : 'flex min-h-12 flex-col items-center justify-center gap-0.5 text-xs font-medium text-mist'}
    >
      {children}
      {label}
    </button>
  )
}
