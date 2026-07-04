/**
 * Morax - encodeur WAV PCM 16 bits pur (aucune dependance navigateur/DOM).
 * Le navigateur enregistre en webm/opus (Chrome) ou mp4/aac (Safari) -- ni
 * l'un ni l'autre n'est dans la liste de formats audio supportes par
 * OpenRouter (wav/mp3/aiff/aac/ogg/flac/m4a/pcm16/pcm24). On decode via
 * AudioContext puis on reencode ici en WAV, garanti compatible partout.
 */

const BITS_PER_SAMPLE = 16
const WAV_HEADER_BYTES = 44

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

function floatTo16BitPcm(view: DataView, offset: number, sample: number): void {
  const clamped = Math.max(-1, Math.min(1, sample))
  const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  view.setInt16(offset, value, /* littleEndian */ true)
}

/**
 * Encode des canaux audio (un Float32Array par canal, echantillons dans
 * [-1, 1]) en un fichier WAV PCM 16 bits. Les canaux doivent avoir la meme
 * longueur (nombre d'echantillons par canal).
 */
export function encodeWavPcm16(channelData: Float32Array[], sampleRate: number): Uint8Array {
  const numChannels = Math.max(1, channelData.length)
  const numSamples = channelData[0]?.length ?? 0
  const blockAlign = numChannels * (BITS_PER_SAMPLE / 8)
  const byteRate = sampleRate * blockAlign
  const dataBytes = numSamples * blockAlign
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // taille du sous-chunk fmt
  view.setUint16(20, 1, true) // PCM non compresse
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, BITS_PER_SAMPLE, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = WAV_HEADER_BYTES
  for (let i = 0; i < numSamples; i += 1) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      floatTo16BitPcm(view, offset, channelData[channel]?.[i] ?? 0)
      offset += 2
    }
  }

  return new Uint8Array(buffer)
}
