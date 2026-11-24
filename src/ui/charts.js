// End-of-game graphs, drawn as SVG from Game.history (a running total of
// everything at the end of each wave). Three views:
//   DAMAGE   stacked bars: damage dealt in each wave, by tower type
//   ECONOMY  cash in hand and lives after each wave (two small charts, one x axis)
//   TOWERS   every tower ranked by damage (doubles as the table view)
import { TOWERS, TOWER_ORDER } from '../config/towers.js';

const NS = 'http://www.w3.org/2000/svg';
// Categorical slots, stepped for a dark surface. Fixed order; past five types
// the rest fold into "Other" (grey) instead of inventing more hues.
const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
const OTHER = '#7d8794';
const MAX_SERIES = SERIES.length;
const W = 640;

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

/** 0, step, 2·step... covering max with about `count` gridlines at round numbers. */
function ticks(max, count = 3) {
  if (max <= 0) return { top: 1, list: [0, 1] };
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  const list = [];
  for (let v = 0; v <= top + step / 2; v += step) list.push(v);
  return { top, list };
}

/** Which tower types get their own colour: the five that dealt the most, in shop order. */
function damageSeries(history) {
  const last = history.at(-1)?.dmg || {};
  const ranked = Object.keys(last).filter((k) => last[k] > 0).sort((a, b) => last[b] - last[a]);
  const own = ranked.length > MAX_SERIES ? ranked.slice(0, MAX_SERIES - 1) : ranked;
  own.sort((a, b) => TOWER_ORDER.indexOf(a) - TOWER_ORDER.indexOf(b));
  const series = own.map((type, i) => ({ key: type, name: TOWERS[type]?.name || type, color: SERIES[i] }));
  if (ranked.length > own.length) series.push({ key: '*', name: 'Other', color: OTHER, types: ranked.slice(own.length) });
  return series;
}

/** Per-wave damage by series (history holds running totals). */
function damageRows(history, series) {
  let prev = {};
  return history.map((h) => {
    const d = (k) => (h.dmg[k] || 0) - (prev[k] || 0);
    const vals = series.map((s) => Math.max(0, s.types ? s.types.reduce((n, k) => n + d(k), 0) : d(s.key)));
    prev = h.dmg;
    return { w: h.w, partial: h.partial, vals, total: vals.reduce((a, b) => a + b, 0) };
  });
}

/** Wave labels along the bottom, thinned out so they never collide. */
function xLabels(g, rows, x, y) {
  const minGap = 26;
  const band = rows.length > 1 ? x(1) - x(0) : minGap;
  const every = Math.max(1, Math.ceil(minGap / band));
  const last = rows.length - 1;
  rows.forEach((r, i) => {
    // Every `every`th wave, and always the last one (dropping a label that would crowd it).
    const show = i === last || (i % every === 0 && last - i >= every);
    if (show) el('text', { x: x(i), y, 'text-anchor': 'middle', class: 'ax' }, g).textContent = r.w;
  });
}

