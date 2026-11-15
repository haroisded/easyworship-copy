const assert = require('node:assert/strict');
const { splitSlides, pickDisplay, outputBounds } = require('./lib');

assert.deepEqual(splitSlides('a\nb\n\n \r\n\nc\n\n'), ['a\nb', 'c']);
assert.deepEqual(splitSlides(''), []);
assert.deepEqual(splitSlides(null), []);

const main = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
const wall = { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 720 }, scaleFactor: 1.5 };
assert.equal(pickDisplay([main, wall], 2, 1), wall);   // saved one still attached
assert.equal(pickDisplay([main, wall], 1, 1), main);   // operator explicitly chose the primary
assert.equal(pickDisplay([main, wall], 99, 1), wall);  // saved one gone: first non-primary
assert.equal(pickDisplay([main, wall], null, 1), wall);
assert.equal(pickDisplay([main], 99, 1), null);        // nothing to output to

assert.deepEqual(outputBounds(wall, null), wall.bounds);
assert.deepEqual(outputBounds(wall, { x: 0, y: 0, w: 0, h: 0 }), wall.bounds);
assert.deepEqual(outputBounds(wall, { x: 150, y: 30, w: 960, h: 270 }), { x: 2020, y: 20, width: 640, height: 180 });

console.log('ok');
