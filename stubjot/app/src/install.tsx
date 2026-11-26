import { useEffect, useState } from 'react'
import { APP_NAME } from './types'
import { Button } from './ui'

const IN_APP = /FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|WhatsApp|TikTok|MicroMessenger|GSA\/|musical_ly|Bytedance/i
const DISMISS_KEY = 'stubjot-install-dismissed'

export type InstallPlatform =
  | 'ios-safari'
  | 'ios-other'
  | 'android-inapp'
  | 'android-samsung'
  | 'android-chrome'
  | 'android-other'
  | 'desktop-chromium'
  | 'other'

export function isIos(): boolean {
  const ua = navigator.userAgent
  const iPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iPad || /iPad|iPhone|iPod/.test(ua)
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

export function installPlatform(): InstallPlatform {
  const ua = navigator.userAgent
  const iPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  if (iPad || /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && /Mobile/.test(ua))) {
    const embedded = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\//i.test(ua) || IN_APP.test(ua)
    return /Safari/i.test(ua) && !embedded ? 'ios-safari' : 'ios-other'
  }
  if (/Android/i.test(ua)) {
    if (/; wv\)|WebView/i.test(ua) || IN_APP.test(ua)) return 'android-inapp'
    if (/SamsungBrowser/i.test(ua)) return 'android-samsung'
    if (/Chrome\/|EdgA\/|OPR\/|Edg\//i.test(ua)) return 'android-chrome'
    return 'android-other'
  }
  if (/Chrome\/|Edg\/|OPR\//i.test(ua) && !/Android|iPhone|iPad/.test(ua)) return 'desktop-chromium'
  return 'other'
}

export function chromeIntent(href: string): string {
  const url = new URL(href)
  const fallback = encodeURIComponent(url.href)
  const scheme = url.protocol.replace(':', '')
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`
}

function useInstall() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(() => window.__stubjotInstallEvent ?? null)
  const [installed, setInstalled] = useState(isStandalone)
  useEffect(() => {
    const ready = () => setEvent(window.__stubjotInstallEvent ?? null)
    const done = () => {
      window.__stubjotInstallEvent = null
      setEvent(null)
      setInstalled(true)
    }
    window.addEventListener('stubjot-install-ready', ready)
    window.addEventListener('stubjot-installed', done)
    window.addEventListener('appinstalled', done)
    return () => {
      window.removeEventListener('stubjot-install-ready', ready)
      window.removeEventListener('stubjot-installed', done)
      window.removeEventListener('appinstalled', done)
    }
  }, [])

  async function promptInstall(): Promise<string | null> {
    const promptEvent = window.__stubjotInstallEvent ?? event
    if (!promptEvent) return 'Chrome did not offer a one-tap install card in this tab. Add it from the menu instead.'
    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      window.__stubjotInstallEvent = null
      setEvent(null)
      if (choice.outcome === 'accepted') {
        setInstalled(true)
        return null
      }
      return 'Install was canceled. You can try again from this screen, or use the steps below.'
    } catch {
      window.__stubjotInstallEvent = null
      setEvent(null)
      return 'Chrome did not open the install card from this button.'
    }
  }

  return { canPrompt: event != null, installed, promptInstall }
}

function Steps({ platform }: { platform: InstallPlatform }) {
  if (platform === 'ios-safari') {
    return (
      <ol className="mt-3 grid gap-2 text-sm leading-relaxed">
        <li>1. Tap the Share button in Safari.</li>
        <li>
          2. Tap <strong>Add to Home Screen</strong>.
        </li>
        <li>
          3. Tap <strong>Add</strong>.
        </li>
      </ol>
    )
  }
  if (platform === 'android-samsung') {
    return (
      <ol className="mt-3 grid gap-2 text-sm leading-relaxed">
        <li>1. Tap the menu at the bottom right.</li>
        <li>
          2. Tap <strong>Add page to</strong>.
        </li>
        <li>
          3. Tap <strong>Home screen</strong>.
        </li>
      </ol>
    )
  }
  if (platform === 'android-chrome' || platform === 'desktop-chromium' || platform === 'android-other') {
    return (
      <ol className="mt-3 grid gap-2 text-sm leading-relaxed">
        <li>
          1. Tap the <strong>⋮</strong> menu at the top right of Chrome.
        </li>
        <li>
          2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>. On desktop, choose{' '}
          <strong>Cast, save, and share</strong>, then <strong>Install page as app</strong>.
        </li>
        <li>
          3. Tap <strong>Install</strong>.
        </li>
      </ol>
    )
  }
  return (
    <p className="mt-3 text-sm leading-relaxed text-mist">
      Use the browser menu and choose Install app or Add to Home screen.
    </p>
  )
}

export function InstallBanner({ onOpen }: { onOpen: () => void }) {
  const { installed } = useInstall()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  if (installed || hidden) return null
  return (
    <div className="flex items-center justify-between gap-3 rounded-3xl border border-amber/50 bg-panel px-4 py-3">
      <button type="button" className="min-h-12 text-left font-semibold text-ambertext" onClick={onOpen}>
        Install {APP_NAME} on this phone
      </button>
      <button
        type="button"
        className="min-h-12 shrink-0 px-2 text-sm font-semibold text-mist"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, '1')
          } catch {
            /* keep the banner if storage is blocked */
          }
          setHidden(true)
        }}
      >
        Not now
      </button>
    </div>
  )
}

export function InstallCard() {
  const { canPrompt, installed, promptInstall } = useInstall()
  const platform = installPlatform()
  const [status, setStatus] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    const href = window.location.href
    try {
      await navigator.clipboard.writeText(href)
    } catch {
      const input = document.createElement('textarea')
      input.value = href
      document.body.append(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    setCopied(true)
  }

  if (installed) {
    return (
      <section id="install-stubjot" className="rounded-3xl border border-line bg-panel p-4" aria-label={`Install ${APP_NAME}`}>
        <h2 className="text-xl font-semibold">{APP_NAME} is installed</h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">It opens like an app and works offline. Receipts stay on this device.</p>
      </section>
    )
  }

  return (
    <section
      id="install-stubjot"
      className="rounded-3xl border border-amber/50 bg-panel p-4"
      aria-label={`Install ${APP_NAME}`}
    >
      <h2 className="text-xl font-semibold">Install {APP_NAME}</h2>
      {platform === 'android-inapp' ? (
        <>
          <p className="mt-2 leading-relaxed text-mist">
            This page is inside another app, so Android can’t install it from here. Open it in Chrome, then tap Install {APP_NAME}.
          </p>
          <div className="mt-4 grid gap-3">
            <a
              className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-amber px-4 text-lg font-semibold text-ink"
              href={chromeIntent(window.location.href)}
            >
              Open in Chrome
            </a>
            <Button variant="secondary" onClick={() => void copyLink()}>
              {copied ? 'Link copied' : 'Copy link'}
            </Button>
          </div>
        </>
      ) : null}
      {platform === 'ios-other' ? (
        <>
          <p className="mt-2 leading-relaxed text-mist">
            This iPhone browser can’t install {APP_NAME}. Open the link in Safari, then use Share and Add to Home Screen.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => void copyLink()}>
              {copied ? 'Link copied' : 'Copy link'}
            </Button>
          </div>
        </>
      ) : null}
      {platform !== 'android-inapp' && platform !== 'ios-other' ? (
        <>
          <p className="mt-2 leading-relaxed text-mist">
            {canPrompt
              ? `Add ${APP_NAME} to your home screen. Your browser will ask you to confirm. It then opens like an app and works offline.`
              : 'Chrome did not offer a one-tap install card in this tab. Add it from the menu instead.'}
          </p>
          {canPrompt ? (
            <div className="mt-4">
              <Button
                onClick={() => {
                  void promptInstall().then((message) => setStatus(message))
                }}
              >
                Install {APP_NAME}
              </Button>
            </div>
          ) : null}
          <Steps platform={platform} />
          <p className="mt-3 text-sm leading-relaxed text-mist">
            If those lines are missing, this tab is inside another app. Open the page in Chrome, then use the menu.
          </p>
        </>
      ) : null}
      {status ? (
        <p className="mt-3 text-sm leading-relaxed text-mist" role="status">
          {status}
        </p>
      ) : null}
    </section>
  )
}
