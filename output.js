// Draws one render state. Used by the real output window (state via IPC) and by
// the Preview/Live panes in the control window (state via postMessage).
// state = { text, style, bg, logo, mode: normal|black|clear|logo, ms, stage: {w, h} }
const $ = id => document.getElementById(id);
const stage = $('stage');
const keys = {};
let last;

// The stage has the output's real size; scale it to whatever window we are in.
function fit() {
  if (!last) return;
  const { w, h } = last.stage;
  const s = Math.min(innerWidth / w, innerHeight / h);
  stage.style.cssText = `width:${w}px;height:${h}px;transform:translate(-50%,-50%) scale(${s})`;
}

// Replace a container's layer with a cross-fade, but only when its content changed.
// `build` runs only on a change: a discarded <video> would keep decoding in the background.
function swap(id, key, build, ms, fadeOld, onAttached) {
  if (keys[id] === key) return;
  keys[id] = key;
  const box = $(id), old = [...box.children], el = build();
  el.classList.add('layer');
  el.style.opacity = 0;
  box.append(el);
  if (onAttached) onAttached(el);
  el.offsetWidth; // flush styles so the opacity transition actually runs
  el.style.opacity = 1;
  const drop = o => {
    // Removing a video from the page does not stop it; release its decoder explicitly.
    for (const v of o.querySelectorAll('video')) { v.pause(); v.removeAttribute('src'); v.load(); }
    o.remove();
  };
  // Only the newest old layer fades out; anything older goes now, so rapid presses with a long fade never stack layers.
  const prev = old.pop();
  old.forEach(drop);
  if (prev) {
    if (fadeOld) prev.style.opacity = 0;
    setTimeout(() => drop(prev), ms);
  }
}

function buildBg(bg) {
  const el = document.createElement('div');
  if (bg.type === 'color' || !bg.url) el.style.background = bg.color;
  else {
    const m = document.createElement(bg.type === 'video' ? 'video' : 'img');
    if (bg.type === 'video') m.muted = m.loop = m.autoplay = true;
    m.style.objectFit = bg.fit;
    m.onerror = () => m.remove(); // missing file: plain black, never the broken-picture icon
    m.src = bg.url;
    el.append(m);
  }
  return el;
}

function buildText(text, st) {
  const el = document.createElement('div'), t = document.createElement('div');
  el.className = 'text';
  el.style.alignItems = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[st.valign];
  t.textContent = text;
  Object.assign(t.style, {
    fontFamily: `"${st.font}", sans-serif`, color: st.color, textAlign: st.align,
    webkitTextStroke: `${st.outline * 0.02}em ${st.outlineColor}`, // em: outline scales with auto-size
    textShadow: st.shadow ? '0.05em 0.05em 0.12em rgba(0,0,0,.85)' : 'none',
  });
  el.append(t);
  return el;
}

// Auto-size: largest font size up to `max` at which the text fits its box.
function fitText(el, max) {
  const t = el.firstChild, cs = getComputedStyle(el);
  const avail = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const fits = px => { t.style.fontSize = px + 'px'; return t.offsetHeight <= avail; };
  if (fits(max)) return;
  let lo = 1, hi = max; // no readable floor: on a tiny LED region, small text beats cut-off text
  while (hi - lo > 1) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  fits(lo);
}

function render(s) {
  // The very first state is shown at once: a new or re-plugged output must not fade in from nothing.
  document.documentElement.style.setProperty('--ms', (last ? s.ms : 0) + 'ms');
  last = s;
  fit();
  swap('bgs', JSON.stringify(s.bg), () => buildBg(s.bg), s.ms, false);
  swap('texts', JSON.stringify([s.text, s.style, s.stage]), () => buildText(s.text, s.style), s.ms, true,
    txt => fitText(txt, s.style.size * s.stage.h / 1080));
  const logo = $('logo').firstElementChild;
  logo.hidden = !s.logo;
  if (s.logo && logo.src !== s.logo) logo.src = s.logo;
  stage.className = s.mode;
}

addEventListener('resize', fit);
addEventListener('message', e => { if (e.source === parent) render(e.data); });
if (window.api) window.api.onState(render);
if (top === window) document.documentElement.style.cursor = 'none';
