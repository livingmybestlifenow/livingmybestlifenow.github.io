import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { SAFETY_POINTS } from './types'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  const look = {
    primary: 'bg-amber text-ink',
    secondary: 'border border-line bg-panel2 text-cream',
    quiet: 'bg-transparent text-ambertext',
    danger: 'border border-bad/40 bg-badbg text-bad',
  }[variant]
  return (
    <button
      type={type}
      {...props}
      className={cx(
        'inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-4 text-lg font-semibold disabled:opacity-45',
        look,
        className,
      )}
    />
  )
}

export function SafetyPoints() {
  return (
    <div className="grid gap-3 leading-relaxed">
      {SAFETY_POINTS.map((point) => (
        <p key={point}>{point}</p>
      ))}
    </div>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-3xl border border-line bg-panel p-4', className)}>{children}</section>
}

export function Wordmark({ className, mark = true }: { className?: string; mark?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5 font-semibold tracking-tight', className)}>
      {mark ? (
        <img src="/musclejot/favicon.svg" alt="" width={40} height={40} className="size-10 shrink-0 rounded-xl" />
      ) : null}
      <span>
        Muscle<span className="text-amber">J</span>ot
      </span>
    </span>
  )
}
