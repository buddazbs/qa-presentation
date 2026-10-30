// Печать атласов: node atlas/bake.js (из presentation/blender). Нужен Google Chrome.
// Поднимает статический сервер на корне presentation/, открывает atlas.html
// в headless Chrome и пишет textures/src/<atlas>.png и textures/src/atlases.json
// (прямоугольники в UV Blender: начало — левый нижний угол).
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'textures', 'src');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/blender/atlas/atlas.html`;
  const port = 9800 + Math.floor(Math.random() * 100);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 50 && !ws; i++) {
    await sleep(200);
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page');
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch {}
  }
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') console.error('[page]', m.params.exceptionDetails.exception?.description);
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  for (let i = 0; i < 100 && (await ev('document.title')) !== 'atlases-ready'; i++) await sleep(200);
  const atlases = await ev('window.ATLASES');
  if (!atlases) throw new Error('atlas page did not finish');
  fs.mkdirSync(OUT, { recursive: true });
  const layout = {};
  for (const [name, a] of Object.entries(atlases)) {
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(a.png.split(',')[1], 'base64'));
    layout[name] = {
      size: [a.width, a.height],
      rects: a.rects.map(r => ({ ...r, uv: [r.x / a.width, 1 - (r.y + r.h) / a.height, (r.x + r.w) / a.width, 1 - r.y / a.height] })),
    };
    console.log(name, `${a.width}x${a.height}`, a.rects.length, 'rects');
  }
  fs.writeFileSync(path.join(OUT, 'atlases.json'), JSON.stringify(layout, null, 1));
  ws.close(); chrome.kill(); server.close();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
