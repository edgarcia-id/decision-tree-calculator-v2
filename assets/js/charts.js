/*!
 * Decision Tree Calculator — diagram SVG (tanpa pustaka)
 * (c) 2026 Alfredo Garcia — MIT License
 *
 * Setiap fungsi mengembalikan { svg, width, height, table, meta }:
 *  - svg   : string SVG mandiri (warna eksplisit, siap diekspor PNG/SVG/PDF)
 *  - table : { head: [...], rows: [[...]] } untuk tampilan tabel aksesibel
 *  - meta  : geometri untuk interaksi
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DTCharts = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

  // Palet kategorikal tervalidasi (aman untuk buta warna, urutan tetap). Warna alternatif k selalu sama di semua diagram.
  const THEMES = {
    light: {
      name: 'light', surface: '#ffffff', ink: '#182230', ink2: '#475569', muted: '#64748b',
      grid: '#e2e8f0', axis: '#cbd5e1', band: '#eef2ff', brand: '#4f46e5', navy: '#312e81',
      good: '#059669', critical: '#e11d48', seqLo: '#eef2ff', seqHi: '#312e81',
      series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
      overflow: '#94a3b8'
    }
  };

  let locale = { decimalSep: ',' };
  function setLocale(l) { locale = Object.assign({}, locale, l || {}); }
  /** Angka dengan pemisah ribuan & desimal sesuai lokal (1.234,56 atau 1,234.56). */
  function num(x, d) {
    if (x === null || x === undefined || !isFinite(x)) return '–';
    let s = Number(x).toFixed(d === undefined ? 2 : d);
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
    const neg = s[0] === '-';
    if (neg) s = s.slice(1);
    const [int, frac] = s.split('.');
    const g = locale.decimalSep === ',' ? '.' : ',';
    const out = int.replace(/\B(?=(\d{3})+(?!\d))/g, g) + (frac ? (locale.decimalSep === ',' ? ',' : '.') + frac : '');
    return (neg ? '−' : '') + out;
  }
  /** Seperti num, tetapi nol di belakang koma dibuang (maksimal d desimal). */
  function numTrim(x, d) {
    const s = num(x, d);
    const sep = locale.decimalSep === ',' ? ',' : '.';
    return s.includes(sep) ? s.replace(new RegExp('\\' + sep + '?0+$'), '') : s;
  }
  function pct(x, d) { return num(x * 100, d === undefined ? 1 : d) + '%'; }

  function colorAt(theme, i) { return i < theme.series.length ? theme.series[i] : theme.overflow; }

  /* ------------------------------------------------------------------ *
   * Primitif
   * ------------------------------------------------------------------ */

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function f(n) { return Math.round(n * 100) / 100; }
  function attrs(o) {
    let s = '';
    for (const k of Object.keys(o)) if (o[k] !== undefined && o[k] !== null && o[k] !== false) s += ' ' + k + '="' + esc(o[k]) + '"';
    return s;
  }
  function text(x, y, s, o) {
    o = o || {};
    return '<text' + attrs({
      x: f(x), y: f(y), 'font-size': o.size || 12, 'font-weight': o.weight || null,
      fill: o.fill, 'text-anchor': o.anchor || null, 'dominant-baseline': o.baseline || 'middle',
      'font-variant-numeric': o.tabular ? 'tabular-nums' : null, opacity: o.opacity, transform: o.transform || null
    }) + '>' + esc(s) + '</text>';
  }
  function line(x1, y1, x2, y2, stroke, w, extra) {
    return '<line' + attrs(Object.assign({ x1: f(x1), y1: f(y1), x2: f(x2), y2: f(y2), stroke, 'stroke-width': w || 1 }, extra || {})) + '/>';
  }
  /** Batang horizontal: ujung data membulat 4px, sisi baseline persegi. */
  function hbar(x0, y, len, h, fill, extra) {
    len = Math.max(0, len);
    if (len < 0.5) return '';
    const r = Math.min(4, len, h / 2);
    const x1 = x0 + len;
    const d = `M${f(x0)},${f(y)}H${f(x1 - r)}Q${f(x1)},${f(y)} ${f(x1)},${f(y + r)}V${f(y + h - r)}Q${f(x1)},${f(y + h)} ${f(x1 - r)},${f(y + h)}H${f(x0)}Z`;
    return '<path' + attrs(Object.assign({ d, fill }, extra || {})) + '/>';
  }

  let measureCtx = null;
  function measure(s, size, weight) {
    s = String(s);
    if (typeof document !== 'undefined') {
      try {
        if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
        measureCtx.font = (weight || 400) + ' ' + size + 'px ' + FONT;
        return measureCtx.measureText(s).width;
      } catch (e) { /* fallback */ }
    }
    return s.length * size * 0.56;
  }
  function ellipsize(s, maxW, size, weight) {
    s = String(s);
    if (measure(s, size, weight) <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (measure(s.slice(0, mid) + '…', size, weight) <= maxW) lo = mid; else hi = mid - 1;
    }
    return s.slice(0, Math.max(1, lo)).trimEnd() + '…';
  }
  function wrap(s, maxW, size, lines, weight) {
    const words = String(s).split(/\s+/).filter(Boolean);
    const out = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const tryS = cur ? cur + ' ' + words[i] : words[i];
      if (measure(tryS, size, weight) <= maxW || !cur) { cur = tryS; continue; }
      out.push(cur);
      cur = words[i];
      if (out.length === lines - 1) { cur = words.slice(i).join(' '); break; }
    }
    if (cur) out.push(cur);
    return out.slice(0, lines).map((l, i) => (i === lines - 1 || measure(l, size, weight) > maxW ? ellipsize(l, maxW, size, weight) : l));
  }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / exp;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * exp;
  }
  function ticks(max, count) {
    const step = niceMax(max / (count || 4));
    const out = [];
    for (let v = 0; v <= max + step * 1e-6; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function decimalsFor(step) {
    for (let d = 0; d <= 6; d++) { const s = step * Math.pow(10, d); if (Math.abs(Math.round(s) - s) < 1e-7) return d; }
    return 6;
  }
  function mix(hex, toHex, t) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = p(hex), b = p(toHex);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function luminance(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function onColor(hex) { return luminance(hex) > 0.36 ? '#14213d' : '#ffffff'; }

  function open(w, h, theme, label) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" width="${f(w)}" height="${f(h)}" font-family="${esc(FONT)}" role="img" aria-label="${esc(label || '')}">` +
      `<rect width="${f(w)}" height="${f(h)}" fill="${theme.surface}"/>`;
  }
  function legend(items, x, y, maxW, theme) {
    let cx = x, cy = y, out = '';
    const size = 12, gap = 18, rowH = 20;
    for (const it of items) {
      const label = ellipsize(it.label, Math.min(200, maxW - 24), size);
      const w = 16 + measure(label, size) + gap;
      if (cx + w > x + maxW && cx > x) { cx = x; cy += rowH; }
      if (it.shape === 'line') out += line(cx, cy, cx + 12, cy, it.color, 2.5, { 'stroke-linecap': 'round' });
      else if (it.shape === 'dot') out += `<circle cx="${f(cx + 6)}" cy="${f(cy)}" r="5" fill="${it.color}"/>`;
      else out += `<rect x="${f(cx)}" y="${f(cy - 6)}" width="12" height="12" rx="3" fill="${it.color}"/>`;
      out += text(cx + 17, cy + 0.5, label, { fill: theme.ink2, size });
      cx += w;
    }
    return { svg: out, height: cy - y + rowH };
  }
  function legendHeight(items, maxW) {
    let cx = 0, rows = 1;
    for (const it of items) {
      const w = 16 + Math.min(measure(it.label, 12), 200) + 18;
      if (cx + w > maxW && cx > 0) { cx = 0; rows++; }
      cx += w;
    }
    return rows * 20;
  }
  function finish(svg, w, h, table, meta) { return { svg: svg + '</svg>', width: w, height: h, table, meta: meta || {} }; }


  /* ------------------------------------------------------------------ *
   * Skala numerik dengan nilai negatif
   * ------------------------------------------------------------------ */

  function niceStep(raw) {
    if (!(raw > 0) || !isFinite(raw)) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / exp;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * exp;
  }
  function niceDomain(lo, hi, count, includeZero) {
    if (includeZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-12) { const d = Math.abs(hi) * 0.1 || 1; lo -= d; hi += d; }
    const step = niceStep((hi - lo) / (count || 5));
    return { lo: Math.floor(lo / step + 1e-9) * step, hi: Math.ceil(hi / step - 1e-9) * step, step };
  }
  function tickList(dom) {
    const out = [];
    for (let v = dom.lo; v <= dom.hi + dom.step * 1e-6; v += dom.step) out.push(+v.toFixed(10));
    return out;
  }
  const fmtTick = (t, dom) => num(t, decimalsFor(dom.step));

  /* ------------------------------------------------------------------ *
   * 1. Diagram pohon keputusan
   * ------------------------------------------------------------------ */

  const NODE_COLORS = { decision: '#4f46e5', chance: '#0f9f6e', terminal: '#e8590c' };

  /**
   * d: {root (hasil evaluasi), fmtV, fmtP, probPercent, selected, showJoint}
   * root node: {id, type, name, value, ev, ce, branches:[{id,name,p,cash,child}], payoff, choice}
   */
  function treeDiagram(d, theme, opts) {
    opts = opts || {};
    const fmtV = d.fmtV || ((x) => num(x, 2));
    const fmtP = d.fmtP || ((p) => pct(p, 0));
    const ROW = 58, PAD = 16, HALF = 10, DIAG = 22, TOP = 54;
    // kumpulkan simpul & kedalaman, hitung slot daun
    const levels = [];
    let leaf = 0;
    const items = [];
    (function rec(r, depth, onPolicy, joint) {
      const it = { r, depth, onPolicy, joint, kids: [] };
      items.push(it);
      levels[depth] = levels[depth] || [];
      levels[depth].push(it);
      if (r.type === 'terminal' || !r.branches || !r.branches.length) { it.slot = leaf++; return it; }
      r.branches.forEach((b, i) => {
        const pol = onPolicy && (r.type === 'chance' || i === r.choice);
        const j = r.type === 'chance' ? joint * (isFinite(b.p) ? b.p : 0) : joint;
        const k = rec(b.child, depth + 1, pol, j);
        it.kids.push({ b, k, i });
      });
      it.slot = (it.kids[0].k.slot + it.kids[it.kids.length - 1].k.slot) / 2;
      return it;
    }(d.root, 0, true, 1));
    // lebar tiap tingkat menurut label cabang
    const levelW = [];
    for (let dep = 0; dep < levels.length - 1; dep++) {
      let w = 0;
      for (const it of levels[dep]) for (const { b } of it.kids) {
        const lab1 = measure(b.name || '', 12, 600);
        const lab2 = measure(branchSub(it.r, b), 11);
        w = Math.max(w, lab1, lab2);
      }
      levelW.push(Math.max(120, Math.min(300, w + DIAG + 34 + HALF * 2)));
    }
    const termW = Math.max(90, ...items.filter((it) => it.r.type === 'terminal').map((it) => Math.max(measure(fmtV(it.r.payoff), 12.5, 700), measure('P = ' + fmtP(it.joint), 10.5)) + 30));
    const rootLabW = Math.max(60, Math.min(150, measure(d.root.name || '', 10.5)) - 8, measure(fmtV(d.root.value), 12.5, 700) / 2 + 10);
    const xs = [PAD + rootLabW];
    for (let i = 0; i < levelW.length; i++) xs.push(xs[i] + levelW[i]);
    const W = Math.max(opts.minWidth || 0, xs[xs.length - 1] + termW + PAD);
    const H = TOP + Math.max(1, leaf) * ROW + PAD;
    const yOf = (slot) => TOP + slot * ROW + ROW / 2;
    let s = open(W, H, theme, 'Diagram pohon keputusan');
    // legenda
    const lg = [
      { label: 'Keputusan', shape: 'sq', color: NODE_COLORS.decision },
      { label: 'Peluang', shape: 'ci', color: NODE_COLORS.chance },
      { label: 'Akhir', shape: 'tr', color: NODE_COLORS.terminal },
      { label: 'Kebijakan optimal', shape: 'line', color: theme.brand },
      { label: 'Tidak dipilih', shape: 'cut', color: theme.overflow }
    ];
    let lx = PAD;
    for (const it of lg) {
      const y = 16;
      if (it.shape === 'sq') s += `<rect x="${lx}" y="${y - 6}" width="12" height="12" rx="2" fill="${it.color}"/>`;
      else if (it.shape === 'ci') s += `<circle cx="${lx + 6}" cy="${y}" r="6.5" fill="${it.color}"/>`;
      else if (it.shape === 'tr') s += `<path d="M${lx},${y}L${lx + 12},${y - 7}L${lx + 12},${y + 7}Z" fill="${it.color}"/>`;
      else if (it.shape === 'line') s += line(lx, y, lx + 16, y, it.color, 3, { 'stroke-linecap': 'round' });
      else { s += line(lx, y, lx + 16, y, it.color, 1.5); s += line(lx + 5, y + 5, lx + 8, y - 5, it.color, 1.5) + line(lx + 9, y + 5, lx + 12, y - 5, it.color, 1.5); }
      const tx = lx + (it.shape === 'line' || it.shape === 'cut' ? 21 : 17);
      s += text(tx, y + 0.5, it.label, { fill: theme.ink2, size: 11.5 });
      lx = tx + measure(it.label, 11.5) + 16;
      if (lx > W - 80) break;
    }
    // cabang dulu (di bawah simpul)
    const halo = `stroke="${theme.surface}" stroke-width="4" paint-order="stroke" stroke-linejoin="round"`;
    for (const it of items) {
      if (!it.kids.length) continue;
      const x = xs[it.depth], y = yOf(it.slot);
      for (const { b, k, i } of it.kids) {
        const cx = xs[k.depth], cy = yOf(k.slot);
        const chosen = it.r.type === 'chance' || i === it.r.choice;
        const pol = it.onPolicy && chosen;
        const col = pol ? theme.brand : chosen ? '#94a3b8' : '#cbd5e1';
        const sx = x + HALF + 2, mx = sx + DIAG;
        s += `<path d="M${f(sx)},${f(y)}L${f(mx)},${f(cy)}L${f(cx - HALF - 2)},${f(cy)}" fill="none" stroke="${col}" stroke-width="${pol ? 3 : 1.6}" stroke-linejoin="round" stroke-linecap="round"/>`;
        if (it.r.type === 'decision' && !chosen) {
          const px = (mx + cx - HALF) / 2;
          s += line(px - 6, cy + 6, px - 1, cy - 6, '#94a3b8', 1.6) + line(px + 1, cy + 6, px + 6, cy - 6, '#94a3b8', 1.6);
        }
        const lab = b.name || '';
        s += `<text x="${f(mx + 6)}" y="${f(cy - 8)}" font-size="12" font-weight="600" fill="${pol ? theme.ink : theme.ink2}" ${halo}>${esc(ellipsize(lab, levelW[it.depth] - DIAG - 20, 12, 600))}</text>`;
        const sub = branchSub(it.r, b);
        if (sub) s += `<text x="${f(mx + 6)}" y="${f(cy + 15)}" font-size="11" fill="${theme.muted}" font-variant-numeric="tabular-nums" ${halo}>${esc(sub)}</text>`;
      }
    }
    function branchSub(r, b) {
      const parts = [];
      if (r.type === 'chance') parts.push(isFinite(b.p) ? fmtP(b.p) : '?');
      if (b.cash) parts.push((b.cash > 0 ? '+' : '') + fmtV(b.cash));
      return parts.join('   ');
    }
    // simpul
    for (const it of items) {
      const r = it.r, x = xs[it.depth], y = yOf(it.slot);
      const sel = d.selected && d.selected === r.id;
      const tip = nodeTip(r, it);
      if (sel) s += `<circle cx="${f(x)}" cy="${f(y)}" r="17" fill="none" stroke="${theme.brand}" stroke-width="2" stroke-dasharray="3 3"/>`;
      if (r.type === 'decision') s += `<rect x="${f(x - HALF)}" y="${f(y - HALF)}" width="${HALF * 2}" height="${HALF * 2}" rx="3" fill="${NODE_COLORS.decision}" data-node="${esc(r.id)}" data-tip="${esc(tip)}" style="cursor:pointer"/>`;
      else if (r.type === 'chance') s += `<circle cx="${f(x)}" cy="${f(y)}" r="${HALF + 0.5}" fill="${NODE_COLORS.chance}" data-node="${esc(r.id)}" data-tip="${esc(tip)}" style="cursor:pointer"/>`;
      else s += `<path d="M${f(x - HALF)},${f(y)}L${f(x + HALF - 1)},${f(y - 8)}L${f(x + HALF - 1)},${f(y + 8)}Z" fill="${NODE_COLORS.terminal}" data-node="${esc(r.id)}" data-tip="${esc(tip)}" style="cursor:pointer"/>`;
      if (r.type === 'terminal') {
        s += `<text x="${f(x + HALF + 6)}" y="${f(y - 1)}" font-size="12.5" font-weight="700" fill="${it.onPolicy ? theme.ink : theme.ink2}" font-variant-numeric="tabular-nums" dominant-baseline="middle">${esc(fmtV(r.payoff))}</text>`;
        if (d.showJoint !== false) s += `<text x="${f(x + HALF + 6)}" y="${f(y + 14)}" font-size="10.5" fill="${theme.muted}" font-variant-numeric="tabular-nums" dominant-baseline="middle">P = ${esc(fmtP(it.joint))}</text>`;
      } else {
        const val = isFinite(r.value) ? fmtV(r.value) : '–';
        s += `<text x="${f(x)}" y="${f(y - 17)}" font-size="12.5" font-weight="700" text-anchor="middle" fill="${theme.navy}" font-variant-numeric="tabular-nums" ${halo}>${esc(val)}</text>`;
        // Nama simpul rata kanan di atas simpul agar tidak menabrak label cabang keluar di sebelah kanan.
        const nameMax = it.depth === 0 ? 150 : Math.max(60, Math.min(170, levelW[it.depth - 1] - 36));
        if (r.name) s += `<text x="${f(x + 12)}" y="${f(y - 31)}" font-size="10.5" text-anchor="end" fill="${theme.muted}" ${halo}>${esc(ellipsize(r.name, nameMax, 10.5))}</text>`;
      }
    }
    function nodeTip(r, it) {
      const kind = r.type === 'decision' ? 'Simpul keputusan' : r.type === 'chance' ? 'Simpul peluang' : 'Simpul akhir';
      const lines = [`${kind}${r.name ? ': ' + r.name : ''}`];
      if (r.type === 'terminal') { lines.push(`Nilai jalur: ${fmtV(r.payoff)}`); lines.push(`Peluang jalur: ${fmtP(it.joint)}`); }
      else {
        lines.push(`Nilai: ${isFinite(r.value) ? fmtV(r.value) : '–'}`);
        if (d.utility && isFinite(r.ev)) lines.push(`Nilai harapan: ${fmtV(r.ev)}`);
        if (r.type === 'decision' && r.branches[r.choice]) lines.push(`Pilihan terbaik: ${r.branches[r.choice].name}`);
        if (isFinite(r.min) && isFinite(r.max)) lines.push(`Rentang hasil: ${fmtV(r.min)} s.d. ${fmtV(r.max)}`);
      }
      return lines.join('\n');
    }
    const rows = [];
    for (const it of items) if (it.r.type === 'terminal') rows.push([pathLabel(it), fmtP(it.joint), fmtV(it.r.payoff), it.onPolicy ? 'Ya' : '']);
    function pathLabel(it) {
      const names = [];
      let cur = it;
      for (;;) {
        const parent = items.find((p) => p.kids.some((k) => k.k === cur));
        if (!parent) break;
        names.unshift(parent.kids.find((k) => k.k === cur).b.name);
        cur = parent;
      }
      return names.join(' › ');
    }
    return finish(s, W, H, { head: ['Jalur', 'Peluang jalur', 'Nilai', 'Kebijakan optimal'], rows });
  }

  /* ------------------------------------------------------------------ *
   * 2. Perbandingan nilai alternatif (batang + rentang)
   * ------------------------------------------------------------------ */

  function valueBars(d, theme, opts) {
    // d: items [{name, value, min?, max?}], best: idx, fmtV, title
    opts = opts || {};
    const W = Math.max(320, opts.width || 640);
    const fmtV = d.fmtV || ((x) => num(x, 2));
    const items = d.items;
    const hasRange = items.some((x) => isFinite(x.min) && isFinite(x.max));
    const all = items.flatMap((x) => [x.value].concat(hasRange ? [x.min, x.max] : [])).filter(isFinite);
    const dom = niceDomain(Math.min(...all), Math.max(...all), 5, true);
    const labelW = Math.min(Math.max(...items.map((x) => measure(x.name, 13, 600)), 60) + 16, W * 0.36);
    const ROW = hasRange ? 40 : 34, BAR = 20, TOP = hasRange ? 30 : 8, AX = 26;
    const plotL = labelW + 8, plotR = W - 70;
    const xOf = (v) => plotL + (plotR - plotL) * (v - dom.lo) / (dom.hi - dom.lo);
    const H = TOP + items.length * ROW + AX;
    let s = open(W, H, theme, d.title || 'Nilai tiap alternatif');
    if (hasRange) s += legend([{ label: d.valueLabel || 'Nilai harapan', color: theme.brand }, { label: 'Rentang hasil (min–maks)', color: theme.ink2, shape: 'line' }], 4, 12, W - 8, theme).svg;
    for (const t of tickList(dom)) {
      s += line(xOf(t), TOP, xOf(t), H - AX + 2, Math.abs(t) < 1e-12 ? theme.axis : theme.grid, 1);
      s += text(xOf(t), H - AX + 14, fmtTick(t, dom), { anchor: 'middle', fill: theme.muted, size: 10.5, tabular: true });
    }
    const x0 = xOf(0);
    items.forEach((it, r) => {
      const y = TOP + r * ROW + (ROW - BAR) / 2;
      const best = d.best === r || (Array.isArray(d.best) && d.best.includes(r));
      const col = best ? theme.brand : mix(theme.brand, theme.surface, 0.45);
      s += `<g data-tip="${esc(`${it.name}\n${d.valueLabel || 'Nilai'}: ${fmtV(it.value)}${isFinite(it.min) ? `\nRentang: ${fmtV(it.min)} s.d. ${fmtV(it.max)}` : ''}`)}">`;
      s += `<rect x="0" y="${f(TOP + r * ROW)}" width="${f(W)}" height="${ROW}" fill="transparent"/>`;
      s += text(labelW, y + BAR / 2, ellipsize(it.name, labelW - 6, 13, best ? 700 : 500), { anchor: 'end', fill: theme.ink, size: 13, weight: best ? 700 : 500 });
      if (isFinite(it.value)) {
        const xv = xOf(it.value);
        s += `<rect x="${f(Math.min(x0, xv))}" y="${f(y)}" width="${f(Math.max(1, Math.abs(xv - x0)))}" height="${BAR}" rx="3" fill="${col}"/>`;
        if (hasRange && isFinite(it.min)) {
          const ym = y + BAR / 2;
          s += line(xOf(it.min), ym, xOf(it.max), ym, theme.ink2, 1.5);
          s += line(xOf(it.min), ym - 6, xOf(it.min), ym + 6, theme.ink2, 1.5) + line(xOf(it.max), ym - 6, xOf(it.max), ym + 6, theme.ink2, 1.5);
        }
        const tx = Math.max(xv, hasRange && isFinite(it.max) ? xOf(it.max) : xv, x0) + 8;
        s += text(tx, y + BAR / 2, fmtV(it.value), { fill: theme.ink, size: 12.5, weight: best ? 700 : 500, tabular: true });
      }
      s += '</g>';
    });
    return finish(s, W, H, { head: ['Alternatif', d.valueLabel || 'Nilai'].concat(hasRange ? ['Minimum', 'Maksimum'] : []), rows: items.map((x) => [x.name, fmtV(x.value)].concat(hasRange ? [fmtV(x.min), fmtV(x.max)] : [])) });
  }

  /* ------------------------------------------------------------------ *
   * 3. Profil risiko: distribusi peluang & kumulatif
   * ------------------------------------------------------------------ */

  function riskPmf(d, theme, opts) {
    // d: series [{name, k, points:[{x,p}]}], fmtV, fmtP
    opts = opts || {};
    const W = Math.max(340, opts.width || 680);
    const fmtV = d.fmtV || ((x) => num(x, 2)), fmtP = d.fmtP || ((p) => pct(p, 1));
    const leg = d.series.map((se) => ({ label: se.name, color: colorAt(theme, se.k), shape: 'dot' }));
    const legH = legendHeight(leg, W - 8) + 8;
    const allX = d.series.flatMap((se) => se.points.map((q) => q.x));
    const dom = niceDomain(Math.min(...allX), Math.max(...allX), 6, false);
    const pMax = Math.min(1, niceMax(Math.max(...d.series.flatMap((se) => se.points.map((q) => q.p))) * 1.1));
    const left = 50, right = 18, top = legH + 10, bottom = 44;
    const H = top + 230 + bottom;
    const plotW = W - left - right, plotH = H - top - bottom;
    const xOf = (v) => left + plotW * (v - dom.lo) / (dom.hi - dom.lo);
    const yOf = (p) => top + plotH - plotH * p / pMax;
    let s = open(W, H, theme, 'Profil risiko: distribusi peluang hasil');
    s += legend(leg, 4, 12, W - 8, theme).svg;
    for (const t of ticks(pMax, 4)) { s += line(left, yOf(t), left + plotW, yOf(t), theme.grid, 1); s += text(left - 8, yOf(t), pct(t, 0), { anchor: 'end', fill: theme.muted, size: 10.5, tabular: true }); }
    for (const t of tickList(dom)) s += text(xOf(t), top + plotH + 15, fmtTick(t, dom), { anchor: 'middle', fill: theme.muted, size: 10.5, tabular: true });
    s += line(left, top + plotH, left + plotW, top + plotH, theme.axis, 1);
    if (dom.lo < 0 && dom.hi > 0) s += line(xOf(0), top, xOf(0), top + plotH, theme.axis, 1, { 'stroke-dasharray': '4 3' });
    s += text(left + plotW / 2, H - 10, d.xLabel || 'Nilai hasil', { anchor: 'middle', fill: theme.ink2, size: 11.5, weight: 600 });
    const n = d.series.length;
    d.series.forEach((se, si) => {
      const off = (si - (n - 1) / 2) * 7;
      const col = colorAt(theme, se.k);
      for (const q of se.points) {
        const x = xOf(q.x) + off;
        s += line(x, yOf(0), x, yOf(q.p), col, 3, { 'stroke-linecap': 'round' });
        s += `<circle cx="${f(x)}" cy="${f(yOf(q.p))}" r="5" fill="${col}" stroke="${theme.surface}" stroke-width="1.5" data-tip="${esc(`${se.name}\nHasil ${fmtV(q.x)}: peluang ${fmtP(q.p)}`)}"/>`;
      }
    });
    const rows = [];
    d.series.forEach((se) => se.points.forEach((q) => rows.push([se.name, fmtV(q.x), fmtP(q.p), fmtP(q.cum)])));
    return finish(s, W, H, { head: ['Alternatif', 'Hasil', 'Peluang', 'Kumulatif'], rows });
  }

  function riskCdf(d, theme, opts) {
    opts = opts || {};
    const W = Math.max(340, opts.width || 680);
    const fmtV = d.fmtV || ((x) => num(x, 2)), fmtP = d.fmtP || ((p) => pct(p, 1));
    const leg = d.series.map((se) => ({ label: se.name, color: colorAt(theme, se.k), shape: 'line' }));
    const legH = legendHeight(leg, W - 8) + 8;
    const allX = d.series.flatMap((se) => se.points.map((q) => q.x));
    const dom0 = niceDomain(Math.min(...allX), Math.max(...allX), 6, false);
    const pad = (dom0.hi - dom0.lo) * 0.04;
    const dom = { lo: dom0.lo - pad, hi: dom0.hi + pad, step: dom0.step };
    const left = 50, right = 18, top = legH + 10, bottom = 44;
    const H = top + 230 + bottom;
    const plotW = W - left - right, plotH = H - top - bottom;
    const xOf = (v) => left + plotW * (v - dom.lo) / (dom.hi - dom.lo);
    const yOf = (p) => top + plotH - plotH * p;
    let s = open(W, H, theme, 'Profil risiko kumulatif');
    s += legend(leg, 4, 12, W - 8, theme).svg;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) { s += line(left, yOf(t), left + plotW, yOf(t), theme.grid, 1); s += text(left - 8, yOf(t), pct(t, 0), { anchor: 'end', fill: theme.muted, size: 10.5, tabular: true }); }
    for (const t of tickList(dom0)) s += text(xOf(t), top + plotH + 15, fmtTick(t, dom0), { anchor: 'middle', fill: theme.muted, size: 10.5, tabular: true });
    s += line(left, top + plotH, left + plotW, top + plotH, theme.axis, 1);
    s += text(left + plotW / 2, H - 10, d.xLabel || 'Nilai hasil', { anchor: 'middle', fill: theme.ink2, size: 11.5, weight: 600 });
    s += text(14, top + plotH / 2, 'P(hasil ≤ x)', { anchor: 'middle', fill: theme.ink2, size: 11, weight: 600, transform: `rotate(-90 14 ${f(top + plotH / 2)})` });
    d.series.forEach((se, si) => {
      const col = colorAt(theme, se.k);
      let path = `M${f(xOf(dom.lo))},${f(yOf(0))}`;
      let prev = 0;
      for (const q of se.points) { path += `H${f(xOf(q.x))}V${f(yOf(q.cum))}`; prev = q.cum; }
      path += `H${f(xOf(dom.hi))}`;
      s += `<path d="${path}" fill="none" stroke="${col}" stroke-width="2.4" stroke-dasharray="${si % 2 ? '7 4' : 'none'}" stroke-linejoin="round"/>`;
      for (const q of se.points) s += `<circle cx="${f(xOf(q.x))}" cy="${f(yOf(q.cum))}" r="3.5" fill="${col}" data-tip="${esc(`${se.name}\nP(hasil ≤ ${fmtV(q.x)}) = ${fmtP(q.cum)}`)}"/>`;
      void prev;
    });
    const rows = [];
    d.series.forEach((se) => se.points.forEach((q) => rows.push([se.name, fmtV(q.x), fmtP(q.cum)])));
    return finish(s, W, H, { head: ['Alternatif', 'Hasil x', 'P(hasil ≤ x)'], rows });
  }

  /* ------------------------------------------------------------------ *
   * 4. Sensitivitas satu arah
   * ------------------------------------------------------------------ */

  function oneWayChart(d, theme, opts) {
    // d: xs, series[k][], names[], breaks[{x,from,to,value}], x0, xLabel, fmtX, fmtV, bestEnvelope
    opts = opts || {};
    const W = Math.max(340, opts.width || 720);
    const fmtV = d.fmtV || ((x) => num(x, 2)), fmtX = d.fmtX || ((x) => num(x, 2));
    const leg = d.names.map((nm, k) => ({ label: nm, color: colorAt(theme, k), shape: 'line' }));
    const legH = legendHeight(leg, W - 8) + 8;
    const all = d.series.flat().filter(isFinite);
    const dom = niceDomain(Math.min(...all), Math.max(...all), 5, false);
    const left = 62, right = 20, top = legH + 26, bottom = 46;
    const H = top + 250 + bottom;
    const plotW = W - left - right, plotH = H - top - bottom;
    const x0d = d.xs[0], x1d = d.xs[d.xs.length - 1];
    const xOf = (x) => left + plotW * (x - x0d) / ((x1d - x0d) || 1);
    const yOf = (v) => top + plotH - plotH * (v - dom.lo) / (dom.hi - dom.lo);
    let s = open(W, H, theme, `Sensitivitas terhadap ${d.xLabel}`);
    s += legend(leg, 4, 12, W - 8, theme).svg;
    for (const t of tickList(dom)) { s += line(left, yOf(t), left + plotW, yOf(t), Math.abs(t) < 1e-12 ? theme.axis : theme.grid, 1); s += text(left - 8, yOf(t), fmtTick(t, dom), { anchor: 'end', fill: theme.muted, size: 10.5, tabular: true }); }
    for (let i = 0; i <= 5; i++) { const x = x0d + (x1d - x0d) * i / 5; s += text(xOf(x), top + plotH + 15, fmtX(x), { anchor: 'middle', fill: theme.muted, size: 10.5, tabular: true }); }
    s += line(left, top + plotH, left + plotW, top + plotH, theme.axis, 1);
    s += text(left + plotW / 2, H - 10, d.xLabel, { anchor: 'middle', fill: theme.ink2, size: 11.5, weight: 600 });
    s += text(14, top + plotH / 2, d.yLabel || 'Nilai harapan', { anchor: 'middle', fill: theme.ink2, size: 11.5, weight: 600, transform: `rotate(-90 14 ${f(top + plotH / 2)})` });
    // warnai latar menurut alternatif terbaik
    if (d.best) {
      let start = 0;
      for (let i = 1; i <= d.xs.length; i++) {
        if (i === d.xs.length || d.best[i] !== d.best[start]) {
          const a = start === 0 ? x0d : (d.xs[start - 1] + d.xs[start]) / 2;
          const b = i === d.xs.length ? x1d : (d.xs[i - 1] + d.xs[i]) / 2;
          if (d.best[start] !== null) s += `<rect x="${f(xOf(a))}" y="${f(top)}" width="${f(Math.max(0, xOf(b) - xOf(a)))}" height="${f(plotH)}" fill="${colorAt(theme, d.best[start])}" opacity="0.07"/>`;
          start = i;
        }
      }
    }
    d.series.forEach((vals, k) => {
      const pts = d.xs.map((x, i) => (isFinite(vals[i]) ? f(xOf(x)) + ',' + f(yOf(vals[i])) : null)).filter(Boolean).join(' ');
      s += `<polyline points="${pts}" fill="none" stroke="${colorAt(theme, k)}" stroke-width="2.3" stroke-linejoin="round"/>`;
    });
    if (isFinite(d.x0)) {
      s += line(xOf(d.x0), top - 6, xOf(d.x0), top + plotH, theme.ink, 1.5);
      s += text(Math.min(Math.max(xOf(d.x0), left + 70), left + plotW - 70), top - 14, `nilai saat ini ${fmtX(d.x0)}`, { anchor: 'middle', fill: theme.ink, size: 11, weight: 600 });
    }
    for (const b of d.breaks || []) {
      if (!isFinite(b.value)) continue;
      s += `<circle cx="${f(xOf(b.x))}" cy="${f(yOf(b.value))}" r="5" fill="${theme.surface}" stroke="${theme.ink}" stroke-width="1.8" data-tip="${esc(`Titik impas: ${fmtX(b.x)}\nKeputusan terbaik berganti dari ${d.names[b.from]} ke ${d.names[b.to]}`)}"/>`;
    }
    const rows = [];
    const stepI = Math.max(1, Math.round((d.xs.length - 1) / 10));
    for (let i = 0; i < d.xs.length; i += stepI) rows.push([fmtX(d.xs[i])].concat(d.series.map((v) => fmtV(v[i])), [d.best && d.best[i] !== null ? d.names[d.best[i]] : '–']));
    return finish(s, W, H, { head: [d.xLabel].concat(d.names, ['Terbaik']), rows }, { left, top, plotW, plotH, x0d, x1d });
  }

  /* ------------------------------------------------------------------ *
   * 5. Tornado
   * ------------------------------------------------------------------ */

  function tornadoChart(d, theme, opts) {
    // d: rows [{label, vLo, vHi, loText, hiText, changes}], base, fmtV
    opts = opts || {};
    const W = Math.max(360, opts.width || 760);
    const fmtV = d.fmtV || ((x) => num(x, 2));
    const rows = d.rows.slice(0, opts.max || 15);
    const cLo = colorAt(theme, 1), cHi = colorAt(theme, 0);
    const leg = [{ label: 'Parameter di nilai rendah', color: cLo }, { label: 'Parameter di nilai tinggi', color: cHi }];
    const legH = legendHeight(leg, W - 8) + 8;
    const labelW = Math.min(Math.max(...rows.map((r) => measure(r.label, 12)), 80) + 14, W * 0.42);
    const ROW = 30, BAR = 18, TOP = legH + 22, AX = 26;
    const all = rows.flatMap((r) => [r.vLo, r.vHi]).concat([d.base]).filter(isFinite);
    const dom = niceDomain(Math.min(...all), Math.max(...all), 5, false);
    const plotL = labelW + 6, plotR = W - 16;
    const xOf = (v) => plotL + (plotR - plotL) * (v - dom.lo) / (dom.hi - dom.lo);
    const H = TOP + rows.length * ROW + AX;
    let s = open(W, H, theme, 'Diagram tornado');
    s += legend(leg, 4, 12, W - 8, theme).svg;
    for (const t of tickList(dom)) { s += line(xOf(t), TOP - 4, xOf(t), H - AX + 2, theme.grid, 1); s += text(xOf(t), H - AX + 14, fmtTick(t, dom), { anchor: 'middle', fill: theme.muted, size: 10.5, tabular: true }); }
    const xb = xOf(d.base);
    s += text(xb, TOP - 12, `nilai dasar ${fmtV(d.base)}`, { anchor: 'middle', fill: theme.ink, size: 11, weight: 600 });
    rows.forEach((r, i) => {
      const y = TOP + i * ROW + (ROW - BAR) / 2;
      s += `<g data-tip="${esc(`${r.label}\nRendah ${r.loText}: ${fmtV(r.vLo)}\nTinggi ${r.hiText}: ${fmtV(r.vHi)}\nSelisih: ${fmtV(Math.abs(r.vHi - r.vLo))}${r.changes ? '\nKeputusan terbaik berubah dalam rentang ini' : ''}`)}">`;
      s += `<rect x="0" y="${f(TOP + i * ROW)}" width="${f(W)}" height="${ROW}" fill="transparent"/>`;
      s += text(labelW, y + BAR / 2, ellipsize(r.label, labelW - 6, 12, r.changes ? 700 : 400), { anchor: 'end', fill: theme.ink, size: 12, weight: r.changes ? 700 : 400 });
      for (const [v, col] of [[r.vLo, cLo], [r.vHi, cHi]]) {
        if (!isFinite(v)) continue;
        const xv = xOf(v);
        s += `<rect x="${f(Math.min(xb, xv))}" y="${f(y)}" width="${f(Math.max(1, Math.abs(xv - xb)))}" height="${BAR}" fill="${col}" opacity="0.9"/>`;
      }
      if (r.changes) s += `<circle cx="${f(W - 10)}" cy="${f(y + BAR / 2)}" r="4" fill="${theme.critical}"/>`;
      s += '</g>';
    });
    s += line(xb, TOP - 4, xb, H - AX + 2, theme.ink, 1.5);
    return finish(s, W, H, { head: ['Parameter', 'Rendah', 'Nilai (rendah)', 'Tinggi', 'Nilai (tinggi)', 'Selisih'], rows: rows.map((r) => [r.label, r.loText, fmtV(r.vLo), r.hiText, fmtV(r.vHi), fmtV(Math.abs(r.vHi - r.vLo))]) });
  }

  /* ------------------------------------------------------------------ *
   * 6. Spider
   * ------------------------------------------------------------------ */

  function spiderChart(d, theme, opts) {
    // d: ts (perubahan relatif), lines [{label, values}], base, fmtV
    opts = opts || {};
    const W = Math.max(340, opts.width || 720);
    const fmtV = d.fmtV || ((x) => num(x, 2));
    const lines = d.lines.slice(0, 8);
    const leg = lines.map((l, k) => ({ label: l.label, color: colorAt(theme, k), shape: 'line' }));
    const legH = legendHeight(leg, W - 8) + 8;
    const all = lines.flatMap((l) => l.values).filter(isFinite).concat([d.base]);
    const dom = niceDomain(Math.min(...all), Math.max(...all), 5, false);
    const left = 62, right = 20, top = legH + 12, bottom = 46;
    const H = top + 250 + bottom;
    const plotW = W - left - right, plotH = H - top - bottom;
    const t0 = d.ts[0], t1 = d.ts[d.ts.length - 1];
    const xOf = (t) => left + plotW * (t - t0) / (t1 - t0);
    const yOf = (v) => top + plotH - plotH * (v - dom.lo) / (dom.hi - dom.lo);
    let s = open(W, H, theme, 'Diagram spider');
    s += legend(leg, 4, 12, W - 8, theme).svg;
    for (const t of tickList(dom)) { s += line(left, yOf(t), left + plotW, yOf(t), theme.grid, 1); s += text(left - 8, yOf(t), fmtTick(t, dom), { anchor: 'end', fill: theme.muted, size: 10.5, tabular: true }); }
    d.ts.forEach((t, i) => { if (i % 2 === 0) s += text(xOf(t), top + plotH + 15, (t > 0 ? '+' : '') + pct(t, 0), { anchor: 'middle', fill: theme.muted, size: 10.5, tabular: true }); });
    s += line(xOf(0), top, xOf(0), top + plotH, theme.axis, 1.5);
    s += line(left, top + plotH, left + plotW, top + plotH, theme.axis, 1);
    s += text(left + plotW / 2, H - 10, 'Perubahan parameter dari nilai dasar', { anchor: 'middle', fill: theme.ink2, size: 11.5, weight: 600 });
    s += text(14, top + plotH / 2, d.yLabel || 'Nilai harapan', { anchor: 'middle', fill: theme.ink2, size: 11.5, weight: 600, transform: `rotate(-90 14 ${f(top + plotH / 2)})` });
    lines.forEach((l, k) => {
      const pts = d.ts.map((t, i) => (isFinite(l.values[i]) ? f(xOf(t)) + ',' + f(yOf(l.values[i])) : null)).filter(Boolean).join(' ');
      s += `<polyline points="${pts}" fill="none" stroke="${colorAt(theme, k)}" stroke-width="2.2" stroke-linejoin="round"/>`;
      d.ts.forEach((t, i) => { if (isFinite(l.values[i])) s += `<circle cx="${f(xOf(t))}" cy="${f(yOf(l.values[i]))}" r="3" fill="${colorAt(theme, k)}" data-tip="${esc(`${l.label} ${(t > 0 ? '+' : '') + pct(t, 0)}: ${fmtV(l.values[i])}`)}"/>`; });
    });
    return finish(s, W, H, { head: ['Perubahan'].concat(lines.map((l) => l.label)), rows: d.ts.map((t, i) => [(t > 0 ? '+' : '') + pct(t, 0)].concat(lines.map((l) => fmtV(l.values[i])))) });
  }

  /* ------------------------------------------------------------------ *
   * 7. Sensitivitas dua arah (wilayah strategi)
   * ------------------------------------------------------------------ */

  function strategyRegion(d, theme, opts) {
    // d: xs, ys, grid[y][x] {best,value}|null, names, xLabel, yLabel, fmtX, fmtY, x0, y0
    opts = opts || {};
    const W = Math.max(340, Math.min(opts.width || 640, 720));
    const fmtX = d.fmtX || ((x) => num(x, 2)), fmtY = d.fmtY || ((x) => num(x, 2));
    const used = Array.from(new Set(d.grid.flat().filter(Boolean).map((c) => c.best))).sort((a, b) => a - b);
    const leg = used.map((k) => ({ label: d.names[k], color: colorAt(theme, k) }));
    const legH = legendHeight(leg, W - 8) + 8;
    const left = 70, right = 16, top = legH + 10, bottom = 48;
    const plotW = W - left - right;
    const plotH = Math.min(plotW * 0.75, 380);
    const H = top + plotH + bottom;
    const nx = d.xs.length, ny = d.ys.length;
    const cw = plotW / nx, chh = plotH / ny;
    let s = open(W, H, theme, 'Wilayah strategi dua arah');
    s += legend(leg, 4, 12, W - 8, theme).svg;
    d.grid.forEach((row, yi) => row.forEach((c, xi) => {
      const x = left + xi * cw, y = top + plotH - (yi + 1) * chh;
      const col = c ? colorAt(theme, c.best) : theme.grid;
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(cw + 0.6)}" height="${f(chh + 0.6)}" fill="${col}" opacity="${c ? 0.78 : 0.4}"${c ? ` data-tip="${esc(`${d.xLabel}: ${fmtX(d.xs[xi])}\n${d.yLabel}: ${fmtY(d.ys[yi])}\nTerbaik: ${d.names[c.best]}`)}"` : ''}/>`;
    }));
    s += `<rect x="${left}" y="${top}" width="${f(plotW)}" height="${f(plotH)}" fill="none" stroke="${theme.axis}"/>`;
    for (let i = 0; i <= 4; i++) {
      const xv = d.xs[0] + (d.xs[nx - 1] - d.xs[0]) * i / 4, yv = d.ys[0] + (d.ys[ny - 1] - d.ys[0]) * i / 4;
      s += text(left + (cw / 2) + (plotW - cw) * i / 4, top + plotH + 15, fmtX(xv), { anchor: 'middle', fill: theme.muted, size: 10.5, tabular: true });
      s += text(left - 8, top + plotH - chh / 2 - (plotH - chh) * i / 4, fmtY(yv), { anchor: 'end', fill: theme.muted, size: 10.5, tabular: true });
    }
    if (isFinite(d.x0) && isFinite(d.y0)) {
      const fx = (d.x0 - d.xs[0]) / ((d.xs[nx - 1] - d.xs[0]) || 1), fy = (d.y0 - d.ys[0]) / ((d.ys[ny - 1] - d.ys[0]) || 1);
      const px = left + cw / 2 + (plotW - cw) * fx, py = top + plotH - chh / 2 - (plotH - chh) * fy;
      s += `<circle cx="${f(px)}" cy="${f(py)}" r="6" fill="${theme.surface}" stroke="${theme.ink}" stroke-width="2"/>`;
      s += text(px + 9, py - 9, 'saat ini', { fill: theme.ink, size: 11, weight: 700 });
    }
    s += text(left + plotW / 2, H - 10, d.xLabel, { anchor: 'middle', fill: theme.ink2, size: 11.5, weight: 600 });
    s += text(14, top + plotH / 2, ellipsize(d.yLabel, plotH, 11.5, 600), { anchor: 'middle', fill: theme.ink2, size: 11.5, weight: 600, transform: `rotate(-90 14 ${f(top + plotH / 2)})` });
    const rows = [];
    const st = Math.max(1, Math.round((ny - 1) / 6)), sx = Math.max(1, Math.round((nx - 1) / 6));
    for (let yi = 0; yi < ny; yi += st) rows.push([fmtY(d.ys[yi])].concat(d.xs.filter((_, xi) => xi % sx === 0).map((_, j) => { const c = d.grid[yi][j * sx]; return c ? d.names[c.best] : '–'; })));
    return finish(s, W, H, { head: [d.yLabel + ' \\ ' + d.xLabel].concat(d.xs.filter((_, xi) => xi % sx === 0).map(fmtX)), rows });
  }

  /* ------------------------------------------------------------------ *
   * 8. Tabel payoff: batang berkelompok per alternatif
   * ------------------------------------------------------------------ */

  function payoffBars(d, theme, opts) {
    // d: alts [names], states [names], M, fmtV
    opts = opts || {};
    const W = Math.max(340, opts.width || 680);
    const fmtV = d.fmtV || ((x) => num(x, 2));
    const leg = d.states.map((nm, j) => ({ label: nm, color: colorAt(theme, j) }));
    const legH = legendHeight(leg, W - 8) + 8;
    const n = d.states.length;
    const BAR = Math.max(10, Math.min(18, 54 / n)), GAP = 3;
    const GROUP = n * (BAR + GAP) + 14;
    const all = d.M.flat().filter(isFinite);
    const dom = niceDomain(Math.min(...all), Math.max(...all), 5, true);
    const labelW = Math.min(Math.max(...d.alts.map((x) => measure(x, 12.5, 600)), 60) + 14, W * 0.32);
    const negW = Math.max(0, ...all.filter((v) => v < 0).map((v) => measure(fmtV(v), 10.5) + 8));
    const posW = Math.max(24, ...all.filter((v) => v >= 0).map((v) => measure(fmtV(v), 10.5) + 10));
    const plotL = labelW + 6 + negW, plotR = W - posW;
    const xOf = (v) => plotL + (plotR - plotL) * (v - dom.lo) / (dom.hi - dom.lo);
    const TOP = legH + 6, AX = 24;
    const H = TOP + d.alts.length * GROUP + AX;
    let s = open(W, H, theme, 'Payoff tiap alternatif per kondisi');
    s += legend(leg, 4, 12, W - 8, theme).svg;
    for (const t of tickList(dom)) { s += line(xOf(t), TOP, xOf(t), H - AX, Math.abs(t) < 1e-12 ? theme.axis : theme.grid, 1); s += text(xOf(t), H - AX + 13, fmtTick(t, dom), { anchor: 'middle', fill: theme.muted, size: 10.5, tabular: true }); }
    const x0 = xOf(0);
    d.alts.forEach((a, i) => {
      const gy = TOP + i * GROUP + 7;
      s += text(labelW, gy + (n * (BAR + GAP)) / 2, ellipsize(a, labelW - 6, 12.5, 600), { anchor: 'end', fill: theme.ink, size: 12.5, weight: 600 });
      d.states.forEach((st, j) => {
        const v = d.M[i][j];
        if (!isFinite(v)) return;
        const y = gy + j * (BAR + GAP);
        const xv = xOf(v);
        s += `<rect x="${f(Math.min(x0, xv))}" y="${f(y)}" width="${f(Math.max(1, Math.abs(xv - x0)))}" height="${f(BAR)}" rx="2" fill="${colorAt(theme, j)}" data-tip="${esc(`${a} | ${st}: ${fmtV(v)}`)}"/>`;
        s += text(v >= 0 ? xv + 5 : xv - 5, y + BAR / 2, fmtV(v), { anchor: v >= 0 ? 'start' : 'end', fill: theme.ink2, size: 10.5, tabular: true });
      });
    });
    return finish(s, W, H, { head: ['Alternatif'].concat(d.states), rows: d.alts.map((a, i) => [a].concat(d.M[i].map(fmtV))) });
  }

  return {
    THEMES, FONT, NODE_COLORS, setLocale, num, numTrim, pct, colorAt, esc, mix, measure, ellipsize, wrap, niceMax, niceDomain,
    treeDiagram, valueBars, riskPmf, riskCdf, oneWayChart, tornadoChart, spiderChart, strategyRegion, payoffBars
  };
}));