function yAxis(g, t, y, left, right) {
  for (const v of t.list) {
    el('line', { x1: left, x2: right, y1: y(v), y2: y(v), class: v ? 'grid' : 'base' }, g);
    el('text', { x: left - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ax' }, g).textContent = short(v);
  }
}

/** Tooltip: a title line, then one row per value. Built with textContent only. */
function fillTip(tip, title, rows) {
  tip.replaceChildren();
  const h = document.createElement('b');
  h.textContent = title;
  tip.appendChild(h);
  for (const r of rows) {
    const line = document.createElement('div');
    if (r.color) { const sw = document.createElement('i'); sw.style.background = r.color; line.appendChild(sw); }
    const name = document.createElement('span'); name.textContent = r.name;
    const val = document.createElement('em'); val.textContent = r.value;
    line.append(name, val);
    if (r.strong) line.className = 'sum';
    tip.appendChild(line);
  }
}

function placeTip(tip, box, px, py) {
  tip.classList.remove('hidden');
  const r = box.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = px - r.left + 14;
  if (left + tw > r.width) left = px - r.left - tw - 14;
  let top = Math.max(0, Math.min(r.height - th, py - r.top - th / 2));
  tip.style.transform = `translate(${Math.max(0, left)}px, ${top}px)`;
}

// ------------------------------------------------------------- DAMAGE ---
function damageChart(box, history) {
  const series = damageSeries(history);
  const rows = damageRows(history, series);
  const H = 190, L = 44, R = W - 6, T = 8, B = H - 22;
  const t = ticks(Math.max(...rows.map((r) => r.total), 1));
  const n = rows.length;
  const band = (R - L) / n;
  const bw = Math.max(2, Math.min(28, band - 2));
  const x = (i) => L + band * (i + 0.5);
  const y = (v) => B - (v / t.top) * (B - T);

  // Several tower types: a legend. Just one: the title names it.
  const head = document.createElement('div');
  if (series.length > 1) {
    head.className = 'chart-legend';
    for (const s of series) {
      const it = document.createElement('span');
      const sw = document.createElement('i'); sw.style.background = s.color;
      it.append(sw, document.createTextNode(s.name));
      head.appendChild(it);
    }
  } else {
    head.className = 'chart-title';
    head.textContent = `Damage dealt each wave${series[0] ? ` · ${series[0].name}` : ''}`;
  }
  box.appendChild(head);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Damage dealt each wave, by tower type' });
  yAxis(svg, t, y, L, R);
  const marks = el('g', {}, svg);
  rows.forEach((r, i) => {
    let base = B;
    const top = r.vals.reduce((last, v, k) => (v > 0 ? k : last), -1);
    r.vals.forEach((v, k) => {
      if (v <= 0) return;
      const h = (v / t.top) * (B - T);
      const y0 = base - h;
      const gap = k === top ? 0 : Math.min(2, h / 2);   // 2px of surface between stacked segments
      const x0 = x(i) - bw / 2;
      if (k === top) {
        const rr = Math.min(3, bw / 2, h);
        el('path', { d: `M${x0},${base}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x0 + bw - rr}Q${x0 + bw},${y0} ${x0 + bw},${y0 + rr}V${base}Z`, fill: series[k].color }, marks);
      } else {
        el('rect', { x: x0, y: y0 + gap, width: bw, height: Math.max(0.5, h - gap), fill: series[k].color }, marks);
      }
      base = y0;
    });
  });
  xLabels(svg, rows, x, H - 6);
  const hover = el('rect', { x: 0, y: T, width: 0, height: B - T, class: 'hover-band' }, svg);
  box.appendChild(svg);

  const tip = box.querySelector('.chart-tip');
  const pick = (e) => {
    const p = svg.getBoundingClientRect();
    const vx = ((e.clientX - p.left) / p.width) * W;
    return Math.max(0, Math.min(n - 1, Math.floor((vx - L) / band)));
  };
  let shown = -1;   // the tooltip is only rebuilt when the pointer moves to another wave
  svg.addEventListener('pointermove', (e) => {
    const i = pick(e), r = rows[i];
    if (i !== shown) {
      shown = i;
      hover.setAttribute('x', L + band * i); hover.setAttribute('width', band);
      const list = series.map((s, k) => ({ color: s.color, name: s.name, value: fmt(r.vals[k]) })).filter((_, k) => r.vals[k] > 0).reverse();
      list.push({ name: 'Total', value: fmt(r.total), strong: true });
      fillTip(tip, `Wave ${r.w}${r.partial ? ' (lost)' : ''}`, list);
    }
    placeTip(tip, box, e.clientX, e.clientY);
  });
  svg.addEventListener('pointerleave', () => { shown = -1; tip.classList.add('hidden'); hover.setAttribute('width', 0); });
}

// ------------------------------------------------------------ ECONOMY ---
function economyChart(box, history, maxLives) {
  const n = history.length;
  const panels = [
    { title: 'Cash in hand', get: (h) => h.cash },
    { title: 'Lives', get: (h) => h.lives, max: maxLives },
  ];
  const PH = 100, L = 44, R = W - 10;
  const H = PH * panels.length + 22;
  const x = (i) => (n === 1 ? (L + R) / 2 : L + ((R - L) * i) / (n - 1));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Cash in hand and lives after each wave' });
  const dots = [];
  panels.forEach((p, k) => {
    const T = k * PH + 22, B = (k + 1) * PH - 8;
    const vals = history.map(p.get);
    const t = ticks(Math.max(p.max || 0, ...vals, 1), 2);
    const y = (v) => B - (v / t.top) * (B - T);
    el('text', { x: L, y: T - 7, class: 'panel-title' }, svg).textContent = p.title;
    yAxis(svg, t, y, L, R);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    if (n > 1) el('polyline', { points: pts.join(' '), class: 'line', stroke: SERIES[k * 2] }, svg);
    else el('circle', { cx: x(0), cy: y(vals[0]), r: 4, fill: SERIES[k * 2] }, svg);
    dots.push({ dot: el('circle', { r: 4.5, class: 'hover-dot', fill: SERIES[k * 2] }, svg), y, vals });
  });
  xLabels(svg, history, x, H - 6);
  const cross = el('line', { y1: 12, y2: H - 22, class: 'crosshair' }, svg);
  box.appendChild(svg);

  const tip = box.querySelector('.chart-tip');
  let shown = -1;
  svg.addEventListener('pointermove', (e) => {
    const p = svg.getBoundingClientRect();
    const vx = ((e.clientX - p.left) / p.width) * W;
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((vx - L) / (R - L)) * (n - 1))));
    if (i === shown) { placeTip(tip, box, e.clientX, e.clientY); return; }
    shown = i;
    const h = history[i], prev = history[i - 1];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.classList.add('on');
    for (const d of dots) { d.dot.setAttribute('cx', x(i)); d.dot.setAttribute('cy', d.y(d.vals[i])); d.dot.classList.add('on'); }
    const lost = h.lives - (prev ? prev.lives : maxLives);
    fillTip(tip, `After wave ${h.w}${h.partial ? ' (lost)' : ''}`, [
      { color: SERIES[0], name: 'Cash', value: `$${fmt(h.cash)}` },
      { name: 'Earned this wave', value: `+$${fmt(h.earned - (prev ? prev.earned : 0))}` },
      { color: SERIES[2], name: 'Lives', value: `${fmt(h.lives)}${lost < 0 ? ` (${lost})` : ''}` },
    ]);
    placeTip(tip, box, e.clientX, e.clientY);
  });
  svg.addEventListener('pointerleave', () => {
    shown = -1;
    tip.classList.add('hidden'); cross.classList.remove('on');
    for (const d of dots) d.dot.classList.remove('on');
  });
}

