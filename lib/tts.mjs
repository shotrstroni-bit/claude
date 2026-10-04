// Gemini TTS -> WAV. Reads GEMINI_API_KEY from the environment (never hardcode it).
//   node lib/tts.mjs --list                                   list TTS-capable models on your key
//   node lib/tts.mjs "Text to speak" out.wav [--voice Kore] [--model <id>]
// Style is steered in the prompt itself, e.g. "Say it punchy and fast: No camera. No editing."
import { writeFileSync } from 'node:fs';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY is not set'); process.exit(1); }
const API = 'https://generativelanguage.googleapis.com/v1beta';
const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);

if (args.includes('--list')) {
  const r = await fetch(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': KEY } });
  const j = await r.json();
  if (!r.ok) { console.error(j); process.exit(1); }
  for (const m of j.models.filter((m) => /tts/i.test(m.name))) console.log(m.name.replace('models/', ''), '-', m.displayName);
  process.exit(0);
}

const [text, out = 'tts.wav'] = args.filter((a, i) => !a.startsWith('--') && !['--voice', '--model'].includes(args[i - 1]));
if (!text) { console.error('usage: node lib/tts.mjs "text" out.wav [--voice Kore] [--model id]'); process.exit(1); }
const model = opt('--model', process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts');
const voice = opt('--voice', 'Kore');

const r = await fetch(`${API}/models/${model}:generateContent`, {
  method: 'POST',
  headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  }),
});
const j = await r.json();
if (!r.ok) { console.error(JSON.stringify(j.error || j, null, 1)); process.exit(1); }
const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
if (!part) { console.error('no audio in response', JSON.stringify(j).slice(0, 400)); process.exit(1); }

// response is raw 16-bit little-endian PCM, mono; rate is in the mime type (audio/L16;rate=24000)
const pcm = Buffer.from(part.inlineData.data, 'base64');
const rate = +(part.inlineData.mimeType.match(/rate=(\d+)/)?.[1] || 24000);
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
writeFileSync(out, Buffer.concat([h, pcm]));
console.log(`${out}  ${(pcm.length / 2 / rate).toFixed(2)}s  ${model} / ${voice}`);
