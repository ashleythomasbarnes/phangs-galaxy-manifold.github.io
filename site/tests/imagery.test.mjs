import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_LAYERS, cutoutImageUrl, phangsImageUrl, phangsImageField } from '../js/data/phangs.js';

test('image viewer includes all requested survey layers without duplicate keys', () => {
  assert.deepEqual(IMAGE_LAYERS.map(spec => spec.key), ['dss', 'ls-dr10', 'sdss', 'ls-dr9', '2mass', 'galex', 'allwise', 'xmm']);
  assert.equal(new Set(IMAGE_LAYERS.map(spec => spec.key)).size, IMAGE_LAYERS.length);
  for (const spec of IMAGE_LAYERS) assert.ok(spec.title && spec.sub && spec.label);
});

test('infrared, ultraviolet and X-ray requests use their registered HiPS, preserving position and field', () => {
  const ids = { '2mass': 'CDS/P/2MASS/color', galex: 'CDS/P/GALEXGR6_7/color', allwise: 'CDS/P/allWISE/color', xmm: 'ESDC/P/XMM/EPIC-RGB' };
  for (const [layer, hips] of Object.entries(ids)) {
    const url = new URL(cutoutImageUrl(24.174, 15.783, 720, 512, layer));
    assert.equal(url.origin, 'https://alasky.cds.unistra.fr');
    assert.equal(url.pathname, '/hips-image-services/hips2fits');
    assert.equal(url.searchParams.get('hips'), hips);
    assert.equal(url.searchParams.get('ra'), '24.174000');
    assert.equal(url.searchParams.get('dec'), '15.783000');
    assert.equal(Number(url.searchParams.get('fov')), .2);
    assert.equal(url.searchParams.get('width'), '512');
    assert.equal(url.searchParams.get('height'), '512');
    assert.equal(url.searchParams.get('coordsys'), 'icrs');
    assert.equal(url.searchParams.get('projection'), 'TAN');
    assert.equal(url.searchParams.get('rotation_angle'), '0');
    assert.equal(url.searchParams.get('format'), 'jpg');
  }
});

test('all PHANGS image surveys retain the same angular field and galaxy coordinates', () => {
  const row = { ra: 15.5, dec: -22.25, source: { size_r25: 300 } };
  const field = phangsImageField(row);
  for (const spec of IMAGE_LAYERS) {
    const url = new URL(phangsImageUrl(row, 256, spec.key));
    assert.equal(Number(url.searchParams.get('ra')), row.ra);
    assert.equal(Number(url.searchParams.get('dec')), row.dec);
    const angularField = spec.hips ? Number(url.searchParams.get('fov')) * 3600 : Number(url.searchParams.get('pixscale')) * 256;
    assert.equal(angularField, field);
    assert.equal(cutoutImageUrl(null, row.dec, field, 256, spec.key), null);
    assert.equal(cutoutImageUrl(row.ra, NaN, field, 256, spec.key), null);
  }
});

test('existing optical image defaults and Legacy Survey endpoints are retained', () => {
  const dss = new URL(cutoutImageUrl(1, 2, 240));
  assert.equal(dss.searchParams.get('hips'), 'CDS/P/DSS2/color');
  for (const layer of ['ls-dr10', 'sdss', 'ls-dr9']) {
    const url = new URL(cutoutImageUrl(1, 2, 240, 256, layer));
    assert.equal(url.origin, 'https://www.legacysurvey.org');
    assert.equal(url.searchParams.get('layer'), layer);
    assert.equal(Number(url.searchParams.get('pixscale')), 240 / 256);
  }
  assert.match(IMAGE_LAYERS.find(spec => spec.key === 'xmm').sub, /coverage varies/);
  assert.match(IMAGE_LAYERS.find(spec => spec.key === 'galex').sub, /coverage varies/);
});
