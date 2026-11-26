// Needs playwright-core and Chrome. This run used /tmp/pw and /usr/local/bin/google-chrome.
import { createRequire } from "node:module";

const require = createRequire("/tmp/pw/package.json");
const { chromium } = require("playwright-core");
import { spawn } from "node:child_process";

const PORT = 8765;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  cwd: "/workspace",
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${ORIGIN}/routebook/`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Static server did not start");
}

const browser = await chromium.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const requests = [];
try {
  await waitForServer();
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    serviceWorkers: "allow",
  });
  const page = await context.newPage();
  page.on("request", (req) => requests.push(req.url()));
  page.on("pageerror", (err) => {
    console.error("PAGEERROR", err.message);
  });

  await page.addInitScript(() => {
    window.__tracks = [];
    window.__workers = [];
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await orig(constraints);
      window.__tracks.push(...stream.getTracks());
      return stream;
    };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        window.__workers.push(this);
        const stop = this.terminate.bind(this);
        this.terminate = () => {
          this.__terminated = true;
          return stop();
        };
      }
    };
    let state = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => state,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => state === "hidden",
    });
    window.__setVisibility = (next) => {
      state = next;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });

  await page.goto(`${ORIGIN}/routebook/`, { waitUntil: "networkidle" });
  await page.getByTestId("log-odometer").waitFor({ timeout: 15000 });

  const compressed = await page.evaluate(async () => {
    const mod = await import("/routebook/capture-policy.js");
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 420;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, 1600, 420);
    ctx.fillStyle = "#f4f0e6";
    ctx.font = "180px sans-serif";
    ctx.fillText("148230.5", 30, 280);
    const url = mod.compressVerificationCanvas(canvas);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("compressed photo did not decode"));
      img.src = url;
    });
    return { length: url.length, type: url.slice(0, 20), width: img.naturalWidth, height: img.naturalHeight };
  });
  assert(compressed.type.startsWith("data:image/jpeg"), `expected jpeg, got ${compressed.type}`);
  assert(compressed.width <= 640 && compressed.height <= 640, `photo still too large ${compressed.width}x${compressed.height}`);
  assert(compressed.length <= 48000, `photo data URL is ${compressed.length} chars`);
  console.log("compressed", compressed);

  const now = Date.now();
  const day = 86400000;
  await page.evaluate(
    async ({ now, day, gif }) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("routebook", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      assertName: {
        if (db.name !== "routebook") throw new Error(`db name ${db.name}`);
      }
      const tx = db.transaction("entries", "readwrite");
      const store = tx.objectStore("entries");
      store.put({
        id: "old-shift",
        vehicleId: "van",
        vehicleName: "Delivery van",
        purpose: "business",
        note: "old route",
        startOdometer: 1000,
        endOdometer: 1042.5,
        startTime: now - 200 * day,
        endTime: now - 200 * day + 3600000,
        startVerified: true,
        endVerified: true,
        startSource: "photo",
        endSource: "photo",
        startPhoto: "data:image/jpeg;base64," + "A".repeat(400),
        endPhoto: "data:image/jpeg;base64," + "B".repeat(400),
        createdAt: now - 200 * day,
        updatedAt: now - 200 * day,
      });
      store.put({
        id: "new-shift",
        vehicleId: "van",
        vehicleName: "Delivery van",
        purpose: "business",
        note: "kept",
        startOdometer: 2000,
        endOdometer: null,
        startTime: now - day,
        endTime: null,
        startVerified: true,
        endVerified: null,
        startSource: "photo",
        endSource: null,
        startPhoto: gif,
        endPhoto: null,
        createdAt: now - day,
        updatedAt: now - day,
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { now, day, gif: GIF },
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("heading", { name: "Odometer photos" }).waitFor();
  await page.getByText("Mileage, notes, and odometer photos stay on this phone.").waitFor();
  await page.getByText("They are not uploaded.").waitFor();
  const countBefore = (await page.getByTestId("photo-count").innerText()).trim();
  assert(countBefore.startsWith("3 "), `expected 3 photos, saw ${countBefore}`);

  await page.getByTestId("clear-photos").click();
  await page.getByRole("button", { name: "Clear photos" }).click();
  await page.getByTestId("photo-clear-status").waitFor();
  const status = await page.getByTestId("photo-clear-status").innerText();
  assert(status.includes("Removed 2 photos"), status);
  assert(status.includes("Readings and miles are still here"), status);
  const countAfter = (await page.getByTestId("photo-count").innerText()).trim();
  assert(countAfter.startsWith("1 "), `expected 1 photo left, saw ${countAfter}`);

  const stored = await page.evaluate(async (gif) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("routebook", 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    const entries = await new Promise((resolve, reject) => {
      const tx = db.transaction("entries", "readonly");
      const req = tx.objectStore("entries").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const old = entries.find((e) => e.id === "old-shift");
    const recent = entries.find((e) => e.id === "new-shift");
    const vehicles = await new Promise((resolve, reject) => {
      const open = indexedDB.open("routebook", 1);
      open.onsuccess = () => {
        const db2 = open.result;
        const tx = db2.transaction("vehicles", "readonly");
        const req = tx.objectStore("vehicles").getAll();
        req.onsuccess = () => {
          resolve(req.result);
          db2.close();
        };
        req.onerror = () => reject(req.error);
      };
    });
    return {
      name: "routebook",
      old,
      recentPhoto: recent?.startPhoto,
      recentMiles: recent ? [recent.startOdometer, recent.endOdometer, recent.note] : null,
      vehicleCount: vehicles.length,
    };
  }, GIF);
  assert(stored.old.startOdometer === 1000 && stored.old.endOdometer === 1042.5, "old miles changed");
  assert(stored.old.note === "old route", "old note changed");
  assert(stored.old.startPhoto == null && stored.old.endPhoto == null, "old photos were kept");
  assert(stored.recentPhoto === GIF, "recent legacy photo was rewritten");
  assert(stored.recentMiles[2] === "kept", "recent note changed");
  assert(stored.vehicleCount >= 1, "vehicles were deleted");
  console.log("cleared photos, mileage kept");

  await page.getByRole("button", { name: "Shifts", exact: true }).click();
  await page.getByRole("button", { name: /2,000/ }).click();
  const recentImg = page.getByAltText("Cropped odometer from the start of this shift");
  await recentImg.waitFor();
  assert((await recentImg.getAttribute("src")) === GIF, "legacy photo did not render");
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: /1,000/ }).click();
  assert((await page.locator("img[alt*='odometer']").count()) === 0, "cleared photos still render");
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("log-odometer").click();
  await page.getByTestId("take-photo").click();
  await page.waitForFunction(() => window.__tracks.some((t) => t.readyState === "live"), null, {
    timeout: 10000,
  });
  console.log("camera live", await page.evaluate(() => window.__tracks.map((t) => t.readyState)));

  await page.evaluate(() => window.__setVisibility("hidden"));
  await page.waitForFunction(() => window.__tracks.every((t) => t.readyState === "ended"), null, {
    timeout: 5000,
  });
  const paused = await page.getByText("Camera paused.").count();
  console.log("hidden, tracks ended, paused copy", paused);

  await page.evaluate(() => window.__setVisibility("visible"));
  await page.waitForFunction(() => window.__tracks.some((t) => t.readyState === "live"), null, {
    timeout: 10000,
  });
  console.log("camera restored");

  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForFunction(
    () => window.__tracks.every((t) => t.readyState === "ended"),
    null,
    { timeout: 5000 },
  );
  await page.waitForFunction(
    () => window.__workers.length > 0 && window.__workers.every((w) => w.__terminated),
    null,
    { timeout: 15000 },
  );
  const gear = await page.evaluate(() => ({
    tracks: window.__tracks.map((t) => t.readyState),
    workers: window.__workers.map((w) => w.__terminated === true),
  }));
  console.log("released", gear);
  assert(gear.tracks.every((s) => s === "ended"), "a camera track stayed live");
  assert(gear.workers.length > 0 && gear.workers.every(Boolean), "OCR worker was not terminated");

  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) throw new Error("service worker inactive");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("log-odometer").waitFor();
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("log-odometer").waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByText("They are not uploaded.").waitFor();
  console.log("offline reload ok");

  const outside = [...new Set(requests.filter((url) => {
    try {
      return new URL(url).hostname !== "127.0.0.1";
    } catch {
      return true;
    }
  }))];
  console.log("external requests", outside);
  assert(outside.length === 0, `data left the device: ${outside.join(", ")}`);
  assert(!requests.some((url) => /jsdelivr|unpkg|google-analytics|googletagmanager/i.test(url)), "CDN request");

  await context.close();
  console.log("BROWSER_OK");
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
