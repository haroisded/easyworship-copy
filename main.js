const { app, BrowserWindow, ipcMain, screen, dialog, powerSaveBlocker } = require('electron');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const path = require('path');
const { pathToFileURL } = require('url');
const { pickDisplay, outputBounds } = require('./lib');

const webPreferences = { preload: path.join(__dirname, 'preload.js') };
const defaults = () => ({
  songs: [],
  schedule: [],
  settings: {
    displayId: null, region: null, ms: 500, logo: '',
    bg: { type: 'color', color: '#000000', url: '', fit: 'cover' },
    theme: { font: 'Segoe UI', size: 110, color: '#ffffff', outline: 3, outlineColor: '#000000', shadow: true, align: 'center', valign: 'middle' },
  },
});

let file, data, control, output, live = null;
let status = { configured: false, label: '', stage: { w: 1920, h: 1080 } };

function load() {
  const d = defaults();
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = { ...d, ...j, settings: { ...d.settings, ...j.settings, theme: { ...d.settings.theme, ...(j.settings || {}).theme } } };
  } catch (e) {
    // Unreadable library: keep the bad file for recovery instead of overwriting it.
    if (e.code !== 'ENOENT') fs.copyFileSync(file, file + '.bad');
    data = d;
  }
}

function save() {
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 1));
  fs.renameSync(file + '.tmp', file);
}

const label = (d, primaryId) =>
  `${d.label || 'Display'} ${Math.round(d.size.width * d.scaleFactor)}x${Math.round(d.size.height * d.scaleFactor)}${d.id === primaryId ? ' (primary)' : ''}`;

// The single place that decides whether and where the output window exists.
// Runs at start, after settings change, and on every display plug/unplug/mode change.
function syncOutput() {
  const primaryId = screen.getPrimaryDisplay().id;
  const d = pickDisplay(screen.getAllDisplays(), data.settings.displayId, primaryId);
  if (!d) {
    if (output) output.destroy();
    status = { configured: false, label: '', stage: { w: 1920, h: 1080 } };
  } else {
    const b = outputBounds(d, data.settings.region);
    if (!output) {
      // `w`, not `output`, inside the callbacks: the display can be unplugged before the page has loaded.
      const w = output = new BrowserWindow({
        ...b, show: false, frame: false, thickFrame: false, roundedCorners: false, resizable: false,
        focusable: false, skipTaskbar: true, backgroundColor: '#000', webPreferences,
      });
      w.on('closed', () => { if (output === w) output = null; });
      w.webContents.on('did-finish-load', () => live && !w.isDestroyed() && w.webContents.send('state', live));
      output.loadFile('output.html');
      output.showInactive();
    }
    output.setBounds(b);
    // On the operator's own (primary) screen, don't pin it above the control window.
    output.setAlwaysOnTop(d.id !== primaryId, 'screen-saver');
    status = { configured: true, label: label(d, primaryId), stage: { w: b.width, h: b.height } };
  }
  if (control) control.webContents.send('status', status);
}

ipcMain.handle('load', () => ({ data, status }));
// Output settings still apply when the write fails; the error goes back to the control window.
ipcMain.handle('save', (_e, d) => { data = d; try { save(); } finally { syncOutput(); } });
ipcMain.handle('displays', () => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map(d => ({ id: d.id, label: label(d, primaryId) }));
});
ipcMain.handle('pick', async (_e, kind) => {
  const extensions = kind === 'video' ? ['mp4', 'webm', 'mov', 'm4v', 'mkv'] : ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
  const r = await dialog.showOpenDialog(control, { properties: ['openFile'], filters: [{ name: kind, extensions }] });
  return r.canceled ? null : pathToFileURL(r.filePaths[0]).href;
});
// PowerPoint: let the installed PowerPoint render each slide to a PNG; a deck is then
// just a list of images. Paths go in via environment variables, never into the script text.
const EXPORT_PS = `
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
try {
  $pres = $app.Presentations.Open($env:DECK_SRC, -1, 0, 0)  # read-only, no window
  $h = [int](1920 * $pres.PageSetup.SlideHeight / $pres.PageSetup.SlideWidth)
  $i = 0
  foreach ($s in $pres.Slides) {
    if ($s.SlideShowTransition.Hidden) { continue }
    $i++
    $s.Export((Join-Path $env:DECK_OUT ('{0:d3}.png' -f $i)), 'PNG', 1920, $h)
  }
} finally {
  if ($pres) { $pres.Close() }
  if ($app.Presentations.Count -eq 0) { $app.Quit() }  # leave PowerPoint alone if the operator has decks open
}`;
const decksDir = () => path.join(app.getPath('userData'), 'decks');

ipcMain.handle('importDeck', async (_e, src) => {
  if (!src) {
    const r = await dialog.showOpenDialog(control, { properties: ['openFile'], filters: [{ name: 'PowerPoint', extensions: ['pptx', 'ppt', 'ppsx', 'pps'] }] });
    if (r.canceled) return null;
    src = r.filePaths[0];
  }
  const dir = path.join(decksDir(), crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  try {
    await new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', EXPORT_PS],
      { env: { ...process.env, DECK_SRC: src, DECK_OUT: dir }, windowsHide: true, timeout: 180000 },
      (err, _out, stderr) => err ? rej(new Error(stderr || err.message)) : res()));
    const images = fs.readdirSync(dir).sort().map(f => pathToFileURL(path.join(dir, f)).href);
    if (!images.length) throw new Error('the file has no visible slides');
    return { title: path.parse(src).name, dir, images };
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { error: 'Could not import this file. PowerPoint must be installed and able to open it.\n\n' + e.message.trim().split('\n')[0] };
  }
});
ipcMain.handle('removeDeck', (_e, dir) => {
  const rel = path.relative(decksDir(), path.resolve(String(dir)));
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) fs.rmSync(path.join(decksDir(), rel), { recursive: true, force: true });
});

ipcMain.on('live', (_e, state) => {
  live = state;
  if (output) output.webContents.send('state', state);
});

if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(() => {
  file = path.join(app.getPath('userData'), 'library.json');
  load();
  powerSaveBlocker.start('prevent-display-sleep');
  control = new BrowserWindow({ width: 1400, height: 860, autoHideMenuBar: true, backgroundColor: '#1b1d22', webPreferences });
  control.loadFile('control.html');
  control.on('closed', () => app.quit());
  app.on('second-instance', () => { if (control.isMinimized()) control.restore(); control.focus(); });
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, syncOutput);
  syncOutput();
});
