import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { NGC628_HIPS, hasHipsDemo } from '../js/config/hips.js';

test('HiPS demo is limited to NGC 628 catalogue names', () => {
  for (const name of ['ngc0628', 'NGC628', 'NGC 628']) assert.ok(hasHipsDemo({ name }));
  for (const name of ['ngc06288', 'ngc3628', '', 'm74']) assert.ok(!hasHipsDemo({ name }));
  assert.ok(!hasHipsDemo(null));
});

test('published JWST preview has a complete JPEG pyramid and no science tile format', () => {
  const root = new URL(`../${NGC628_HIPS.url}`, import.meta.url);
  const report = JSON.parse(readFileSync(new URL('build.json', root)));
  const properties = readFileSync(new URL('properties', root), 'utf8');
  assert.match(properties, /^hips_tile_format\s*=\s*jpeg$/m);
  assert.doesNotMatch(properties, /\/Users\/|hipsgen_params/);
  assert.equal(report.order, 12);
  assert.equal(report.hdu.name, 'SCI');
  assert.ok(report.pixel_arcsec > .1 && report.pixel_arcsec < .101);
  assert.ok(existsSync(new URL(report.preview_tile, root)));
  assert.ok(existsSync(new URL('Moc.fits', root)));
  assert.ok(existsSync(new URL('Norder3/Allsky.jpg', root)));
});
