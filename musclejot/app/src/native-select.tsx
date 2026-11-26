import { useId, useState } from 'react'

export type SelectOption = { value: string; label: string }

function wantsPageMenu(pointerType: string): boolean {
  if (pointerType === 'touch' || pointerType === 'pen') return true
  return window.matchMedia('(pointer: coarse)').matches
}

export function NativeSelect({
  testId,
  label,
  value,
  options,
  onChange,
}: {
  testId: string
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
}) {
  const reactId = useId()
  const selectId = `${testId}-${reactId.replace(/:/g, '')}`
  const [open, setOpen] = useState(false)

  function choose(next: string) {
    onChange(next)
    setOpen(false)
  }

  return (
    <div>
      <label htmlFor={selectId} className="block text-sm font-medium text-mist">
        {label}
      </label>
      <select
        id={selectId}
        data-testid={testId}
        className="field mt-1"
        value={value}
        aria-expanded={open}
        onChange={(event) => choose(event.target.value)}
        onPointerDown={(event) => {
          if (!wantsPageMenu(event.pointerType)) return
          event.preventDefault()
          setOpen((current) => !current)
        }}
        onMouseDown={(event) => {
          if (!wantsPageMenu('mouse')) return
          event.preventDefault()
        }}
      >
        {options.map((option) => (
          <option key={option.value || 'blank'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {open ? (
        <div className="mt-2 grid gap-2" role="listbox" aria-label={label} data-testid={`${testId}-menu`}>
          {options.map((option) => {
            const selected = option.value === value
            return (
              <button
                key={option.value || 'blank'}
                type="button"
                role="option"
                aria-selected={selected}
                data-testid={`${testId}-option-${option.value || 'blank'}`}
                className={selected ? 'field text-left font-semibold ring-2 ring-amber' : 'field text-left'}
                onClick={() => choose(option.value)}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
