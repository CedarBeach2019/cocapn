/**
 * Google — Gemini API wrapper for cocapn.
 *
 * Image generation, text chat, and deep analysis via Google Gemini.
 * Zero dependencies. Uses fetch.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface GoogleConfig {
  apiKey?: string;
}

export interface ImageResult {
  path?: string;
  base64: string;
  mimeType: string;
  size: number;
}

export interface ChatResult {
  text: string;
  model: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS = {
  flash: 'gemini-2.5-flash',
  pro: 'gemini-2.5-pro',
  image: 'gemini-2.5-flash-image',
  preview: 'gemini-3.1-pro-preview',
} as const;

// ─── Core ──────────────────────────────────────────────────────────────────────

export class Google {
  private apiKey: string;

  constructor(config: GoogleConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.GOOGLE_API_KEY ?? '';
  }

  /** Generate an image via Gemini image model */
  async generateImage(prompt: string, options?: { model?: string; outputDir?: string; filename?: string }): Promise<ImageResult> {
    const model = options?.model ?? MODELS.image;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    };

    const res = await fetch(`${BASE}/${model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text().catch(() => 'unknown')}`);
    const data = await res.json() as any;

    const imgPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!imgPart?.inlineData?.data) throw new Error('No image in Gemini response');

    const base64: string = imgPart.inlineData.data;
    const mimeType: string = imgPart.inlineData.mimeType ?? 'image/png';
    const size = Math.ceil(base64.length * 3 / 4);
    const result: ImageResult = { base64, mimeType, size };

    // Save to filesystem if outputDir provided
    if (options?.outputDir) {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      mkdirSync(options.outputDir, { recursive: true });
      const ext = mimeType.includes('png') ? 'png' : 'jpg';
      const fname = options.filename ?? `gemini-${Date.now()}.${ext}`;
      const filePath = join(options.outputDir, fname);
      writeFileSync(filePath, Buffer.from(base64, 'base64'));
      result.path = filePath;
    }

    return result;
  }

  /** Chat with a Gemini text model */
  async chat(prompt: string, model?: string): Promise<ChatResult> {
    const m = model ?? MODELS.flash;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
    };

    const res = await fetch(`${BASE}/${m}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text().catch(() => 'unknown')}`);
    const data = await res.json() as any;

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return { text, model: m };
  }

  /** Deep analysis using Gemini Pro */
  async analyze(topic: string): Promise<ChatResult> {
    return this.chat(
      `Perform a deep, structured analysis of: ${topic}\n\nCover: key concepts, current state of the art, practical applications, common pitfalls, and recommendations. Be thorough.`,
      MODELS.pro,
    );
  }
}

/** Available model IDs */
export const GOOGLE_MODELS = MODELS;
