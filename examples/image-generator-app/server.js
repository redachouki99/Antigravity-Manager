import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT || 8787);
const BASE_URL = (process.env.ANTIGRAVITY_BASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.ANTIGRAVITY_API_KEY || '';
const DEFAULT_MODEL = process.env.IMAGE_MODEL || 'gemini-3.1-flash-image';

function extractImagePayload(data) {
  // OpenAI-like image output formats can vary by provider.
  if (Array.isArray(data?.data) && data.data[0]) {
    const first = data.data[0];
    if (first.url) return { type: 'url', value: first.url };
    if (first.b64_json) return { type: 'b64', value: first.b64_json };
  }

  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item?.type === 'image_url' && item?.image_url?.url) {
        return { type: 'url', value: item.image_url.url };
      }
      if ((item?.type === 'output_image' || item?.type === 'image') && item?.b64_json) {
        return { type: 'b64', value: item.b64_json };
      }
    }
  }

  return null;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, baseUrl: BASE_URL, hasApiKey: Boolean(API_KEY), model: DEFAULT_MODEL });
});

app.post('/api/generate-image', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const model = String(req.body?.model || DEFAULT_MODEL).trim();
    const size = String(req.body?.size || '1024x1024').trim();

    if (!BASE_URL) {
      return res.status(500).json({ error: 'Server misconfigured: ANTIGRAVITY_BASE_URL missing' });
    }
    if (!API_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: ANTIGRAVITY_API_KEY missing' });
    }
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Try OpenAI Images API first.
    const imageResp = await fetch(`${BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({ model, prompt, size }),
    });

    let payload;
    if (imageResp.ok) {
      payload = await imageResp.json();
    } else {
      // Fallback for providers that expose image via chat/completions.
      const chatResp = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
          'x-api-key': API_KEY,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          extra_body: { size },
        }),
      });

      if (!chatResp.ok) {
        const imageError = await imageResp.text();
        const chatError = await chatResp.text();
        return res.status(502).json({
          error: 'Upstream rejected image generation on both routes',
          details: {
            imageRoute: { status: imageResp.status, body: imageError.slice(0, 500) },
            chatRoute: { status: chatResp.status, body: chatError.slice(0, 500) },
          },
        });
      }

      payload = await chatResp.json();
    }

    const parsed = extractImagePayload(payload);
    if (!parsed) {
      return res.status(502).json({
        error: 'Image generated but response format is unsupported',
        rawResponse: payload,
      });
    }

    if (parsed.type === 'url') {
      return res.json({ ok: true, kind: 'url', imageUrl: parsed.value });
    }

    return res.json({ ok: true, kind: 'b64', imageBase64: parsed.value });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

app.listen(PORT, () => {
  console.log(`Image app running: http://localhost:${PORT}`);
});
