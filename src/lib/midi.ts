/**
 * MIDI out.
 *
 * Turns the instrument into a controller for any sound rather than only its own,
 * and makes a performance recordable in anything that takes MIDI. It mirrors the
 * synth's behaviour deliberately: common tones between chords are held rather
 * than retriggered, because a receiving instrument hears a retrigger as a new
 * note and the whole point of the voice leading is that it does not.
 *
 * Chrome and Firefox implement Web MIDI. Safari has declined it for years over
 * fingerprinting, so this degrades to saying so rather than to a broken control.
 */

/** Continuous controllers chosen for what receivers conventionally do with them. */
const CC_VOLUME = 7
const CC_BRIGHTNESS = 74
const CHANNEL = 0

export type MidiStatus = 'unsupported' | 'idle' | 'asking' | 'ready' | 'denied'

export interface MidiPort {
  id: string
  name: string
}

const toNote = (hz: number) => Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(hz / 440))))

export function midiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
}

export class MidiOut {
  private access: MIDIAccess | null = null
  private port: MIDIOutput | null = null
  private sounding: number[] = []
  private lastVolume = -1
  private lastBrightness = -1

  /** Prompts for access. The browser asks the player, not us. */
  async connect(): Promise<MidiPort[]> {
    if (!midiSupported()) throw new Error('This browser does not support MIDI output.')
    this.access = await navigator.requestMIDIAccess()
    const ports = this.ports()
    // Somewhere sensible to start; the player can choose another.
    if (!this.port && ports[0]) this.use(ports[0].id)
    return ports
  }

  ports(): MidiPort[] {
    if (!this.access) return []
    return [...this.access.outputs.values()].map((o) => ({ id: o.id, name: o.name ?? o.id }))
  }

  use(id: string): void {
    const next = this.access?.outputs.get(id) ?? null
    if (next === this.port) return
    this.allNotesOff()
    this.port = next
  }

  get connected(): boolean {
    return this.port !== null
  }

  /** Holds common tones, exactly as the synth's own voices do. */
  play(freqs: number[], velocity: number): void {
    if (!this.port) return
    const wanted = freqs.map(toNote)
    const level = Math.max(1, Math.min(127, Math.round(40 + velocity * 87)))

    for (const note of this.sounding) {
      if (!wanted.includes(note)) this.send([0x80 | CHANNEL, note, 0])
    }
    for (const note of wanted) {
      if (!this.sounding.includes(note)) this.send([0x90 | CHANNEL, note, level])
    }
    this.sounding = wanted
  }

  /** Volume and filter as controllers, sent only when they actually move. */
  expression(volume: number, tilt: number): void {
    if (!this.port) return
    const vol = Math.max(0, Math.min(127, Math.round(volume * 127)))
    // Tilt runs -1..1; brightness is one-sided, so centre it.
    const bright = Math.max(0, Math.min(127, Math.round((tilt + 1) * 63.5)))
    if (vol !== this.lastVolume) {
      this.send([0xb0 | CHANNEL, CC_VOLUME, vol])
      this.lastVolume = vol
    }
    if (bright !== this.lastBrightness) {
      this.send([0xb0 | CHANNEL, CC_BRIGHTNESS, bright])
      this.lastBrightness = bright
    }
  }

  stop(): void {
    this.allNotesOff()
  }

  dispose(): void {
    this.allNotesOff()
    this.port = null
    this.access = null
  }

  private allNotesOff(): void {
    for (const note of this.sounding) this.send([0x80 | CHANNEL, note, 0])
    this.sounding = []
  }

  private send(bytes: number[]): void {
    try {
      this.port?.send(bytes)
    } catch {
      // A port can vanish between frames when a device is unplugged. Dropping a
      // message is better than stopping the instrument that is still sounding.
    }
  }
}
