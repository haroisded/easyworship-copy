// Pure helpers shared by main.js, control.html (as globals) and test.js.

// A blank line starts a new slide.
function splitSlides(text) {
  return String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
}

// The saved display if still attached, else the first non-primary one, else none.
function pickDisplay(displays, savedId, primaryId) {
  return displays.find(d => d.id === savedId) || displays.find(d => d.id !== primaryId) || null;
}

// Window bounds for the output. `region` is in physical pixels relative to the
// display's top-left corner (what an LED processor is configured in); Electron
// wants DIPs, hence the scaleFactor division. No region = the whole display.
function outputBounds(display, region) {
  const b = display.bounds, sf = display.scaleFactor || 1;
  if (!region || !(region.w > 0 && region.h > 0)) return { x: b.x, y: b.y, width: b.width, height: b.height };
  return {
    x: b.x + Math.round((region.x || 0) / sf),
    y: b.y + Math.round((region.y || 0) / sf),
    width: Math.round(region.w / sf),
    height: Math.round(region.h / sf),
  };
}

if (typeof module !== 'undefined') module.exports = { splitSlides, pickDisplay, outputBounds };
