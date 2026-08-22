/**
 * The few things worth remembering between visits: which voice you chose, which
 * key you were in, and whether you have been shown around. Nothing else — this
 * is not a profile, and nothing here leaves the device, which is the same
 * promise the camera makes.
 */

const PREFIX = 'airchord.'

/** Private windows, disabled site data, and thumbnailers all throw here. A
 *  forgotten preference is not worth an exception. */
export function recall<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function remember(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Nothing to do and nothing worth saying.
  }
}
