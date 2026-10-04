// Motion studio renderer.
//   node render.mjs [filmDir]            full pipeline: score -> beats.json -> frames -> H.264 yuv420p CRF 16, -14 LUFS
//   node render.mjs [filmDir] --sheet    one frame per beat as a contact sheet (out/sheet.png)
//   node render.mjs [filmDir] --at 1.2,3.4   single stills (out/still-<t>.png)
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const filmDir = resolve(args.find((a) => !a.startsWith('--') && !/^[\d.,]+$/.test(a)) || 'films/channelrecipe');
const SHEET = args.includes('--sheet');
const AT = args.includes('--at') ? args[args.indexOf('--at') + 1].split(',').map(Number) : null;
const meta = existsSync(join(filmDir, 'film.json')) ? JSON.parse(readFileSync(join(filmDir, 'film.json'), 'utf8')) : {};
const W = meta.width || 1080, H = meta.height || 1920, FPS = meta.fps || 30, DUR = meta.duration || 15;
const out = join(filmDir, 'out');
mkdirSync(out, { recursive: true });

const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString();

// 1) audio build (VO + score) or score-only, then the measured beat grid
if (existsSync(join(filmDir, 'build.mjs'))) {
  console.log(run('node', [join(filmDir, 'build.mjs')]).trim());
} else if (existsSync(join(filmDir, 'score.mjs'))) {
  console.log(run('node', [join(filmDir, 'score.mjs')]).trim());
  console.log(run('node', ['lib/measure-beats.mjs', join(out, 'score.wav'), join(filmDir, 'beats.json')]).trim());
}
const beats = JSON.parse(readFileSync(join(filmDir, 'beats.json'), 'utf8')).beats;

// 2) static server for the film (fonts + json need http)
const MIME = { '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = createServer((req, res) => {
  const p = join(filmDir, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(filmDir) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/index.html?render=1`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('PAGE ERROR', e); process.exitCode = 1; });
page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
await page.goto(url);
await page.evaluate(() => window.ready);
const shot = async (t) => { await page.evaluate((x) => window.seek(x), t); return page.screenshot({ type: 'png' }); };

try {
  if (AT) {
    for (const t of AT) { const f = join(out, `still-${t.toFixed(2)}.png`); writeFileSync(f, await shot(t)); console.log(f); }
  } else if (SHEET) {
    // one frame per beat, sampled just after the hit lands
    const times = beats.map((b) => Math.min(DUR - 1 / FPS, b + 0.3));
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '1', '-i', '-',
      '-vf', `scale=270:480,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf:text='%{eif\\:n\\:d}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.7,tile=8x${Math.ceil(times.length / 8)}:padding=6:color=0x222222`,
      '-frames:v', '1', join(out, 'sheet.png')], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (const t of times) ff.stdin.write(await shot(t));
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log(join(out, 'sheet.png'), `(${times.length} beats; tile n = beat index)`);
  } else {
    // 3) master the score to -14 LUFS (two-pass loudnorm, linear)
    const wav = existsSync(join(out, 'audio.wav')) ? join(out, 'audio.wav') : join(out, 'score.wav'), master = join(out, 'master.wav');
    const j = JSON.parse(execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${wav}" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p'`]).toString());
    run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af',
      `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`,
      '-ar', '48000', master]);
    // 4) frames -> H.264
    const name = filmDir.split('/').pop();
    const mp4 = join(out, name.endsWith(`-${DUR}s`) ? `${name}.mp4` : `${name}-${DUR}s.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', master,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '256k', '-shortest', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
    const N = DUR * FPS, t0 = Date.now();
    for (let f = 0; f < N; f++) {
      const buf = await shot(f / FPS);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (f % 60 === 0) process.stdout.write(`frame ${f}/${N}\r`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log(`\n${mp4} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    console.log(execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${mp4}" -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:" | tail -2`]).toString().trim());
  }
} finally {
  await browser.close();
  server.close();
}