// ------------------------------------------------------------- TOWERS ---
function towerTable(box, game, portraits) {
  const all = [...game.towers, ...game.retired].filter((t) => t.damageDealt > 0 || t.kills > 0);
  all.sort((a, b) => b.damageDealt - a.damageDealt);
  const total = all.reduce((n, t) => n + t.damageDealt, 0) || 1;
  const list = document.createElement('table');
  list.className = 'tower-table';
  list.innerHTML = '<thead><tr><th></th><th>Tower</th><th class="bar-col">Share of damage</th><th>Damage</th><th>Kills</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const t of all.slice(0, 8)) {
    const tr = document.createElement('tr');
    const share = t.damageDealt / total;
    const sold = !game.towers.includes(t);
    tr.innerHTML = `<td><img alt="" src="${portraits.tower(t.type, t.level)}"></td><td><b></b><small></small></td>
      <td class="bar-col"><span class="share"><i style="width:${(share * 100).toFixed(1)}%"></i></span><em>${Math.round(share * 100)}%</em></td>
      <td>${fmt(t.damageDealt)}</td><td>${fmt(t.kills)}</td>`;
    tr.querySelector('b').textContent = t.def.name;
    tr.querySelector('small').textContent = `Level ${t.level}${sold ? ' · sold' : ''}`;
    body.appendChild(tr);
  }
  list.appendChild(body);
  box.appendChild(list);
  if (all.length > 8) {
    const more = document.createElement('p');
    more.className = 'chart-note';
    more.textContent = `+ ${all.length - 8} more towers`;
    box.appendChild(more);
  }
}

// --------------------------------------------------------------- entry ---
export const GRAPH_TABS = [['damage', 'DAMAGE'], ['economy', 'ECONOMY'], ['towers', 'TOWERS']];

/** Draws one graph tab into `box` (replacing what was there). */
export function renderGraph(box, tab, game, portraits) {
  box.replaceChildren();
  const tip = document.createElement('div');
  tip.className = 'chart-tip hidden';
  box.appendChild(tip);
  if (tab === 'towers') return towerTable(box, game, portraits);
  if (!game.history.length) {
    const p = document.createElement('p');
    p.className = 'chart-note';
    p.textContent = 'No waves finished, so there is nothing to graph yet.';
    box.appendChild(p);
    return;
  }
  if (tab === 'economy') economyChart(box, game.history, game.maxLives);
  else damageChart(box, game.history);
}
