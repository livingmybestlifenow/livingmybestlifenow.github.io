import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  PHOTO_LONG_EDGE,
  PHOTO_MIN_EDGE,
  clearEntryPhotos,
  encodeSteps,
  isOlderThan,
  photoMaxAgeMs,
  scaleToLongEdge,
  stopMediaStream,
  terminateOcrHandle,
} from "../routebook/capture-policy.js";

const day = 86400000;

test("downscale caps the long edge and never upscales", () => {
  const big = scaleToLongEdge(1920, 400, PHOTO_LONG_EDGE);
  assert.equal(Math.max(big.width, big.height), PHOTO_LONG_EDGE);
  assert.ok(big.width < 1920);
  const small = scaleToLongEdge(200, 80, PHOTO_LONG_EDGE);
  assert.deepEqual(small, { width: 200, height: 80 });
});

test("encode plan stays within a verification-sized crop", () => {
  const steps = encodeSteps(1600, 420);
  assert.ok(steps.length >= 4);
  for (const step of steps) {
    assert.ok(Math.max(step.width, step.height) <= PHOTO_LONG_EDGE);
    assert.ok(Math.max(step.width, step.height) >= PHOTO_MIN_EDGE || step.width <= 1600);
    assert.ok(step.quality <= 0.62 && step.quality >= 0.4);
  }
  const tiny = encodeSteps(180, 70);
  assert.ok(tiny.every((step) => step.width === 180 && step.height === 70));
});

test("clearing photos keeps the mileage record", () => {
  const now = 1_700_000_000_000;
  const original = {
    id: "shift-1",
    vehicleId: "van",
    vehicleName: "Delivery van",
    purpose: "business",
    note: "dock 4",
    startOdometer: 12034.5,
    endOdometer: 12088,
    startTime: now - 120 * day,
    endTime: now - 120 * day + 3_600_000,
    startVerified: true,
    endVerified: false,
    startSource: "photo",
    endSource: "photo",
    startPhoto: "data:image/png;base64,OLDSTART",
    endPhoto: "data:image/jpeg;base64,OLDEND",
    createdAt: now - 120 * day,
    updatedAt: now - 120 * day,
  };
  const { entry, removed } = clearEntryPhotos(original, now, 90 * day);
  assert.equal(removed, 2);
  assert.equal(entry.startPhoto, null);
  assert.equal(entry.endPhoto, null);
  assert.equal(entry.id, original.id);
  assert.equal(entry.startOdometer, 12034.5);
  assert.equal(entry.endOdometer, 12088);
  assert.equal(entry.note, "dock 4");
  assert.equal(entry.purpose, "business");
  assert.equal(entry.vehicleName, "Delivery van");
  assert.equal(entry.startVerified, true);
  assert.equal(entry.endVerified, false);
  assert.equal(original.startPhoto.includes("OLDSTART"), true);
  assert.equal(entry.updatedAt, now);
});

test("recent photos and legacy data URLs stay put", () => {
  const now = 1_700_000_000_000;
  const legacy = "data:image/png;base64,LEGACY";
  const recent = {
    id: "new",
    startOdometer: 10,
    endOdometer: null,
    startTime: now - 2 * day,
    endTime: null,
    startPhoto: legacy,
    endPhoto: null,
    note: "",
  };
  const { entry, removed } = clearEntryPhotos(recent, now, photoMaxAgeMs("90"));
  assert.equal(removed, 0);
  assert.equal(entry.startPhoto, legacy);
  assert.equal(entry.endOdometer, null);
  assert.equal(entry.updatedAt, undefined);
});

