import type { Fingers, HandState } from './vision'
import { LEAN_BAND } from './chords'
import { CONNECTIONS, DIAL, TIPS, frameOf, handTemplate, place } from './pose'

/** One hue per scale degree, so the wave tells you where you are in the key. */
const DEGREE_HUES: Record<number, string> = {
  1: '232, 161, 61',
  2: '210, 50, 120',
  3: '180, 40, 150',
  4: '240, 210, 40',
  5: '245, 120, 30',
  6: '230, 40, 40',
  7: '100, 200, 250',
}

export interface WaveState {
  degree: number
  major: boolean
  /** Right-hand fingers, 0-4. Zero draws nothing. */
  voices: number
  volume: number
  tilt: number
  now: number
}

export class Overlay {
  private ctx: CanvasRenderingContext2D
  /** Device pixels per CSS pixel, so the layout constants below stay honest. */
  private scale = 1
  private onResize = () => this.resize()

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', this.onResize)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
  }

  private resize(): void {
    this.scale = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(this.canvas.clientWidth * this.scale)
    this.canvas.height = Math.round(this.canvas.clientHeight * this.scale)
  }

  private get width(): number { return this.canvas.width }
  private get height(): number { return this.canvas.height }

  /** Mirrored, cover-fit camera feed, dimmed so the HUD stays readable. */
  drawFrame(video: HTMLVideoElement): void {
    const { ctx, width: w, height: h } = this
    ctx.clearRect(0, 0, w, h)
    if (video.videoWidth) {
      const cover = Math.max(w / video.videoWidth, h / video.videoHeight)
      const dw = video.videoWidth * cover
      const dh = video.videoHeight * cover
      ctx.save()
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh)
      ctx.restore()
    }
    ctx.fillStyle = 'rgba(0,0,0,0.42)'
    ctx.fillRect(0, 0, w, h)

    // A scrim under the type, so the chord stays legible whatever the room
    // behind it is doing. Cheaper and steadier than per-glyph shadows alone.
    const scrim = ctx.createLinearGradient(0, h * 0.55, 0, h)
    scrim.addColorStop(0, 'rgba(0,0,0,0)')
    scrim.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = scrim
    ctx.fillRect(0, h * 0.55, w, h * 0.45)
  }

  drawHands(hands: HandState[]): void {
    const { ctx, width: w, height: h, scale } = this
    for (const hand of hands) {
      const px = hand.points.map((p) => ({ x: p.x * w, y: p.y * h }))

      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1.5 * scale
      ctx.beginPath()
      for (const [a, b] of CONNECTIONS) {
        ctx.moveTo(px[a].x, px[a].y)
        ctx.lineTo(px[b].x, px[b].y)
      }
      ctx.stroke()

      ctx.fillStyle = '#fff'
      for (const p of px) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3 * scale, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  /**
   * The pose the song is asking for, drawn on the player's own hand: same size,
   * same angle, same side, because it is placed in a frame read from their
   * landmarks. Matching it needs no eye movement and no mental rotation, which
   * is the whole reason it is here rather than in a diagram at the edge of the
   * screen. It fades as you reach it — a cue you no longer need is clutter.
   */
  drawGhost(hand: HandState, fingers: Fingers, reached: boolean, lean?: { major: boolean }): void {
    const { ctx, width: w, height: h, scale } = this
    const px = hand.points.map((p) => ({ x: p.x * w, y: p.y * h }))
    const frame = frameOf(px)
    const ghost = place(handTemplate(fingers), frame)

    ctx.save()
    ctx.globalAlpha = reached ? 0.22 : 0.75
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2 * scale
    ctx.lineCap = 'round'
    ctx.setLineDash([7 * scale, 5 * scale])
    ctx.beginPath()
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(ghost[a].x, ghost[a].y)
      ctx.lineTo(ghost[b].x, ghost[b].y)
    }
    ctx.stroke()

    // Rings on the tips that have to be up: the pose is a count before it is
    // a shape, and counting rings is faster than reading a hand.
    ctx.setLineDash([])
    ctx.lineWidth = 1.5 * scale
    TIPS.forEach((tip, digit) => {
      if (!fingers[digit]) return
      ctx.beginPath()
      ctx.arc(ghost[tip].x, ghost[tip].y, 5 * scale, 0, Math.PI * 2)
      ctx.stroke()
    })

    if (lean) this.drawLean(frame.origin, frame.scale, hand.roll, lean.major, reached)
    ctx.restore()
  }

  /**
   * The lean, as a pendulum under the wrist. Major and minor are a zero crossing
   * about a tenth of a radian wide — invisible unless it is drawn, and drawn at
   * life size still invisible, so the dial is geared up. The needle is the hand;
   * the lit arc is the half of the dial the song is asking for.
   */
  private drawLean(wrist: { x: number; y: number }, palm: number, roll: number, major: boolean, reached: boolean): void {
    const { ctx, scale } = this
    const radius = palm * DIAL.radius
    const { gear, span } = DIAL

    const point = (angle: number, r: number) => ({
      x: wrist.x + Math.sin(angle) * r,
      y: wrist.y + Math.cos(angle) * r,
    })
    // Canvas measures from the +x axis; the dial measures from straight down.
    const arc = (from: number, to: number) => {
      ctx.beginPath()
      ctx.arc(wrist.x, wrist.y, radius, Math.PI / 2 - from, Math.PI / 2 - to, true)
      ctx.stroke()
    }

    ctx.setLineDash([])
    ctx.globalAlpha = reached ? 0.14 : 0.3
    ctx.lineWidth = 1 * scale
    arc(-span, span)

    ctx.globalAlpha = reached ? 0.3 : 0.85
    ctx.lineWidth = 2.5 * scale
    if (major) arc(LEAN_BAND.major * gear, span)
    else arc(-span, LEAN_BAND.minor * gear)

    const needle = Math.max(-span, Math.min(span, roll * gear))
    const from = point(needle, radius * 0.35)
    const to = point(needle, radius * 1.12)
    ctx.globalAlpha = reached ? 0.35 : 1
    ctx.lineWidth = 2 * scale
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  /**
   * The signature energy wave. Every channel of it is mapped to something the
   * player is doing: hue is the scale degree, brightness is major vs minor, the
   * number of stacked lines is the right-hand voicing, thickness is volume, and
   * the jitter riding on the sine is tilt. Nothing here is decorative.
   */
  drawWave({ degree, major, voices, volume, tilt, now }: WaveState): void {
    if (voices < 1) return
    const { ctx, width: w, scale } = this

    const centreY = this.height - 56 * scale
    const maxThickness = (1 + volume * 8) * scale
    const chaos = (tilt + 1) / 2
    const jitterAmp = chaos * 25 * scale
    const jitterFreq = (0.05 + chaos * 0.15) / scale
    const time = now * 0.004
    const hue = DEGREE_HUES[degree] ?? DEGREE_HUES[1]

    ctx.save()
    ctx.globalAlpha = major ? 1 : 0.7
    ctx.strokeStyle = `rgb(${hue})`
    ctx.shadowColor = `rgb(${hue})`
    ctx.shadowBlur = 12 * scale

    for (let line = 0; line < voices; line++) {
      const y0 = centreY + (line - (voices - 1) / 2) * 12 * scale
      ctx.lineWidth = Math.max(1, maxThickness - line * 0.5 * scale)
      ctx.beginPath()
      for (let x = 0; x <= w; x += 2 * scale) {
        const sway = Math.sin(x * 0.005 / scale + time + line * 0.5) * 20 * scale
        const jitter = Math.sin(x * jitterFreq + time * 3) * jitterAmp
        const y = y0 + sway + jitter
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.restore()
  }
}
