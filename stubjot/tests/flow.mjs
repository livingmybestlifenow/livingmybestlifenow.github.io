import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const artifacts = '/opt/cursor/artifacts/stubjot'
const base = 'http://127.0.0.1:4173/stubjot/'
const video = '/tmp/stubjot-receipt.y4m'
const still = '/tmp/stubjot-receipt.png'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function counts(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('stubjot')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const read = (store, method) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const request = tx.objectStore(store)[method]()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    const photos = await read('photos', 'count')
    const receipts = await read('receipts', 'getAll')
    return receipts.map((receipt) => ({
      vendor: receipt.vendor,
      verified: receipt.verified,
      amountCents: receipt.amountCents,
      category: receipt.category,
      photo: Boolean(receipt.photoId),
      photos,
    }))
  })
}

async function reachConfirm(page) {
  await page.getByRole('button', { name: 'Use this photo' }).click()
  const keep = page.getByRole('button', { name: 'Keep photo' })
  const reading = page.getByText('Reading the receipt on this device')
  const saving = page.getByText('Saving the photo on this device')
  const heading = page.getByRole('heading', { name: 'Check this receipt' })
  const seen = await Promise.any([
    keep.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'keep'),
    reading.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'reading'),
    saving.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'saving'),
    heading.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'confirm'),
  ])
  if (seen === 'keep') await keep.click()
  if (!(await heading.isVisible().catch(() => false))) {
    await reading.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined)
    const stored = await counts(page)
    assert(stored.some((row) => row.photo && row.verified === false), 'photo was not stored before reading finished')
    const skip = page.getByRole('button', { name: 'Skip reading' })
    if (await skip.isVisible().catch(() => false)) await skip.click()
    await heading.waitFor({ state: 'visible', timeout: 20000 })
  }
}

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${video}`,
  ],
})
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  permissions: ['camera'],
  baseURL: base,
})
page.setDefaultTimeout(20000)

try {
  await mkdir(artifacts, { recursive: true })
  await page.goto(base)
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker?.getRegistration()
    return Boolean(registration?.active)
  })
  await page.reload()
  await page.getByRole('heading', { name: 'Receipts', exact: true }).waitFor()

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/stubjot/manifest.webmanifest')
    return response.json()
  })
  assert(manifest.name === 'StubJot' && manifest.short_name === 'StubJot', 'manifest name')
  assert(manifest.start_url === '/stubjot/' && manifest.scope === '/stubjot/' && manifest.id === '/stubjot/', 'manifest scope')

  await page.getByRole('button', { name: 'Not now' }).click()
  await page.getByRole('button', { name: 'Take a photo' }).click()
  await page.getByRole('button', { name: 'Take photo' }).waitFor()
  await page.screenshot({ path: path.join(artifacts, '01-capture.png') })
  await page.getByRole('button', { name: 'Take photo' }).click()
  await page.getByRole('button', { name: 'Use this photo' }).waitFor()
  await page.screenshot({ path: path.join(artifacts, '02-crop.png') })
  await reachConfirm(page)
  await page.getByLabel('Amount').fill('18.40')
  await page.getByLabel('Date').fill('2026-11-26')
  await page.getByLabel('Vendor').fill('Cafe Joe')
  await page.getByLabel('Category').selectOption('meals')
  await page.getByLabel('Note').fill('shift meal')
  await page.getByText('Confirming the amount, date, vendor, and category keeps your records accurate.').waitFor()
  await page.getByRole('main').getByText('StubJot is not tax advice.').waitFor()
  const before = await counts(page)
  assert(before.some((row) => row.photo && row.verified === false), 'receipt was verified before confirm')
  await page.screenshot({ path: path.join(artifacts, '03-confirm.png') })
  await page.getByRole('button', { name: 'Save receipt' }).click()
  await page.getByRole('heading', { name: 'Receipts', exact: true }).waitFor()
  await page.getByRole('button', { name: /Cafe Joe/ }).waitFor()
  await page.screenshot({ path: path.join(artifacts, '04-list.png') })

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Add' }).click()
  await page.getByRole('button', { name: 'Type a receipt' }).click()
  await page.getByLabel('Vendor').fill('Parking garage')
  await page.getByLabel('Amount').fill('6')
  await page.getByLabel('Category').selectOption('parking')
  await page.getByRole('button', { name: 'Save receipt' }).click()
  await page.getByRole('button', { name: /Parking garage/ }).waitFor()

  await page.getByLabel('Search receipts').fill('cafe')
  await page.getByRole('button', { name: /Cafe Joe/ }).waitFor()
  assert((await page.getByRole('button', { name: /Parking garage/ }).count()) === 0, 'search leaked parking')
  await page.getByLabel('Search receipts').fill('')
  await page.getByLabel('Category').selectOption('parking')
  await page.getByRole('button', { name: /Parking garage/ }).waitFor()
  assert((await page.getByRole('button', { name: /Cafe Joe/ }).count()) === 0, 'category filter leaked cafe')
  await page.getByLabel('Category').selectOption('all')
  await page.getByLabel('Month').waitFor()

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Add' }).click()
  await page.getByLabel('Choose a photo').setInputFiles(still)
  await page.getByRole('button', { name: 'Use this photo' }).waitFor()
  await reachConfirm(page)
  await page.getByRole('button', { name: 'Skip for now' }).click()
  await page.getByText('Unverified', { exact: true }).waitFor()

  await page.getByRole('button', { name: /Cafe Joe/ }).click()
  await page.getByRole('heading', { name: 'Cafe Joe' }).waitFor()
  const photo = page.getByRole('img', { name: 'Receipt photo for Cafe Joe' })
  await photo.waitFor()
  const width = await photo.evaluate((img) => img.naturalWidth)
  assert(width > 0, 'detail photo did not decode')
  await page.screenshot({ path: path.join(artifacts, '05-detail.png') })
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Note').fill('shift meal edited')
  await page.getByRole('button', { name: 'Save receipt' }).click()
  await page.getByText('shift meal edited').waitFor()
  await page.getByRole('main').getByRole('button', { name: 'Receipts' }).click()

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'More' }).click()
  await page.getByRole('heading', { name: 'More' }).waitFor()
  await page.getByText('This phone is the only place these receipts live.').waitFor()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV' }).click()
  const download = await downloadPromise
  assert(download.suggestedFilename().startsWith('stubjot-'), `filename ${download.suggestedFilename()}`)
  assert(download.suggestedFilename().endsWith('.csv'), 'csv extension')
  const csvPath = path.join(artifacts, download.suggestedFilename())
  await download.saveAs(csvPath)
  const csv = await readFile(csvPath, 'utf8')
  assert(csv.includes('Cafe Joe'), 'csv missing vendor')
  assert(csv.includes('18.40'), 'csv missing amount')
  assert(csv.includes('Parking garage'), 'csv missing manual receipt')
  assert(csv.includes(',no,'), 'csv missing unverified row')
  await page.getByText('CSV downloaded.').waitFor()
  await page.screenshot({ path: path.join(artifacts, '06-csv.png') })

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Receipts' }).click()
  await page.getByRole('button', { name: /Parking garage/ }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete receipt' }).click()
  await page.getByText('Receipt deleted from this device.').waitFor()
  assert((await page.getByRole('button', { name: /Parking garage/ }).count()) === 0, 'deleted receipt still listed')

  await page.context().setOffline(true)
  await page.reload()
  await page.getByRole('heading', { name: 'Receipts', exact: true }).waitFor()
  await page.getByRole('button', { name: /Cafe Joe/ }).waitFor()
  await page.screenshot({ path: path.join(artifacts, '07-offline.png') })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByText('Receipts on this device.').waitFor()
  await page.screenshot({ path: path.join(artifacts, '08-desktop.png') })
  console.log('flow ok')
} catch (error) {
  await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => undefined)
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