test("all clears every photo; an open shift uses the start time for a missing end", () => {
  const now = 5_000_000;
  const entry = {
    id: "open",
    startOdometer: 50,
    endOdometer: 80,
    startTime: now - 10 * day,
    endTime: null,
    startPhoto: "data:image/jpeg;base64,A",
    endPhoto: "data:image/jpeg;base64,B",
  };
  const aged = clearEntryPhotos(entry, now, photoMaxAgeMs("30"));
  assert.equal(aged.removed, 0);
  const all = clearEntryPhotos(entry, now, photoMaxAgeMs("all"));
  assert.equal(all.removed, 2);
  assert.equal(all.entry.startOdometer, 50);
  assert.equal(all.entry.endOdometer, 80);
  assert.equal(isOlderThan(undefined, now, day), false);
});

test("only the old end photo is removed when the start is recent", () => {
  const now = 9_000_000_000;
  const entry = {
    id: "mixed",
    startOdometer: 1,
    endOdometer: 2,
    startTime: now - 2 * day,
    endTime: now - 400 * day,
    startPhoto: "data:image/jpeg;base64,NEW",
    endPhoto: "data:image/jpeg;base64,OLD",
  };
  const { entry: next, removed } = clearEntryPhotos(entry, now, 365 * day);
  assert.equal(removed, 1);
  assert.equal(next.startPhoto.includes("NEW"), true);
  assert.equal(next.endPhoto, null);
  assert.equal(next.endOdometer, 2);
});

test("stopMediaStream stops every track and ignores a missing stream", () => {
  const stopped = [];
  const stream = {
    getTracks() {
      return [{ stop: () => stopped.push("a") }, { stop: () => stopped.push("b") }];
    },
  };
  stopMediaStream(stream);
  stopMediaStream(null);
  assert.deepEqual(stopped, ["a", "b"]);
});

test("terminateOcrHandle stops a worker and a worker promise", async () => {
  const calls = [];
  const worker = { terminate: () => calls.push("now") };
  terminateOcrHandle(worker);
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  terminateOcrHandle(pending);
  terminateOcrHandle(null);
  resolve({ terminate: () => calls.push("later") });
  await pending;
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, ["now", "later"]);
});

test("service worker does no idle polling or background sync", () => {
  const sw = fs.readFileSync(new URL("../routebook/sw.js", import.meta.url), "utf8");
  assert.equal(sw.includes("setInterval"), false);
  assert.equal(sw.includes("periodicSync"), false);
  assert.equal(sw.includes("sync.register"), false);
  assert.equal(sw.includes("cdn.jsdelivr.net"), false);
  assert.equal(sw.includes("google-analytics"), false);
  assert.equal(sw.includes("precacheAndRoute"), true);
  assert.equal(sw.includes("capture-policy.js"), true);
});

test("shipped app does not point Tesseract at a CDN", () => {
  const html = fs.readFileSync(new URL("../routebook/index.html", import.meta.url), "utf8");
  const match = html.match(/src="(\/routebook\/assets\/index-[^"]+\.js)"/);
  assert.ok(match, "index.html should load the app module");
  const js = fs.readFileSync(new URL(`..${match[1]}`, import.meta.url), "utf8");
  assert.equal(js.includes("cdn.jsdelivr.net"), false);
  assert.equal(js.includes("unpkg.com"), false);
  assert.equal(js.includes("google-analytics"), false);
  assert.equal(js.includes("googletagmanager"), false);
  assert.equal(js.includes('langPath:br(`tessdata`)'), true);
  assert.equal(js.includes('workerPath:br(`tesseract/worker.min.js`)'), true);
  assert.equal(js.includes('corePath:br(`tesseract`)'), true);
  assert.equal(js.includes("var nt=`routebook`") || js.includes("var nt = `routebook`"), true);
  assert.match(js, /compressVerificationCanvas/);
  assert.match(js, /clearEntryPhotos/);
  assert.match(js, /pagehide/);
  assert.match(js, /visibilitychange/);
  const worker = fs.readFileSync(new URL("../routebook/tesseract/worker.min.js", import.meta.url), "utf8");
  assert.equal(worker.includes("cdn.jsdelivr.net"), false);
  assert.equal(worker.includes("https://"), false);
});
