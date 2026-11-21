// Small inline SVG icon set (chunky, outlined to match the UI).
const S = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const OUT = 'stroke="#0b0f15" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';

export const ICONS = {
  heart: S(`<path ${OUT} fill="#ff4d4d" d="M12 21s-8-5.2-8-11.1C4 6.6 6.4 4.5 9 4.5c1.4 0 2.4.6 3 1.6.6-1 1.6-1.6 3-1.6 2.6 0 5 2.1 5 5.4C20 15.8 12 21 12 21z"/><path fill="#ff9a9a" d="M7.2 8.2c.4-1.2 1.4-1.8 2.3-1.8" stroke="#ffd0d0" stroke-width="1.6" stroke-linecap="round"/>`),
  coin: S(`<circle ${OUT} cx="12" cy="12" r="8.5" fill="#ffc83a"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="#d99a12" stroke-width="1.8"/><path d="M12 8.5v7M10 10.2c0-1 1-1.4 2-1.4s2 .5 2 1.3c0 1.9-4 1.1-4 3 0 .9 1 1.4 2 1.4s2-.4 2-1.3" fill="none" stroke="#a86f00" stroke-width="1.6" stroke-linecap="round"/>`),
  pause: S(`<rect ${OUT} x="5.5" y="4.5" width="4.5" height="15" rx="1.2" fill="#fff"/><rect ${OUT} x="14" y="4.5" width="4.5" height="15" rx="1.2" fill="#fff"/>`),
  play: S(`<path ${OUT} fill="#fff" d="M7 4.5v15l12-7.5z"/>`),
  fast: S(`<path ${OUT} fill="#fff" d="M3.5 5.5v13l8.5-6.5zM12 5.5v13l8.5-6.5z"/>`),
  sound: S(`<path ${OUT} fill="#fff" d="M4 9.5h4l5-4v13l-5-4H4z"/><path d="M16 9c1.2 1.6 1.2 4.4 0 6M18.5 6.5c2.5 3 2.5 8 0 11" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`),
  mute: S(`<path ${OUT} fill="#fff" d="M4 9.5h4l5-4v13l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="#ff6a5a" stroke-width="2.4" stroke-linecap="round"/>`),
  skull: S(`<path ${OUT} fill="#e8e4d0" d="M12 3c-4.7 0-8 3.2-8 7.5 0 2.6 1.2 4.3 3 5.3V19c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5v-3.2c1.8-1 3-2.7 3-5.3C20 6.2 16.7 3 12 3z"/><circle cx="8.8" cy="11" r="2" fill="#0b0f15"/><circle cx="15.2" cy="11" r="2" fill="#0b0f15"/><path d="M10 17v2M12 17v2M14 17v2" stroke="#0b0f15" stroke-width="1.4"/>`),
  eye: S(`<path ${OUT} fill="#fff" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.3" fill="#2a6ac2" stroke="#0b0f15" stroke-width="1.6"/>`),
  wing: S(`<path ${OUT} fill="#9fd0ff" d="M3 15c4-1 7-4 9-9 1 4 4 7 9 8-3 3-7 4-10 3-3 1-6 0-8-2z"/>`),
  shield: S(`<path ${OUT} fill="#9aa3ad" d="M12 3l8 3v5.5c0 5-3.4 8.3-8 9.5-4.6-1.2-8-4.5-8-9.5V6z"/>`),
  bolt: S(`<path ${OUT} fill="#ffe14a" d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>`),
  fire: S(`<path ${OUT} fill="#ff8a1e" d="M12 21.5c-4 0-6.5-2.7-6.5-6.4 0-3.8 3-5.6 3.6-9.6 2.4 1.5 3.3 3.6 3.4 5.4 1-1 1.6-2.4 1.6-3.9 2.5 1.8 4.4 4.7 4.4 8.1 0 3.7-2.5 6.4-6.5 6.4z"/><path fill="#ffd36a" d="M12 20c-1.8 0-3-1.2-3-2.9 0-1.8 1.6-2.6 2-4.6 1.4 1 2.3 2 2.6 3.4.5-.4.8-1 .9-1.6 1 1 1.5 2 1.5 3 0 1.6-1.4 2.7-4 2.7z"/>`),
  target: S(`<circle ${OUT} cx="12" cy="12" r="8.5" fill="#ff5a4a"/><circle cx="12" cy="12" r="5" fill="#fff" stroke="#0b0f15" stroke-width="1.6"/><circle cx="12" cy="12" r="2" fill="#ff5a4a"/>`),
  range: S(`<circle ${OUT} cx="12" cy="12" r="8.5" fill="#4ab8ff" fill-opacity=".35"/><circle cx="12" cy="12" r="2.2" fill="#fff" stroke="#0b0f15" stroke-width="1.6"/>`),
  clock: S(`<circle ${OUT} cx="12" cy="12" r="8.5" fill="#fff"/><path d="M12 7v5.5l3.5 2" fill="none" stroke="#0b0f15" stroke-width="2" stroke-linecap="round"/>`),
  sword: S(`<path ${OUT} fill="#d8dde3" d="M19.5 3.5l-1 4.5-9 9-3-3 9-9z"/><path ${OUT} fill="#8a5a2b" d="M5 14.5l4.5 4.5-1.5 1.5-1.8-1.8-2 2-1.2-1.2 2-2L3.5 16z"/>`),
  star: S(`<path ${OUT} fill="#ffd34a" d="M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8z"/>`),
  crate: S(`<rect ${OUT} x="4" y="5" width="16" height="15" rx="1.5" fill="#c98a4a"/><path d="M4 9.5h16M4 15.5h16M9 5v15M15 5v15" stroke="#8a5a2b" stroke-width="1.6"/>`),
  close: S(`<path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>`),
  up: S(`<path ${OUT} fill="#5ee04a" d="M12 3.5l8 8.5h-5v8.5H9V12H4z"/>`),
};

export function icon(name) { return `<span class="ico">${ICONS[name] || ''}</span>`; }

/** Replace every [data-icon] element's contents with its SVG. */
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = ICONS[el.dataset.icon] || '';
}
