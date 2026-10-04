// Motion studio renderer.
//   node render.mjs [filmDir]                 full pipeline: audio build -> beats.json -> frames -> H.264 yuv420p CRF 16, -14 LUFS
//   node render.mjs [filmDir] --workers 4     render frame chunks in parallel browsers, then concat (default: 1)
//   node render.mjs [filmDir] --sheet         one frame per beat as contact sheets (out/sheet-N.png, 48 tiles each)
//   node render.mjs [filmDir] --sheet --every 2 --from 30 --to 60   every 2nd beat, beats inside [30s, 60s)
//   node render.mjs [filmDir] --at 1.2,3.4    single stills (out/still-<t>.png)
//   node render.mjs [filmDir] --no-build      skip the audio build (reuse beats/cues)
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const VAL = new Set(['--workers', '--every', '--from', '--to', '--at']);
const filmDir = resolve(args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VAL.has(args[i - 1])))[0] || 'films/channelrecipe');
const SHEET = args.includes('--sheet');
const AT = args.includes('--at') ? opt('--at').split(',').map(Number) : null;
const WORKERS = Math.max(1, +opt('--workers', 1));
const out = join(filmDir, 'out');
mkdirSync(out, { recursive: true });
const run = (cmd, a, o = {}) => execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26, ...o }).toString();

// 1) audio build (VO + score) or score-only; both write the measured beat grid
if (!args.includes('--no-build')) {
  if (existsSync(join(filmDir, 'build.mjs'))) console.log(run('node', [join(filmDir, 'build.mjs')]).trim().split('\n').filter((l) => !/^\d+\.\d+–/.test(l)).join('\n'));
  else if (existsSync(join(filmDir, 'score.mjs'))) {
    console.log(run('node', [join(filmDir, 'score.mjs')]).trim());
    console.log(run('node', ['lib/measure-beats.mjs', join(out, 'score.wav'), join(filmDir, 'beats.json')]).trim());
  }
}
// film.json may be written by the build (duration follows the voiceover)
const meta = existsSync(join(filmDir, 'film.json')) ? JSON.parse(readFileSync(join(filmDir, 'film.json'), 'utf8')) : {};
const W = meta.width || 1080, H = meta.height || 1920, FPS = meta.fps || 30, DUR = meta.duration || 15;
const NFRAMES = Math.round(DUR * FPS);
const beats = JSON.parse(readFileSync(join(filmDir, 'beats.json'), 'utf8')).beats;

// 2) static server for the film (fonts + json need http)
const MIME = { '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = join(filmDir, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(filmDir) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/index.html?render=1`;

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error('PAGE ERROR', e); process.exitCode = 1; });
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  await page.goto(url);
  await page.evaluate(() => window.ready);
  return { page, shot: async (t) => { await page.evaluate((x) => window.seek(x), t); return page.screenshot({ type: 'png' }); } };
}
const pipeTo = async (ff, buf) => { if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r)); };
const done = (p) => new Promise((r, j) => p.on('close', (code) => (code ? j(new Error('ffmpeg exit ' + code)) : r())));

const browsers = [];
try {
  if (AT || SHEET) {
    const b = await chromium.launch(); browsers.push(b);
    const { shot } = await openPage(b);
    if (AT) for (const t of AT) { const f = join(out, `still-${t.toFixed(2)}.png`); writeFileSync(f, await shot(t)); console.log(f); }
    else {
      const every = +opt('--every', 1), from = +opt('--from', 0), to = +opt('--to', DUR);
      const sel = beats.map((bt, k) => ({ k, t: Math.min(DUR - 1 / FPS, bt + 0.3) })).filter((x, i) => i % every === 0 && x.t >= from && x.t < to);
      const land = W > H, tw = land ? 384 : 270, th = Math.round((tw * H) / W), cols = land ? 6 : 8, per = land ? 36 : 48;
      for (let s = 0; s * per < sel.length; s++) {
        const part = sel.slice(s * per, (s + 1) * per);
        const f = join(out, `sheet-${s + 1}.png`);
        const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '1', '-i', '-',
          '-vf', `scale=${tw}:${th},drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf:text='${'%{eif\\:n\\:d}'}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.7,tile=${cols}x${Math.ceil(part.length / cols)}:padding=4:color=0x222222`,
          '-frames:v', '1', f], { stdio: ['pipe', 'inherit', 'inherit'] });
        for (const x of part) await pipeTo(ff, await shot(x.t));
        ff.stdin.end(); await done(ff);
        console.log(`${f}  tiles = beats ${part[0].k}..${part[part.length - 1].k}  (${part[0].t.toFixed(1)}s–${part[part.length - 1].t.toFixed(1)}s, tile n -> beat ${part[0].k} + n*${every})`);
      }
    }
  } else {
    // 3) master to -14 LUFS (two-pass loudnorm, linear)
    const wav = existsSync(join(out, 'audio.wav')) ? join(out, 'audio.wav') : join(out, 'score.wav'), master = join(out, 'master.wav');
    const j = JSON.parse(execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${wav}" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p'`]).toString());
    run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af',
      `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`,
      '-ar', '48000', master]);
    // 4) frames -> H.264 chunks (parallel browsers), concat, mux audio
    const name = filmDir.split('/').pop();
    const mp4 = join(out, /-\d+s$/.test(name) || DUR > 60 ? `${name}.mp4` : `${name}-${DUR}s.mp4`);
    const t0 = Date.now(), per = Math.ceil(NFRAMES / WORKERS);
    let rendered = 0;
    const chunk = async (w) => {
      const a = w * per, b = Math.min(NFRAMES, a + per);
      if (a >= b) return null;
      const br = await chromium.launch(); browsers.push(br);
      const { shot } = await openPage(br);
      const f = join(out, `chunk-${w}.mp4`);
      const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), f], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let i = a; i < b; i++) {
        await pipeTo(ff, await shot(i / FPS));
        if (++rendered % 150 === 0) process.stdout.write(`frames ${rendered}/${NFRAMES}  ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
      }
      ff.stdin.end(); await done(ff); await br.close();
      return f;
    };
    const chunks = (await Promise.all([...Array(WORKERS).keys()].map(chunk))).filter(Boolean);
    const list = join(out, 'chunks.txt');
    writeFileSync(list, chunks.map((f) => `file '${f}'`).join('\n'));
    run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', master,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', mp4]);
    chunks.forEach((f) => unlinkSync(f)); unlinkSync(list);
    console.log(`${mp4} (${NFRAMES} frames, ${WORKERS} workers, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    console.log(execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${mp4}" -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:" | tail -2`]).toString().trim());
  }
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close();
}
