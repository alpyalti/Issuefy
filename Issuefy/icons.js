/* Issuefy — HugeIcons loader (module).
   Loads the full free icon set from CDN, exposes a vanilla renderer + hydrator,
   and a window event so React/other code can render once ready. */

import * as ICONS from 'https://esm.sh/@hugeicons/core-free-icons';

function toKebab(k){ return k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()); }

function svgFor(name, opts){
  opts = opts || {};
  const size   = opts.size   || 24;
  const stroke = opts.stroke != null ? opts.stroke : 1.6;
  const color  = opts.color  || 'currentColor';
  const data = ICONS[name];
  if(!data){
    // graceful fallback: a hollow square so a missing name is visible but harmless
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}"><rect x="4" y="4" width="16" height="16" rx="3"></rect></svg>`;
  }
  const inner = data.map(node => {
    const tag = node[0], attrs = node[1] || {};
    const a = Object.keys(attrs)
      .filter(k => k !== 'key')
      .map(k => `${toKebab(k)}="${attrs[k]}"`)
      .join(' ');
    return `<${tag} ${a}></${tag}>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" class="hgi">${inner}</svg>`;
}

function hydrate(root){
  root = root || document;
  root.querySelectorAll('[data-icon]').forEach(el => {
    if(el.dataset.iconDone) return;
    const name   = el.getAttribute('data-icon');
    const size   = el.getAttribute('data-size')   || 22;
    const stroke = el.getAttribute('data-stroke') || 1.6;
    el.innerHTML = svgFor(name, { size:+size, stroke:+stroke });
    el.dataset.iconDone = '1';
  });
}

window.Issuefy = window.Issuefy || {};
window.Issuefy.ICONS  = ICONS;
window.Issuefy.svgFor = svgFor;
window.Issuefy.hydrate = hydrate;
window.Issuefy.ready  = true;

hydrate(document);
document.dispatchEvent(new CustomEvent('issuefy:icons-ready'));
