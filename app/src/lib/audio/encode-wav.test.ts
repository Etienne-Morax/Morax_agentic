import { describe, expect, test } from 'vitest'
import { encodeWavPcm16 } from './encode-wav.js'

function readString(view: DataView, offset: number, length: number): string {
  let text = ''
  for (let i = 0; i < length; i += 1) {
    text += String.fromCharCode(view.getUint8(offset + i))
  }
  return text
}

describe('encodeWavPcm16', () => {
  test('writes a valid RIFF/WAVE header for mono audio', () => {
    const bytes = encodeWavPcm16([new Float32Array([0, 0.5, -0.5])], 16000)
    const view = new DataView(bytes.buffer)

    expect(readString(view, 0, 4)).toBe('RIFF')
    expect(readString(view, 8, 4)).toBe('WAVE')
    expect(readString(view, 12, 4)).toBe('fmt ')
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(16000) // sample rate
    expect(view.getUint16(34, true)).toBe(16) // bits per sample
    expect(readString(view, 36, 4)).toBe('data')
  })

  test('encodes sample values as 16-bit PCM, clamped to [-1, 1]', () => {
    const bytes = encodeWavPcm16([new Float32Array([1, -1, 2, -2, 0])], 8000)
    const view = new DataView(bytes.buffer)
    const dataStart = 44

    expect(view.getInt16(dataStart + 0, true)).toBe(0x7fff) // 1 -> max positive
    expect(view.getInt16(dataStart + 2, true)).toBe(-0x8000) // -1 -> max negative
    expect(view.getInt16(dataStart + 4, true)).toBe(0x7fff) // 2 clamped to 1
    expect(view.getInt16(dataStart + 6, true)).toBe(-0x8000) // -2 clamped to -1
    expect(view.getInt16(dataStart + 8, true)).toBe(0)
  })

  test('interleaves stereo channels', () => {
    const left = new Float32Array([1, 0])
    const right = new Float32Array([-1, 0])
    const bytes = encodeWavPcm16([left, right], 44100)
    const view = new DataView(bytes.buffer)

    expect(view.getUint16(22, true)).toBe(2) // stereo
    const dataStart = 44
    expect(view.getInt16(dataStart + 0, true)).toBe(0x7fff) // left[0]
    expect(view.getInt16(dataStart + 2, true)).toBe(-0x8000) // right[0]
    expect(view.getInt16(dataStart + 4, true)).toBe(0) // left[1]
    expect(view.getInt16(dataStart + 6, true)).toBe(0) // right[1]
  })

  test('total byte length matches header + interleaved data', () => {
    const bytes = encodeWavPcm16([new Float32Array(100)], 16000)
    expect(bytes.length).toBe(44 + 100 * 2)
  })
})
