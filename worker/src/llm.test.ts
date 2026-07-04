import { describe, expect, it, vi } from 'vitest'
import type { ModelConfig } from '@morax/model-core'
import { LlmClient } from './llm.js'

function anthropicModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    model: 'claude-opus-4-8',
    provider: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    maxContextTokens: 100_000,
    priceInUsdPerM: 15,
    priceOutUsdPerM: 75,
    financePinned: true,
    plannerPinned: false,
    ...overrides,
  }
}

function openrouterModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    model: 'minimax/minimax-m3',
    openrouterModel: 'minimax/minimax-m3',
    provider: 'minimax',
    endpoint: 'https://openrouter.ai/api/v1',
    maxContextTokens: 100_000,
    priceInUsdPerM: 0.3,
    priceOutUsdPerM: 1.2,
    financePinned: false,
    plannerPinned: false,
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('LlmClient.complete - Anthropic', () => {
  it('poste vers /messages avec les headers et le payload attendus', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        content: [{ type: 'text', text: 'bonjour' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    )
    const client = new LlmClient({ anthropicApiKey: 'sk-ant-x', openrouterApiKey: 'or-y' }, fetchImpl)

    const result = await client.complete({
      modelConfig: anthropicModel(),
      messages: [
        { role: 'system', content: 'Tu es un assistant.' },
        { role: 'user', content: 'Salut' },
      ],
      hasPersonalData: false,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-x')
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init.body as string) as {
      model: string
      system?: string
      messages: Array<{ role: string; content: unknown }>
    }
    expect(body.model).toBe('claude-opus-4-8')
    expect(body.system).toBe('Tu es un assistant.')
    expect(body.messages).toEqual([{ role: 'user', content: 'Salut' }])

    expect(result.text).toBe('bonjour')
    expect(result.tokensIn).toBe(10)
    expect(result.tokensOut).toBe(5)
    expect(result.usdCost).toBeCloseTo((10 / 1_000_000) * 15 + (5 / 1_000_000) * 75)
  })

  it('attache les pieces jointes au premier message user (bloc image)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        content: [{ type: 'text', text: '{}' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )
    const client = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'k' }, fetchImpl)

    await client.complete({
      modelConfig: anthropicModel(),
      messages: [{ role: 'user', content: 'Extrait les champs' }],
      attachments: [{ bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/png' }],
      hasPersonalData: true,
    })

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ content: Array<{ type: string; text?: string }> }>
    }
    const blocks = body.messages[0]?.content
    expect(blocks?.[0]?.type).toBe('image')
    expect(blocks?.[1]?.type).toBe('text')
    expect(blocks?.[1]?.text).toBe('Extrait les champs')
  })

  it('rejette les donnees personnelles vers un modele chinois hors endpoint western-managed', async () => {
    const fetchImpl = vi.fn()
    const client = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'k' }, fetchImpl)

    await expect(
      client.complete({
        modelConfig: openrouterModel({ provider: 'minimax', endpoint: 'https://minimax.direct/v1' }),
        messages: [{ role: 'user', content: 'salut' }],
        hasPersonalData: true,
      }),
    ).rejects.toThrow(/rgpd/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('LlmClient.complete - OpenRouter', () => {
  it('poste vers /chat/completions avec Authorization Bearer et le slug openrouter', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 7, completion_tokens: 3 },
      }),
    )
    const client = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'or-secret' }, fetchImpl)

    const result = await client.complete({
      modelConfig: openrouterModel(),
      messages: [{ role: 'user', content: 'Decoupe ceci' }],
      hasPersonalData: false,
    })

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer or-secret')
    const body = JSON.parse(init.body as string) as { model: string }
    expect(body.model).toBe('minimax/minimax-m3')
    expect(result.text).toBe('ok')
    expect(result.tokensIn).toBe(7)
    expect(result.tokensOut).toBe(3)
  })

  it('attache l\'audio au premier message user (bloc input_audio, transcription)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'Transcription du message vocal.' } }],
        usage: { prompt_tokens: 12, completion_tokens: 6 },
      }),
    )
    const client = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'k' }, fetchImpl)

    await client.complete({
      modelConfig: openrouterModel({ model: 'google/gemini-2.5-flash-lite', provider: 'google' }),
      messages: [{ role: 'system', content: 'Transcris.' }, { role: 'user', content: 'Transcris ceci.' }],
      attachments: [{ bytes: new Uint8Array([1, 2, 3]), mediaType: 'audio/wav' }],
      hasPersonalData: true,
    })

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: unknown }>
    }
    const userMessage = body.messages.find((m) => m.role === 'user') as {
      content: Array<{ type: string; text?: string; input_audio?: { data: string; format: string } }>
    }
    expect(userMessage.content[0]).toEqual({ type: 'text', text: 'Transcris ceci.' })
    expect(userMessage.content[1]?.type).toBe('input_audio')
    expect(userMessage.content[1]?.input_audio?.format).toBe('wav')
    expect(typeof userMessage.content[1]?.input_audio?.data).toBe('string')
    // Le message system ne doit pas etre touche par l'attachement.
    const systemMessage = body.messages.find((m) => m.role === 'system')
    expect(systemMessage?.content).toBe('Transcris.')
  })

  it('rejette un format audio non supporte par OpenRouter avant tout appel reseau', async () => {
    const fetchImpl = vi.fn()
    const client = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'k' }, fetchImpl)

    await expect(
      client.complete({
        modelConfig: openrouterModel({ model: 'google/gemini-2.5-flash-lite', provider: 'google' }),
        messages: [{ role: 'user', content: 'Transcris ceci.' }],
        attachments: [{ bytes: new Uint8Array([1, 2, 3]), mediaType: 'audio/webm' }],
        hasPersonalData: true,
      }),
    ).rejects.toThrow(/Format audio non supporte/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('LlmClient.complete - retry', () => {
  it('retente une fois sur 429 puis reussit', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(
        jsonResponse({
          content: [{ type: 'text', text: 'ok apres retry' }],
          usage: { input_tokens: 2, output_tokens: 2 },
        }),
      )
    const client = new LlmClient({ anthropicApiKey: 'k', openrouterApiKey: 'k' }, fetchImpl)

    const result = await client.complete({
      modelConfig: anthropicModel(),
      messages: [{ role: 'user', content: 'salut' }],
      hasPersonalData: false,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.text).toBe('ok apres retry')
  })

  it('jette une erreur sans cle apres echec definitif (non-2xx, non-retryable)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }))
    const client = new LlmClient({ anthropicApiKey: 'sk-secret-leak-check', openrouterApiKey: 'k' }, fetchImpl)

    await expect(
      client.complete({
        modelConfig: anthropicModel(),
        messages: [{ role: 'user', content: 'salut' }],
        hasPersonalData: false,
      }),
    ).rejects.toThrow(/400/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
