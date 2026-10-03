// Browser smoke test: serves the app locally and checks the things that have
// broken before (startup crash, timer accuracy, settings surviving a reload,
// offline support). Run with `npm test`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8765;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForLoadState('load');
  check('loads without script errors', errors.length === 0, errors.join('; '));
  check('shows default 20:00', (await page.textContent('#timeDisplay')).trim() === '20:00');

  await page.click('#startBtn', { timeout: 2000 });
  await page.waitForTimeout(2300);
  const running = (await page.textContent('#timeDisplay')).trim();
  check('countdown ticks', running === '19:58' || running === '19:57', running);

  await page.reload();
  await page.waitForTimeout(500);
  const resumed = (await page.textContent('#timeDisplay')).trim();
  check('running timer resumes after reload', resumed.startsWith('19:5') && (await page.textContent('#startBtn')) === 'Running', resumed);

  await page.click('#stopBtn');
  await page.click('#muteBtn');
  await page.click('.settings-panel summary');
  await page.fill('#breakMinutesInput', '12');
  await page.dispatchEvent('#breakMinutesInput', 'change');
  await page.selectOption('#soundPicker', 'chime');
  await page.reload();
  check('mute setting survives reload', (await page.getAttribute('#muteBtn', 'aria-pressed')) === 'true');
  check('break length survives reload', (await page.inputValue('#breakMinutesInput')) === '12');
  check('sound choice survives reload', (await page.inputValue('#soundPicker')) === 'chime');

  await page.click('.preset-button[data-minutes="45"]');
  check('preset sets 45:00', (await page.textContent('#timeDisplay')).trim() === '45:00');

  await page.click('#stopwatchToggle');
  await page.click('#startBtn');
  await page.waitForTimeout(2300);
  const elapsed = (await page.textContent('#timeDisplay')).trim();
  check('stopwatch counts up', elapsed === '00:00:02' || elapsed === '00:00:03', elapsed);
  await page.keyboard.press('Space');
  check('space bar stops', (await page.textContent('#startBtn')) === 'Start');

  await page.click('#stopwatchToggle');
  await page.click('.preset-button[data-minutes="20"]');
  await page.click('#timeDisplay');
  await page.fill('#editorMinutes', '0');
  await page.fill('#editorSeconds', '2');
  await page.click('#applyTimerBtn');
  await page.click('#startBtn');
  await page.waitForTimeout(3000);
  check('finished work session switches to break', (await page.textContent('.status-label')) === 'Break Mode' && (await page.textContent('#sessionCount')) === '1');
  check('break uses saved break length', (await page.textContent('#timeDisplay')).trim() === '12:00');

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  check('works offline from cache', (await page.textContent('#timeDisplay')).trim().length > 0);
  await context.setOffline(false);
  check('no script errors after reloads', errors.length === 0, errors.join('; '));

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  server.close();
  process.exit(1);
});
