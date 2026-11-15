const $ = s => document.querySelector(s);
const h = (tag, props, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

let data, status;
let selId = null, slides = [], pvIdx = 0;      // what the operator is preparing
let live = { text: '', bg: null, songId: null, idx: -1 }; // snapshot: editing a song never changes what is live
let mode = 'black';                             // output starts black until the first Go Live

const song = id => data.songs.find(s => s.id === id);
// A failed save (disk full, read-only folder) must be visible, and must not stop the service.
const persist = () => api.save(data).then(() => '', e => 'Changes not saved: ' + e.message.replace(/^Error invoking remote method 'save': /, ''))
  .then(msg => { $('#saveErr').textContent = msg; });
const makeState = (text, bg, mode, ms) =>
  ({ text, bg: bg || data.settings.bg, style: data.settings.theme, logo: data.settings.logo, mode, ms, stage: status.stage });
const post = (frame, state) => frame.contentWindow.postMessage(state, '*');

// A library item is a song (text, split on blank lines) or a PowerPoint deck (one image per slide).
// Either way a slide is { text, bg }, so everything downstream treats them the same.
const slidesOf = item => !item ? []
  : item.images ? item.images.map(url => ({ text: '', img: url, bg: { type: 'image', url, fit: 'contain', color: '#000000' } }))
  : splitSlides(item.text).map(text => ({ text, bg: item.bg }));

function showPreview() {
  const s = slides[pvIdx] || { text: '' };
  post($('#pv'), makeState(s.text, s.bg, 'normal', 0));
}

// The only place that changes what the audience sees.
function sendLive() {
  const s = makeState(live.text, live.bg, mode, data.settings.ms);
  post($('#lv'), s);
  api.live(s);
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
}

function goLive() {
  if (!slides[pvIdx]) return;
  live = { text: slides[pvIdx].text, bg: slides[pvIdx].bg, songId: selId, idx: pvIdx };
  mode = 'normal';
  sendLive();
  if (pvIdx < slides.length - 1) pvIdx++; // preview moves on so the operator sees what comes next
  draw();
}

function setMode(m) {
  // Clear means "back to the slide": it cancels Black/Logo; only from the normal slide does it hide the text.
  mode = mode === m || (m === 'clear' && mode !== 'normal') ? 'normal' : m;
  sendLive();
}

function select(id) {
  selId = id;
  pvIdx = 0;
  draw();
}

function draw() {
  const q = $('#filter').value.toLowerCase();
  const cur = song(selId);
  slides = slidesOf(cur);
  pvIdx = Math.max(0, Math.min(pvIdx, slides.length - 1));
  const stop = fn => e => { e.stopPropagation(); fn(); persist(); draw(); };

  $('#songs').replaceChildren(...data.songs.filter(s => (s.title + '\n' + (s.text || '')).toLowerCase().includes(q)).map(s =>
    h('li', { className: s.id === selId ? 'sel' : '', onclick: () => select(s.id) },
      h('span', { textContent: s.title || 'Untitled' }),
      h('button', { textContent: '+', title: 'Add to schedule', onclick: stop(() => data.schedule.push(s.id)) }),
      h('button', { textContent: 'Edit', onclick: e => { e.stopPropagation(); editSong(s.id); } }))));

  $('#schedule').replaceChildren(...data.schedule.map((id, i) =>
    h('li', { className: id === selId ? 'sel' : '', onclick: () => select(id) },
      h('span', { textContent: (song(id) || {}).title || 'Untitled' }),
      h('button', { textContent: '↑', title: 'Move up', disabled: i === 0,
        onclick: stop(() => data.schedule.splice(i - 1, 2, data.schedule[i], data.schedule[i - 1])) }),
      h('button', { textContent: '×', title: 'Remove', onclick: stop(() => data.schedule.splice(i, 1)) }))));

  $('#itemTitle').textContent = cur ? cur.title || 'Untitled' : 'Slides';
  $('#slides').replaceChildren(...slides.map((s, i) =>
    h('div', {
      className: 'slide' + (i === pvIdx ? ' pv' : '') + (live.songId === selId && live.idx === i ? ' live' : ''),
      onclick: () => { pvIdx = i; draw(); },
      ondblclick: () => { pvIdx = i; goLive(); },
    }, s.img ? h('img', { src: s.img }) : s.text)));
  showPreview();
}

function applyStatus(s) {
  status = s;
  const el = $('#status');
  el.textContent = s.configured ? `Output: ${s.label}` : 'Output device not configured';
  el.classList.toggle('bad', !s.configured);
  for (const f of [$('#pv'), $('#lv')]) f.style.aspectRatio = `${s.stage.w} / ${s.stage.h}`;
}

// ---- dialogs -------------------------------------------------------------

for (const slot of document.querySelectorAll('.bgSlot')) slot.replaceWith($('#bgTpl').content.cloneNode(true));
$('#settings [name=bgType] [value=default]').remove();
for (const b of document.querySelectorAll('[name=bgPick]')) b.onclick = async () => {
  const E = b.form.elements;
  const url = await api.pick(E.bgType.value === 'video' ? 'video' : 'image');
  if (!url) return;
  E.bgUrl.value = url;
  if (E.bgType.value !== 'video') E.bgType.value = 'image';
};
const setBg = (E, bg) => {
  E.bgType.value = bg ? bg.type : 'default';
  E.bgColor.value = (bg && bg.color) || '#000000';
  E.bgFit.value = (bg && bg.fit) || 'cover';
  E.bgUrl.value = (bg && bg.url) || '';
};
const getBg = E => E.bgType.value === 'default' ? null
  : { type: E.bgType.value, color: E.bgColor.value, fit: E.bgFit.value, url: E.bgUrl.value };

function open(d, onSave) {
  d.returnValue = '';
  d.onclose = () => { if (d.returnValue === 'save') { onSave(); persist(); draw(); sendLive(); } };
  d.showModal();
}

function editSong(id) {
  const d = $('#editor'), E = d.querySelector('form').elements;
  const s = song(id) || { id: crypto.randomUUID(), title: '', text: '', bg: null };
  d.querySelector('form').classList.toggle('deck', !!s.images); // a deck only has a title to edit
  E.songTitle.value = s.title;
  E.songText.value = s.text || '';
  setBg(E, s.bg);
  E.del.hidden = !song(id);
  E.del.onclick = () => {
    if (!confirm(`Delete "${s.title || 'Untitled'}"?`)) return;
    data.songs = data.songs.filter(x => x !== s);
    data.schedule = data.schedule.filter(x => x !== s.id);
    if (selId === s.id) selId = null;
    if (s.dir) api.removeDeck(s.dir);
    d.close('cancel');
    persist();
    draw();
  };
  open(d, () => {
    s.title = E.songTitle.value.trim();
    if (!s.images) Object.assign(s, { text: E.songText.value, bg: getBg(E) });
    if (!song(s.id)) data.songs.push(s);
    selId = s.id;
  });
}

const THEME_KEYS = ['font', 'size', 'color', 'outline', 'outlineColor', 'align', 'valign'];

async function editSettings() {
  const d = $('#settings'), E = d.querySelector('form').elements, s = data.settings, r = s.region || {};
  E.display.replaceChildren(h('option', { value: '', textContent: 'Automatic (first non-primary monitor)' }),
    ...(await api.displays()).map(x => h('option', { value: x.id, textContent: x.label })));
  E.display.value = s.displayId == null ? '' : s.displayId;
  for (const k of ['x', 'y', 'w', 'h']) E['r' + k].value = r[k] == null ? '' : r[k];
  for (const k of THEME_KEYS) E[k].value = s.theme[k];
  E.shadow.checked = s.theme.shadow;
  setBg(E, s.bg);
  E.logo.value = s.logo;
  E.ms.value = s.ms;
  E.logoPick.onclick = async () => { const u = await api.pick('image'); if (u) E.logo.value = u; };
  E.logoClear.onclick = () => { E.logo.value = ''; };
  open(d, () => {
    const n = k => Number(E[k].value) || 0;
    s.displayId = E.display.value === '' ? null : Number(E.display.value);
    s.region = n('rw') > 0 && n('rh') > 0 ? { x: n('rx'), y: n('ry'), w: n('rw'), h: n('rh') } : null;
    for (const k of THEME_KEYS) s.theme[k] = E[k].type === 'number' ? n(k) : E[k].value;
    s.theme.size = Math.max(10, s.theme.size);
    s.theme.shadow = E.shadow.checked;
    s.bg = getBg(E);
    s.logo = E.logo.value;
    s.ms = Math.max(0, n('ms'));
  });
}

// ---- wiring --------------------------------------------------------------

async function importDeck(src) {
  const b = $('#newDeck');
  b.disabled = true;
  b.textContent = 'Importing…';
  const r = await api.importDeck(src);
  b.disabled = false;
  b.textContent = '+ PowerPoint';
  if (!r) return;
  if (r.error) return alert(r.error);
  const deck = { id: crypto.randomUUID(), title: r.title, dir: r.dir, images: r.images };
  data.songs.push(deck);
  persist();
  select(deck.id);
}

$('#newSong').onclick = () => editSong(null);
$('#newDeck').onclick = () => importDeck();
$('#openSettings').onclick = editSettings;
$('#filter').oninput = draw;
$('#go').onclick = goLive;
for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => setMode(b.dataset.mode);

addEventListener('keydown', e => {
  if ($('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.altKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  const act = {
    arrowdown: () => { pvIdx++; draw(); }, arrowright: () => { pvIdx++; draw(); },
    arrowup: () => { pvIdx--; draw(); }, arrowleft: () => { pvIdx--; draw(); },
    enter: goLive, ' ': goLive,
    b: () => setMode('black'), c: () => setMode('clear'), l: () => setMode('logo'),
  }[k];
  if (!act) return;
  e.preventDefault();
  if (document.activeElement) document.activeElement.blur(); // a focused button must not also fire on Enter/Space
  act();
});

(async () => {
  const init = await api.load();
  data = init.data;
  applyStatus(init.status);
  api.onStatus(s => { applyStatus(s); showPreview(); sendLive(); });
  const refresh = () => { showPreview(); sendLive(); };
  for (const f of [$('#pv'), $('#lv')]) { f.onload = refresh; f.src = 'output.html'; }
  if (data.schedule[0]) selId = data.schedule[0];
  draw();
})();
