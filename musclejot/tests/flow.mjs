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
  await page.getByTestId('safety-gate').waitFor()
  assert((await page.getByTestId('start-empty').count()) === 0, 'logging was available before the safety note')
  await page.getByText('not medical, injury, or diet advice').waitFor()
  await page.getByText('use a spotter').waitFor()
  await page.screenshot({ path: path.join(SHOTS, 'safety-gate.png'), fullPage: true })
  await page.getByRole('button', { name: 'I understand' }).click()
  await page.getByTestId('safety-gate').waitFor({ state: 'hidden' })
  const mark = await page.locator('h1 img').getAttribute('src')
  assert(mark && mark.includes('/musclejot/favicon.svg'), `wordmark icon ${mark}`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('app-ready').waitFor()
  assert((await page.getByTestId('safety-gate').count()) === 0, 'the safety screen showed again after it was acknowledged')
  assert(await page.evaluate(() => navigator.serviceWorker.controller != null), 'service worker is not controlling the page')

  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByTestId('safety-section').waitFor()
  await shot(page, 'safety-more.png', page.getByTestId('safety-section'))
  await page.getByText('Install app').waitFor()
  const unitSelect = page.getByTestId('weight-unit')
  assert((await unitSelect.inputValue()) === 'lb', 'weight unit should default to lb')
  const unitOptions = await unitSelect.locator('option').allTextContents()
  assert(unitOptions.includes('lb') && unitOptions.includes('kg'), `unit options ${unitOptions.join(',')}`)
  await page.getByTestId('plate-step').fill('2.5')
  await page.getByTestId('dumbbell-step').fill('5')
  await page.getByTestId('stall-sessions').fill('3')
  await page.getByTestId('plate-step').waitFor()
  assert((await page.getByTestId('plate-step').inputValue()) === '2.5', 'plate step did not stick')
  await page.getByTestId('chime-preview').click()
  await page.getByTestId('chime').selectOption('soft')
  assert((await page.getByTestId('rest-autostart').getAttribute('aria-pressed')) === 'true', 'rest should auto-start')
  await shot(page, 'chime-panel.png', page.getByTestId('chime-panel'))

  await page.getByRole('button', { name: 'Log', exact: true }).click()
  await page.getByTestId('start-hint').waitFor()
  assert(await page.getByTestId('start-empty').isDisabled(), 'Start workout should wait for a choice')
  assert((await page.getByTestId('start-hint').innerText()).includes('Pick a workout to start'), 'missing start hint')
  await shot(page, 'pick-workout.png', page.getByTestId('start-hint'))
  await page.getByTestId('pick-new-workout').click()
  assert(!(await page.getByTestId('start-empty').isDisabled()), 'Start workout stayed disabled after a choice')
  await page.getByTestId('start-empty').click()
  await page.getByTestId('workout-timer').waitFor()
  await page.getByTestId('pause-workout').click()
  await page.getByTestId('resume-workout').waitFor()
  const frozen = (await page.getByTestId('workout-clock').innerText()).trim()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('app-ready').waitFor()
  await page.getByTestId('resume-workout').waitFor()
  assert((await page.getByTestId('workout-clock').innerText()).trim() === frozen, 'pause did not survive reload')
  await shot(page, 'paused-workout.png', page.getByTestId('workout-timer'))
  await page.getByTestId('resume-workout').click()
  await page.getByTestId('pause-workout').waitFor()
  await shot(page, 'workout-timer.png', page.getByTestId('workout-timer'))
  await page.getByTestId('add-exercise').click()
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
  await page.getByTestId('start-set-timer').click()
  await page.getByTestId('stop-set-timer').waitFor()
  await page.getByTestId('stop-set-timer').click()
  await page.getByTestId('start-set-timer').waitFor()
  await page.getByTestId('log-set').click()
  await page.getByTestId('session-sets').getByText('100 lb × 5').waitFor()
  await page.getByTestId('session-sets').getByText('0:01').waitFor()
  await page.getByTestId('rest-timer').waitFor()
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
  await page.getByRole('button', { name: 'Edit Push day' }).waitFor()

  await page.getByRole('button', { name: 'Log', exact: true }).click()
  await page.getByRole('button', { name: 'Push day', exact: true }).click()
  await page.getByTestId('start-empty').click()
  await page.getByTestId('last-sets').waitFor()
  const recall = await page.getByTestId('last-sets').innerText()
  assert(recall.includes('100 lb × 5'), `last-set recall missing: ${recall}`)
  await shot(page, 'last-set-recall.png', page.getByTestId('last-sets'))

  await page.getByTestId('weight-value').fill('110')
  await page.getByTestId('reps-value').fill('5')
  await page.getByTestId('log-set').click()
  await page.getByTestId('pr-banner').waitFor()
  const banner = await page.getByTestId('pr-banner').innerText()
  assert(banner.includes('Never push through pain'), 'PR reminder missing')
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
    await page.getByTestId('pick-new-workout').click()
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
  const stallNote = await page.getByText('Never push through pain').first().innerText()
  assert(stallNote.includes('Never push through pain'), stallNote)
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
  assert(csv.includes('set_duration_sec') && csv.includes('workout_duration_sec'), 'csv missing duration columns')
  assert(csv.includes('active_sec') && csv.includes('rest_sec') && csv.includes('paused_sec'), 'csv missing time columns')
  await page.getByTestId('export-status').waitFor()
  assert((await page.getByTestId('export-status').innerText()).includes(filename), 'export status')
  await shot(page, 'csv-export.png', page.getByTestId('export-status'))

  await page.getByTestId('weight-unit').selectOption('kg')
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: /1 set · Bench press/ }).click()
  await page.getByText('45.4 kg').waitFor()
  await page.getByTestId('workout-time').waitFor()
  assert((await page.getByTestId('workout-time').innerText()).includes('% active'), await page.getByTestId('workout-time').innerText())
  await shot(page, 'time-summary.png', page.getByTestId('workout-time'))
  await shot(page, 'weight-unit-kg.png', page.getByText('45.4 kg'))
  await page.getByTestId('edit-set').click()
  await page.getByTestId('set-duration').fill('30')
  await page.getByTestId('save-set').click()
  await page.locator('.font-mono').filter({ hasText: '0:30' }).waitFor()
  await page.getByTestId('save-template').click()
  await page.getByTestId('template-saved').waitFor()
  await shot(page, 'edit-set.png', page.getByTestId('workout-editor'))
  await page.getByRole('button', { name: 'All workouts' }).click()
  await page.getByRole('button', { name: /2 sets/ }).click()
  await page.getByTestId('move-up-ex-squat').click()
  await page.waitForFunction(() => document.querySelector('[data-testid="move-up-ex-squat"]')?.hasAttribute('disabled'))
  const firstLift = await page.getByTestId('workout-editor').getByRole('heading').first().innerText()
  assert(firstLift === 'Back squat', `expected Back squat first, saw ${firstLift}`)
  await shot(page, 'reorder-exercises.png', page.getByTestId('workout-editor'))
  await page.getByRole('button', { name: 'All workouts' }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Thursday' }).click()
  await page.getByTestId('routine-name').fill('Thursday again')
  await page.getByRole('button', { name: 'Save template' }).click()
  await page.getByRole('button', { name: 'Edit Thursday again' }).waitFor()
  const templateCard = page.locator('li').filter({ has: page.getByRole('button', { name: 'Edit Thursday again' }) })
  await templateCard.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByTestId('confirm-delete-template').click()
  await page.getByTestId('undo-toast').waitFor()
  await page.getByTestId('undo').click()
  await page.getByRole('button', { name: 'Edit Thursday again' }).waitFor()
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByText('Back squat').first().waitFor()
  await shot(page, 'template-kept-history.png', page.getByTestId('history-unlocked'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('app-ready').waitFor()
  await page.getByRole('button', { name: 'More', exact: true }).click()
  assert((await page.getByTestId('weight-unit').inputValue()) === 'kg', 'weight unit was not saved on this device')
  assert((await page.getByTestId('plate-step').inputValue()) === '2.5', 'kg plate step should default to 2.5')
  const [kgDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-csv').click(),
  ])
  const kgCsv = await readFile(await kgDownload.path(), 'utf8')
  assert(kgCsv.includes('weight,unit,reps'), kgCsv.slice(0, 180))
  assert(kgCsv.includes('45.4,kg,5'), 'csv did not convert the 100 lb set into the selected unit')
  assert(kgCsv.includes('logged_weight,logged_unit') && kgCsv.includes('100,lb'), 'csv dropped the logged weight')
  await shot(page, 'weight-unit.png', page.getByTestId('weight-unit'))

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
  await desktop.getByRole('button', { name: 'I understand' }).click()
  await desktop.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Log', exact: true }).waitFor()
  const deskMark = await desktop.locator('aside img').getAttribute('src')
  assert(deskMark && deskMark.includes('favicon.svg'), 'desktop wordmark missing the icon')
  await desktop.screenshot({ path: path.join(SHOTS, 'desktop-log.png') })
  await desk.close()

  await mkdir(ARTIFACTS, { recursive: true })
  for (const name of [
    'pick-workout.png',
    'paused-workout.png',
    'workout-timer.png',
    'chime-panel.png',
    'time-summary.png',
    'edit-set.png',
    'reorder-exercises.png',
    'safety-gate.png',
    'safety-more.png',
    'increment-steps.png',
    'log-workout.png',
    'last-set-recall.png',
    'pr-e1rm.png',
    'progress-chart.png',
    'stall-flag.png',
    'csv-export.png',
    'weight-unit.png',
    'weight-unit-kg.png',
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
