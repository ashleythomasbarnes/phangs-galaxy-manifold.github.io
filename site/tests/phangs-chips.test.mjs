import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phangsPropertyChips, phangsDataChips } from '../js/ui/phangs-chips.js';

test('host property chips preserve missing and uncertain morphology', () => {
  assert.deepEqual(phangsPropertyChips({}), []);
  const chips = phangsPropertyChips({ source: { morph_string: 'SABc', morph_t: 5.2, morph_bar_flag: 1,
    morph_spiral_arms: 1, morph_interacting: .5, dist: 10, orient_incl: 30 } });
  assert.deepEqual(chips.map(s => s.label), ['Type SABc', 'T 5.2', 'Barred', 'Spiral arms', 'Possible interaction', '10.0 Mpc', 'i 30°']);
  assert.equal(phangsPropertyChips({ source: { morph_interacting: 0, morph_bar: null } }).length, 0);
});

test('data chips describe availability without release-status decorations', () => {
  const chips = phangsDataChips({ source: { survey_alma_status: 'released', survey_alma_instrument: '12m;7m;tp',
    survey_muse_status: 'observed_not_released', survey_hst_status: 'awarded_not_observed', survey_hi_status: 'not_in_survey' } });
  assert.deepEqual(chips.map(s => s.label), ['ALMA · Nominal PHANGS · 12m + 7m + tp', 'MUSE']);
  assert.deepEqual(phangsDataChips({}), []);
});

test('real host context contains morphology and catalogue coverage', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../data_phangs/phangs.json', import.meta.url)));
  const row = catalogue.galaxies.find(r => r.name === 'ngc1087');
  assert.ok(phangsPropertyChips(row).some(c => c.label.startsWith('Type ')));
  assert.ok(phangsDataChips(row).some(c => c.label.startsWith('MUSE')));
  assert.equal(row.values.z, row.source.orient_vlsr / 299792.458);
});

test('overview tags retain survey sources, AGN class codes and tentative MW membership', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../data_phangs/phangs.json', import.meta.url)));
  const row = catalogue.galaxies.find(r => r.name === 'ngc1097');
  const labels = phangsPropertyChips(row).map(c => c.label);
  for (const label of ['Ring · Gleis+26', 'Tentative MW-like · Evans+26', 'AGN · Véron', 'AGN · Asmus', 'Nuclear class S3b'])
    assert.ok(labels.includes(label), label);
  assert.ok(phangsDataChips(row).some(c => c.label === 'ALMA · eCMZ'));
  assert.ok(phangsDataChips(row).some(c => c.label === 'ALMA · ALMOND'));
  const firm = catalogue.galaxies.find(r => r.name === 'ngc3627');
  assert.ok(phangsPropertyChips(firm).some(c => c.label === 'MW-like · Evans+26'));
});
