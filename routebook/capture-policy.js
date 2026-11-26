// On-device photo and capture policy for GloveJot.
// Mileage records stay in IndexedDB "routebook". Only photo fields are cleared.

export const PHOTO_LONG_EDGE = 640;
export const PHOTO_MIN_EDGE = 320;
export const PHOTO_TARGET_CHARS = 48000;
export const PHOTO_QUALITIES = [0.62, 0.54, 0.46, 0.4];
export const DAY_MS = 86400000;

export function scaleToLongEdge(width, height, maxEdge) {
  const long = Math.max(1, width, height);
  const scale = Math.min(1, maxEdge / long);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Smallest useful JPEG first. Never upscales. Shrinks only if the file is still large.
export function encodeSteps(width, height) {
  const steps = [];
  const seen = new Set();
  let edge = PHOTO_LONG_EDGE;
  for (let guard = 0; guard < 6; guard += 1) {
    const size = scaleToLongEdge(width, height, edge);
    const key = `${size.width}x${size.height}`;
    if (!seen.has(key)) {
      seen.add(key);
      for (const quality of PHOTO_QUALITIES) steps.push({ ...size, quality });
    }
    const long = Math.max(size.width, size.height);
    if (long <= PHOTO_MIN_EDGE) break;
    const next = Math.max(PHOTO_MIN_EDGE, Math.round(long * 0.75));
    if (next >= long) break;
    edge = next;
  }
  return steps;
}

export function compressVerificationCanvas(source) {
  if (!source || !(source.width > 0) || !(source.height > 0)) return null;
  if (typeof document === "undefined") return null;
  const steps = encodeSteps(source.width, source.height);
  let best = null;
  let canvas = null;
  let lastKey = "";
  for (const step of steps) {
    const key = `${step.width}x${step.height}`;
    if (key !== lastKey) {
      canvas = document.createElement("canvas");
      canvas.width = step.width;
      canvas.height = step.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return best;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, step.width, step.height);
      lastKey = key;
    }
    let url;
    try {
      url = canvas.toDataURL("image/jpeg", step.quality);
    } catch {
      return best;
    }
    if (!url || url === "data:,") return best;
    best = url;
    if (url.length <= PHOTO_TARGET_CHARS) return url;
  }
  return best;
}

export function isStoredPhoto(value) {
  return typeof value === "string" && value.length > 0;
}

// null maxAgeMs clears every stored photo. Invalid timestamps are kept.
export function isOlderThan(takenAt, now, maxAgeMs) {
  if (maxAgeMs == null) return true;
  if (typeof takenAt !== "number" || !Number.isFinite(takenAt)) return false;
  return now - takenAt >= maxAgeMs;
}

export function photoMaxAgeMs(choice) {
  if (choice === "all") return null;
  const days = Number(choice);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("Choose how old the photos should be.");
  }
  return days * DAY_MS;
}

export function clearEntryPhotos(entry, now, maxAgeMs) {
  const next = { ...entry };
  let removed = 0;
  if (isStoredPhoto(next.startPhoto) && isOlderThan(next.startTime, now, maxAgeMs)) {
    next.startPhoto = null;
    removed += 1;
  }
  const endAt = next.endTime == null ? next.startTime : next.endTime;
  if (isStoredPhoto(next.endPhoto) && isOlderThan(endAt, now, maxAgeMs)) {
    next.endPhoto = null;
    removed += 1;
  }
  if (removed > 0) next.updatedAt = now;
  return { entry: next, removed };
}

export function stopMediaStream(stream) {
  if (!stream || typeof stream.getTracks !== "function") return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* already ended */
    }
  }
}

export async function extinguishTorch(track) {
  if (
    !track ||
    typeof track.getCapabilities !== "function" ||
    typeof track.applyConstraints !== "function"
  ) {
    return;
  }
  let caps;
  try {
    caps = track.getCapabilities();
  } catch {
    return;
  }
  if (!caps || caps.torch !== true) return;
  try {
    await track.applyConstraints({ advanced: [{ torch: false }] });
  } catch {
    /* light is already off */
  }
}

export async function releaseWakeLock(lock) {
  if (!lock || typeof lock.release !== "function") return;
  try {
    await lock.release();
  } catch {
    /* already released */
  }
}

export function terminateOcrHandle(handle) {
  if (!handle) return;
  if (typeof handle.then === "function") {
    handle.then((worker) => terminateOcrHandle(worker)).catch(() => {});
    return;
  }
  if (typeof handle.terminate !== "function") return;
  try {
    const result = handle.terminate();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    /* worker already stopped */
  }
}
