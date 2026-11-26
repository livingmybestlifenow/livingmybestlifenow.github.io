// Browser check for MuscleJot. Needs playwright-core and Chrome.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdir, readFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')

const PORT = 8791
const ORIGIN = `http://127.0.0.1:${PORT}`
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SHOTS = '/tmp/musclejot-shots'
const ARTIFACTS = '/opt/cursor/artifacts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: REPO,
  stdio: ['ignore', 'pipe', 'pipe'],
})

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${ORIGIN}/musclejot/`)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('Static server did not start')
}

async function shot(page, name, locator) {
  if (locator) await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
  await page.screenshot({ path: path.join(SHOTS, name) })
}

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const hosts = new Set()
try {
  await waitForServer()
  await mkdir(SHOTS, { recursive: true })
  const manifest = await (await fetch(`${ORIGIN}/musclejot/manifest.webmanifest`)).json()
  assert(manifest.name === 'MuscleJot', `manifest name ${manifest.name}`)
  assert(manifest.start_url === '/musclejot/', manifest.start_url)
  assert(manifest.scope === '/musclejot/', manifest.scope)
  assert(manifest.id === '/musclejot/', manifest.id)
  assert(manifest.background_color === '#12140f', manifest.background_color)
  assert(manifest.icons.some((icon) => icon.purpose === 'maskable'), 'missing maskable icon')

  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    serviceWorkers: 'allow',
    acceptDownloads: true,
  })
  const page = await context.newPage()
  page.on('request', (request) => {
    try {
      hosts.add(new URL(request.url()).hostname)
    } catch {
      /* ignore */
    }
  })
  page.on('pageerror', (error) => {
    console.error('PAGEERROR', error.message)
  })

  await page.goto(`${ORIGIN}/musclejot/`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('app-ready').waitFor({ timeout: 15000 })
  await page.getByTestId('disclaimer').waitFor()
  const mark = await page.locator('h1 img').getAttribute('src')
  assert(mark && mark.includes('/musclejot/favicon.svg'), `wordmark icon ${mark}`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('app-ready').waitFor()
  assert(await page.evaluate(() => navigator.serviceWorker.controller != null), 'service worker is not controlling the page')

  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByText('Install app').waitFor()
  await page.getByTestId('plate-step').fill('2.5')
  await page.getByTestId('dumbbell-step').fill('5')
  await page.getByTestId('stall-sessions').fill('3')
  await page.getByTestId('plate-step').waitFor()
  assert((await page.getByTestId('plate-step').inputValue()) === '2.5', 'plate step did not stick')

  await page.getByRole('button', { name: 'Log', exact: true }).click()
  await page.getByTestId('start-empty').click()
  await page.getByTestId('pick-ex-bench').click()
  await page.getByTestId('weight-plus').click()
  assert((await page.getByTestId('weight-value').inputValue()) === '2.5', 'plate plus did not step by 2.5')
  await page.getByTestId('weight-plus').click()
  assert((await page.getByTestId('weight-value').inputValue()) === '5', 'second plate step missed 5')
  assert((await page.getByTestId('weight-step').innerText()).includes('Plate step 2.5 lb'), 'plate step label')
  await shot(page, 'increment-steps.png', page.getByTestId('weight-step'))

  await page.getByTestId('add-exercise').click()
  await page.getByTestId('pick-ex-curl').click()
  await page.getByTestId('weight-plus').click()
  assert((await page.getByTestId('weight-value').inputValue()) === '5', 'dumbbell plus did not step by 5')
  assert((await page.getByTestId('weight-step').innerText()).includes('Dumbbell step 5 lb'), 'dumbbell step label')

  await page.getByTestId('exercise-chip-ex-bench').click()
  await page.getByTestId('machine-note').fill('Seat 4, pin 8')
  await page.getByTestId('weight-value').fill('100')
  await page.getByTestId('reps-value').fill('5')
  assert((await page.getByTestId('e1rm-preview').innerText()).includes('116.7'), 'e1RM preview')
  await page.getByTestId('log-set').click()
  await page.getByTestId('session-sets').getByText('100 lb × 5').waitFor()
  await shot(page, 'log-workout.png', page.getByTestId('session-sets'))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('app-ready').waitFor()
  await page.getByTestId('machine-note').waitFor()
  assert((await page.getByTestId('machine-note').inputValue()) === 'Seat 4, pin 8', 'machine note was lost on reload')
  await page.getByTestId('session-sets').getByText('100 lb × 5').waitFor()
  await page.getByTestId('finish-workout').click()
  await page.getByTestId('start-empty').waitFor()

  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByTestId('new-routine').click()
  await page.getByTestId('routine-name').fill('Push day')
  await page.getByTestId('routine-toggle-ex-bench').click()
  await page.getByTestId('save-routine').click()
  await page.getByText('Push day').waitFor()

  await page.getByRole('button', { name: 'Log', exact: true }).click()
  await page.getByRole('button', { name: 'Start Push day' }).click()
  await page.getByTestId('last-sets').waitFor()
  const recall = await page.getByTestId('last-sets').innerText()
  assert(recall.includes('100 lb × 5'), `last-set recall missing: ${recall}`)
  await shot(page, 'last-set-recall.png', page.getByTestId('last-sets'))

  await page.getByTestId('weight-value').fill('110')
  await page.getByTestId('reps-value').fill('5')
  await page.getByTestId('log-set').click()
  await page.getByTestId('pr-banner').waitFor()
  const banner = await page.getByTestId('pr-banner').innerText()
  assert(banner.includes('128.3'), `PR banner missing e1RM: ${banner}`)
  assert(banner.includes('116.7'), `PR banner missing previous e1RM: ${banner}`)
  await shot(page, 'pr-e1rm.png', page.getByTestId('pr-banner'))

  await page.getByTestId('add-exercise').click()
  await page.getByTestId('pick-ex-squat').click()
  await page.getByTestId('weight-value').fill('200')
  await page.getByTestId('reps-value').fill('5')
  await page.getByTestId('log-set').click()
  await page.getByTestId('session-sets').getByText('200 lb × 5').waitFor()
  await page.getByTestId('finish-workout').click()
  await page.getByTestId('start-empty').waitFor()

  for (let extra = 0; extra < 2; extra += 1) {
    await page.getByTestId('start-empty').click()
    await page.getByTestId('pick-ex-squat').click()
    await page.getByTestId('weight-value').fill('200')
    await page.getByTestId('reps-value').fill('5')
    await page.getByTestId('log-set').click()
    await page.getByTestId('session-sets').getByText('200 lb × 5').waitFor()
    await page.getByTestId('finish-workout').click()
    await page.getByTestId('start-empty').waitFor()
  }

  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await page.getByTestId('stall-flag').filter({ hasText: 'Back squat' }).waitFor()
  const stall = await page.getByTestId('stall-flag').innerText()
  assert(/not a suggestion|record of the numbers/i.test(stall) || stall.includes('No estimated 1RM increase'), stall)
  assert(!(/deload|you should|add weight/i.test(stall)), stall)
  await shot(page, 'stall-flag.png', page.getByTestId('stall-flag'))
  assert((await page.getByTestId('weekly-volume').innerText()).includes('4050'), await page.getByTestId('weekly-volume').innerText())
  assert((await page.getByTestId('pr-count').innerText()).trim() === '3', await page.getByTestId('pr-count').innerText())
  assert((await page.getByTestId('muscle-credit').innerText()).includes('3000'), 'quad credit missing')
  await page.getByTestId('chart-exercise').selectOption('ex-bench')
  const summary = await page.getByTestId('chart-summary').innerText()
  assert(summary.includes('116.7') && summary.includes('128.3'), summary)
  await shot(page, 'progress-chart.png', page.getByTestId('progress-chart'))

  await page.getByRole('button', { name: 'History', exact: true }).click()
  const history = await page.getByTestId('history-unlocked').innerText()
  assert(history.includes('not locked'), history)
  assert((await page.getByText('Back squat').count()) >= 1, 'history hid a workout')

  await page.getByRole('button', { name: 'More', exact: true }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-csv').click(),
  ])
  const filename = download.suggestedFilename()
  assert(filename.startsWith('musclejot-'), filename)
  const csv = await readFile(await download.path(), 'utf8')
  assert(csv.includes('Bench press') && csv.includes('Back squat'), 'csv missing lifts')
  assert(csv.includes('100') && csv.includes('110') && csv.includes('200'), 'csv missing weights')
  assert(csv.includes('Seat 4, pin 8'), 'csv missing setup note')
  await page.getByTestId('export-status').waitFor()
  assert((await page.getByTestId('export-status').innerText()).includes(filename), 'export status')
  await shot(page, 'csv-export.png', page.getByTestId('export-status'))

  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('app-ready').waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByText('Back squat').first().waitFor()
  await page.getByTestId('history-unlocked').waitFor()
  await shot(page, 'offline-history.png', page.getByTestId('history-unlocked'))
  await context.setOffline(false)

  assert([...hosts].every((host) => host === '127.0.0.1'), `unexpected hosts ${[...hosts].join(',')}`)

  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const desktop = await desk.newPage()
  await desktop.goto(`${ORIGIN}/musclejot/`, { waitUntil: 'domcontentloaded' })
  await desktop.getByTestId('app-ready').waitFor()
  await desktop.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Log', exact: true }).waitFor()
  const deskMark = await desktop.locator('aside img').getAttribute('src')
  assert(deskMark && deskMark.includes('favicon.svg'), 'desktop wordmark missing the icon')
  await desktop.screenshot({ path: path.join(SHOTS, 'desktop-log.png') })
  await desk.close()

  await mkdir(ARTIFACTS, { recursive: true })
  for (const name of [
    'increment-steps.png',
    'log-workout.png',
    'last-set-recall.png',
    'pr-e1rm.png',
    'progress-chart.png',
    'stall-flag.png',
    'csv-export.png',
    'offline-history.png',
    'desktop-log.png',
  ]) {
    await copyFile(path.join(SHOTS, name), path.join(ARTIFACTS, `musclejot_${name}`))
  }
  console.log('MuscleJot browser test passed')
  console.log('csv', filename)
} finally {
  await browser.close()
  server.kill()
}
