// Removing the iframe disposes Aladin's globals, animation loop and WebGL context.
import { NGC628_HIPS } from '../config/hips.js?v=2';

const status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('nav button')];
const params = new URLSearchParams(location.search);
const galaxyCenter = ['ra', 'dec'].map(key => parseFloat(params.get(key)));
let viewer, build;
let initialCenter;
function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

async function fetchFile(url, json = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return json ? response.json() : response.text();
}

function reset() {
  viewer.gotoRaDec(...initialCenter);
  viewer.setFoV(NGC628_HIPS.fovDeg);
}

async function loadJwst() {
  buttons.forEach(button => { button.disabled = true; });
  message('Loading JWST HiPS…');
  try {
    const url = new URL(NGC628_HIPS.url, document.baseURI).href;
    await fetchFile(new URL('properties', url));
    build = await fetchFile(new URL('build.json', url), true);
    initialCenter = galaxyCenter.every(Number.isFinite) ? galaxyCenter : build.center;
    const tile = await fetch(new URL(build.preview_tile, url), { signal: AbortSignal.timeout(15000) });
    if (!tile.ok) throw new Error(`Missing JWST preview tile: HTTP ${tile.status}`);
    await tile.blob();
    const layerReady = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('JWST loading timed out')), 20000);
      const layer = A.imageHiPS(url, {
        name: 'NGC 628 JWST F770W', imgFormat: 'jpeg',
        successCallback: () => { clearTimeout(timer); resolve(); },
        errorCallback: error => { clearTimeout(timer); reject(error); },
      });
      if (viewer) viewer.setImageSurvey(layer);
      else viewer = A.aladin('#aladin', {
        survey: layer, target: `${initialCenter[0]} ${initialCenter[1]}`, fov: NGC628_HIPS.fovDeg,
        showLayersControl: false, showGotoControl: false, showFullscreenControl: false,
        showShareControl: false, showSimbadPointerControl: false, showContextMenu: false,
        showCooLocation: false, showZoomControl: false, showFrame: false,
        reticleColor: '#efe6d2', reticleSize: 16,
      });
    });
    await layerReady;
    reset();
    message('');
    buttons.forEach(button => { button.disabled = false; });
  } catch (error) {
    message('JWST HiPS unavailable. Click JWST F770W to retry. The static map is still available.', true);
    document.querySelector('#jwst').disabled = false;
    console.warn('JWST layer unavailable:', error);
  }
}

try {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => { script.remove(); reject(new Error('Aladin download timed out')); }, 20000);
    script.src = 'https://aladin.cds.unistra.fr/AladinLite/api/v3/3.8.1/aladin.js';
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => { clearTimeout(timeout); reject(new Error('Aladin download failed')); };
    document.head.append(script);
  });
  let initTimer;
  try {
    await Promise.race([A.init, new Promise((_, reject) => { initTimer = setTimeout(() => reject(new Error('Aladin initialization timed out')), 20000); })]);
  } finally { clearTimeout(initTimer); }
  document.querySelector('#jwst').addEventListener('click', loadJwst);
  document.querySelector('#reset').addEventListener('click', reset);
  document.querySelector('#zoom-in').addEventListener('click', () => viewer.setFoV(viewer.getFov()[0] / 2));
  document.querySelector('#zoom-out').addEventListener('click', () => viewer.setFoV(viewer.getFov()[0] * 2));
  await loadJwst();
} catch (error) {
  message('Aladin Lite unavailable. The static map is still available; close and reopen the inspector to retry.', true);
  console.warn('Aladin initialization failed:', error);
}
