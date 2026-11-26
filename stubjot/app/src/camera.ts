export async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Camera API missing', 'NotSupportedError')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    })
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'OverconstrainedError' || error.name === 'NotFoundError')) {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true })
    }
    throw error
  }
}

export function cameraMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (!window.isSecureContext) {
    return 'The camera needs a secure page (https). Type the receipt, or open the installed app.'
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Camera access is blocked. Allow the camera in the browser’s site settings, or type the receipt.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'No usable camera was found on this device. Type the receipt or choose a photo.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'The camera is busy in another app. Close it, or type the receipt.'
  }
  if (name === 'NotSupportedError') {
    return 'This browser has no camera. Type the receipt or choose a photo.'
  }
  return 'The camera could not be opened. Type the receipt or choose a photo.'
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

export function torchAvailable(track: MediaStreamTrack): boolean {
  const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
  return caps?.torch === true
}

export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<void> {
  await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
}
