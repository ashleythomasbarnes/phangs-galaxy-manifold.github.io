// Makes `node --test site/tests/` work on Node >= 21, which resolves a directory argument as
// a module (this file) instead of searching it for test files. Older Node versions search
// the directory and never load this file.
import('./frame.test.mjs');
import('./overlays.test.mjs');
import('./phangs.test.mjs');
import('./nebulae.test.mjs');
import('./search.test.mjs');
import('./phangs-info.test.mjs');
import('./imagery.test.mjs');
import('./phangs-chips.test.mjs');
import('./presets.test.mjs');
import('./hips.test.mjs');
