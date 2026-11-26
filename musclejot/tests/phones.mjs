// Touch checks on Android Chrome presets and iPhone WebKit presets.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium, webkit, devices } = require('playwright-core')

const PORT = 8792
const ORIGIN = `http://127.0.0.1:${PORT}`
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SHOTS = '/tmp/musclejot-phone-shots'
const ARTIFACTS = '/opt/cursor/artifacts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function standaloneInit() {
  return () => {
    const original = window.matchMedia.bind(window)
    window.matchMedia = (query) => {
      const text = String(query)
      if (text.includes('display-mode')) {
        return {
          matches: text.includes('standalone'),
          media: text,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false
          },
        }
      }
      return original(query)
    }
  }
}

async function seedOldLog(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('musclejot', 1)
      request.onupgradeneeded = () => {
        const db = request.result
        for (const name of ['exercises', 'workouts', 'sets', 'routines', 'notes', 'meta']) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: name === 'notes' ? 'exerciseId' : name === 'meta' ? 'key' : 'id' })
          }
        }
      }
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['meta', 'routines', 'workouts', 'exercises'], 'readwrite')
        tx.objectStore('meta').put({ key: 'safetyAckAt', value: Date.now() - 86400000 })
        tx.objectStore('meta').put({ key: 'seeded', value: true })
        tx.objectStore('routines').put({
          id: 'old-push',
          name: 'Old Push',
          exerciseIds: ['ex-bench'],
          createdAt: 1,
          updatedAt: 1,
        })
        tx.objectStore('workouts').put({
          id: 'old-w',
          name: 'Old session',
          startedAt: 1,
          finishedAt: 2,
          updatedAt: 2,
        })
        tx.objectStore('exercises').put({
          id: 'ex-bench',
          name: 'Bench press',
          equipment: 'barbell',
          primary: 'chest',
          secondary: ['triceps'],
          custom: false,
        })
        tx.oncomplete = () => {
          db.close()
          resolve(undefined)
        }
        tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    })
  })
}

async function typeName(page, text) {
  const name = page.getByTestId('new-workout-name')
  await name.tap()
  await name.evaluate((element) => {
    element.focus()
    element.select()
  })
  await page.keyboard.type(text)
  if ((await name.inputValue()) !== text) {
    await name.evaluate((element) => {
      element.focus()
      element.select()
    })
    await page.keyboard.press('Backspace')
    await page.keyboard.type(text)
  }
  assert((await name.inputValue()) === text, `typed name was ${await name.inputValue()}`)
  const size = await name.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
  assert(size >= 16, `name font ${size}`)
  assert(await name.evaluate((element) => !element.readOnly && !element.disabled), 'name field is locked')
}

async function runPhone(browser, deviceName, { old, shotPrefix, log }) {
  const device = devices[deviceName]
  const context = await browser.newContext({
    ...device,
    locale: 'en-US',
    serviceWorkers: 'allow',
  })
  await context.addInitScript(standaloneInit())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => {
    if (/audio device/i.test(error.message)) return
    errors.push(error.message)
  })
  await page.goto(`${ORIGIN}/musclejot/`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('app-ready').waitFor({ timeout: 15000 })
  if (old) {
    await seedOldLog(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('app-ready').waitFor()
  }
  if (await page.getByTestId('safety-gate').count()) {
    await page.getByTestId('safety-ack').tap()
    await page.getByTestId('safety-gate').waitFor({ state: 'hidden' })
  }
  assert(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches), 'standalone display mode was not emulated')
  const choice = page.getByTestId('workout-choice')
  await choice.waitFor()
  const probe = await choice.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const style = getComputedStyle(el)
    return {
      hit: hit === el,
      disabled: el.disabled,
      label: Boolean(el.closest('label')),
      font: parseFloat(style.fontSize),
      pointer: style.pointerEvents,
      options: [...el.options].map((option) => option.text),
    }
  })
  assert(probe.hit, `${deviceName} something covers the workout select`)
  assert(probe.pointer === 'auto' && !probe.disabled && !probe.label, `${deviceName} select is inert`)
  assert(probe.font >= 16, `${deviceName} select font ${probe.font}`)
  assert(probe.options.includes('New workout'), `${deviceName} missing New workout`)
  if (old) assert(probe.options.includes('Old Push'), `${deviceName} lost the saved template`)
  await choice.tap()
  await page.getByTestId('workout-choice-menu').waitFor()
  await page.screenshot({ path: path.join(SHOTS, `${shotPrefix}-menu.png`) })
  await page.getByTestId('workout-choice-option-new').tap()
  await page.getByTestId('new-workout-name').waitFor()
  await typeName(page, 'Phone day')
  assert(!(await page.getByTestId('start-empty').isDisabled()), `${deviceName} Start stayed disabled`)
  await page.screenshot({ path: path.join(SHOTS, `${shotPrefix}-name.png`) })
  if (log) {
    await page.getByTestId('start-empty').tap()
    await page.getByTestId('exercise-search').waitFor()
    await page.getByTestId('exercise-search').tap()
    await page.keyboard.type('bench press')
    await page.getByTestId('pick-ex-bench').tap()
    await page.getByTestId('weight-value').fill('100')
    await page.getByTestId('reps-value').fill('5')
    await page.getByTestId('log-set').tap()
    await page.getByTestId('session-sets').getByText('100 lb × 5').waitFor({ timeout: 10000 })
    await page.screenshot({ path: path.join(SHOTS, `${shotPrefix}-logged.png`) })
  }
  await page.getByRole('button', { name: 'More', exact: true }).tap()
  assert((await page.getByTestId('build-label').innerText()).includes('Build '), `${deviceName} missing build label`)
  assert(errors.length === 0, `${deviceName} errors ${errors.join(' | ')}`)
  await context.close()
  console.log(`ok ${deviceName}${old ? ' old-data' : ' fresh'}`)
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

try {
  await waitForServer()
  await mkdir(SHOTS, { recursive: true })
  const chrome = await chromium.launch({
    executablePath: '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  await runPhone(chrome, 'Galaxy S9+', { old: false, shotPrefix: 'android-galaxy', log: true })
  await runPhone(chrome, 'Pixel 7', { old: true, shotPrefix: 'android-pixel-old', log: true })
  await chrome.close()

  const ios = await webkit.launch()
  await runPhone(ios, 'iPhone 14', { old: false, shotPrefix: 'iphone14', log: true })
  await runPhone(ios, 'iPhone SE', { old: true, shotPrefix: 'iphone-se-old', log: true })
  await ios.close()

  await mkdir(ARTIFACTS, { recursive: true })
  for (const name of [
    'android-galaxy-menu.png',
    'android-galaxy-name.png',
    'android-galaxy-logged.png',
    'android-pixel-old-menu.png',
    'android-pixel-old-name.png',
    'android-pixel-old-logged.png',
    'iphone14-menu.png',
    'iphone14-name.png',
    'iphone14-logged.png',
    'iphone-se-old-menu.png',
    'iphone-se-old-name.png',
    'iphone-se-old-logged.png',
  ]) {
    await copyFile(path.join(SHOTS, name), path.join(ARTIFACTS, `musclejot_${name}`))
  }
  console.log('phone checks passed')
} finally {
  server.kill()
}
