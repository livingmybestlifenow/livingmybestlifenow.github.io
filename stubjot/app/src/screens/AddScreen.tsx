import { emptyDraft } from '../format'
import type { Route } from '../route'
import { Button, Panel } from '../ui'

export function AddScreen({ go }: { go: (route: Route) => void }) {
  return (
    <div className="grid gap-4">
      <header className="pt-2">
        <h1 className="text-3xl font-semibold tracking-tight">Add a receipt</h1>
        <p className="mt-1 text-mist">The photo is saved on this phone before it is read.</p>
      </header>
      <Panel className="grid gap-3">
        <Button data-testid="add-photo" onClick={() => go({ name: 'capture', file: null, draft: null })}>
          Take a photo
        </Button>
        <Button variant="secondary" onClick={() => go({ name: 'manual', draft: emptyDraft() })}>
          Type a receipt
        </Button>
        <label className="inline-flex min-h-14 w-full cursor-pointer items-center justify-center rounded-2xl border border-line bg-panel2 px-4 text-lg font-semibold">
          Choose a photo
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) go({ name: 'capture', file, draft: null })
            }}
          />
        </label>
      </Panel>
      <p className="text-sm leading-relaxed text-mist">
        Type a receipt when the paper is gone. You can attach a photo or skip it.
      </p>
    </div>
  )
}
