/*!
 * Decision Tree Calculator — antarmuka
 * (c) 2026 Alfredo Garcia — MIT License
 */
(function () {
  'use strict';

  const D = window.DTCore, M = window.DTModel, C = window.DTCharts, X = window.DTExport;

  const STEPS = [
    { id: 'model', label: 'Model' },
    { id: 'results', label: 'Hasil' },
    { id: 'sens', label: 'Sensitivitas' },
    { id: 'voi', label: 'Nilai informasi' },
    { id: 'report', label: 'Laporan & unduh' }
  ];

  const S = {
    p: null, rev: 0, compCache: null, extraCache: null,
    ui: { step: 'model', sensTab: 'one', one: null, two: null, selected: null, showVars: false },
    chartDefs: {}, charts: {}, focusKey: null, shareLink: ''
  };

  /* ================================================================== *
   * Utilitas
   * ================================================================== */

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = C.esc;

  const ICON = {
    plus: 'M12 5v14M5 12h14',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    copy: 'M8 8h11v11H8zM5 16V5h11',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
    table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
    x: 'M6 6l12 12M18 6 6 18',
    check: 'M5 12.5l4.5 4.5L19 7',
    alert: 'M12 8v5M12 16.5h.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    file: 'M6 3h8l4 4v14H6zM14 3v4h4',
    doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
    folder: 'M3 6h6l2 2h10v11H3z',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    arrowR: 'M5 12h14M13 6l6 6-6 6',
    arrowL: 'M19 12H5M11 6l-6 6 6 6',
    tree: 'M5 12h4M9 12l5-6h5M9 12l5 6h5M3 10h4v4H3z',
    clip: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5',
    fx: 'M10 5H8a2 2 0 0 0-2 2v12M4 11h6M14 9l6 8M20 9l-6 8'
  };
  const icon = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICON[name]}"/></svg>`;

  const dec = () => S.p.settings.decimals;
  const fmtV = (x) => C.num(x, dec());
  const unitTxt = () => (S.p.settings.unit ? ' ' + S.p.settings.unit : '');
  const money = (x) => fmtV(x) + unitTxt();
  const pctMode = () => S.p.settings.probFormat === 'percent';
  const fmtP = (p) => (!isFinite(p) ? '–' : pctMode() ? C.numTrim(p * 100, 2) + '%' : C.numTrim(p, 4));
  /** Nilai mentah untuk ditampilkan di kolom isian (tanpa pemisah ribuan). */
  function rawNum(v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    const s = String(+Number(v).toPrecision(12));
    return S.p.settings.decimalSep === ',' ? s.replace('.', ',') : s;
  }
  function theme() { return C.THEMES.light; }
  function today() { try { return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  const maximize = () => S.p.settings.objective !== 'min';
  const valueWord = () => (comp().res && comp().res.utility && comp().res.utility.active ? 'CE' : (maximize() ? 'Nilai harapan' : 'Biaya harapan'));

  /* ================================================================== *
   * State & perhitungan
   * ================================================================== */

  let saveTimer = null;
  function touch(rerender) {
    S.rev++;
    S.compCache = null;
    S.extraCache = null;
    S.shareLink = '';
    scheduleSave();
    if (rerender) render();
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); }
  function saveNow() {
    clearTimeout(saveTimer);
    S.p.meta.updatedAt = new Date().toISOString();
    const ok = M.saveLocal(S.p);
    const el = $('#save-state');
    if (el) el.textContent = ok ? 'Tersimpan otomatis di browser ini' : 'Penyimpanan browser penuh — unduh proyek (.json)';
  }
  function comp() {
    if (!S.compCache) S.compCache = M.compute(S.p);
    return S.compCache;
  }
  function evalOpts() {
    const p = S.p;
    return { scope: D.makeScope(p.variables, p.settings.decimalSep), sep: p.settings.decimalSep, probPercent: pctMode(), objective: p.settings.objective, risk: M.riskOf(p) };
  }
  /** Data berat (parameter, EVPI, tornado) dihitung sekali per revisi. */
  function extras() {
    if (!S.extraCache) S.extraCache = {};
    return S.extraCache;
  }
  function params() {
    const ex = extras();
    if (!ex.params) ex.params = M.parameters(S.p);
    return ex.params;
  }
  function evaluator() {
    const ex = extras();
    if (!ex.ev) ex.ev = M.evaluator(S.p);
    return ex.ev;
  }
  function tornadoData() {
    const ex = extras();
    // Nilai dasar 0 tidak bisa digeser ±% secara bermakna; parameter itu tetap tersedia di analisis satu/dua arah.
    if (!ex.tornado) ex.tornado = D.tornado(evaluator(), params().filter((x) => !(x.kind === 'value' && Math.abs(x.base) < D.EPS)), { pct: S.p.settings.sens.pct / 100, probDelta: S.p.settings.sens.probDelta / 100 });
    return ex.tornado;
  }
  function evpiData() {
    const ex = extras();
    if (!ex.evpi) {
      const c = comp();
      const tree = S.p.mode === 'table' ? c.tree : S.p.tree;
      const opts = S.p.mode === 'table' ? { sep: S.p.settings.decimalSep, objective: S.p.settings.objective, risk: M.riskOf(S.p) } : evalOpts();
      const groups = D.eventGroups(tree);
      const per = groups.map((g) => ({ g, r: D.evpi(tree, opts, [g]) }));
      const allConsistent = per.every((x) => x.r && x.r.consistent);
      const total = groups.length > 1 && allConsistent ? D.evpi(tree, opts, groups) : null;
      ex.evpi = { groups: per, total, allConsistent };
    }
    return ex.evpi;
  }

  /* ================================================================== *
   * Toast, modal, tooltip
   * ================================================================== */

  function toast(msg, kind, action) {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || 'info');
    t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    t.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.className = 'toast-act';
      b.textContent = action.label;
      b.addEventListener('click', () => { action.run(); t.remove(); });
      t.appendChild(b);
    }
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), action ? 8000 : 4200);
    setTimeout(() => t.remove(), action ? 8400 : 4600);
  }

  let lastFocus = null, pendingConfirm = null;
  function openModal(html, opts) {
    if (pendingConfirm) { const r = pendingConfirm; pendingConfirm = null; r(false); }
    const m = $('#modal');
    lastFocus = document.activeElement;
    $('#modal-body').innerHTML = html;
    $('#modal-card').className = 'modal-card' + (opts && opts.wide ? ' wide' : '');
    m.hidden = false;
    requestAnimationFrame(() => {
      m.classList.add('open');
      const first = $('#modal-body [autofocus]') || $('#modal-body button, #modal-body input, #modal-body select, #modal-body textarea, #modal-body a') || $('#modal-close');
      if (first) first.focus();
    });
  }
  function closeModal(answer) {
    const m = $('#modal');
    m.classList.remove('open');
    m.hidden = true;
    $('#modal-body').innerHTML = '';
    if (pendingConfirm) { const r = pendingConfirm; pendingConfirm = null; r(answer === true); }
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
  }
  function confirmBox(message, okLabel, danger) {
    return new Promise((resolve) => {
      openModal(`<h2 class="modal-title">Konfirmasi</h2><p class="modal-text">${esc(message)}</p>
        <div class="modal-actions"><button class="btn" data-act="confirm-no">Batal</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirm-yes" autofocus>${esc(okLabel || 'Lanjutkan')}</button></div>`);
      pendingConfirm = resolve;
    });
  }
  function placeTip(tip, x, y) {
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }
  function showTip(target, x, y) { const tip = $('#tip'); tip.textContent = target.getAttribute('data-tip'); tip.hidden = false; placeTip(tip, x, y); }
  function hideTip() { $('#tip').hidden = true; }

  /* ================================================================== *
   * Render utama
   * ================================================================== */

  function render() {
    const active = document.activeElement;
    const fk = S.focusKey || (active && active.dataset ? active.dataset.fk : null);
    const sel = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    S.focusKey = null;
    S.chartDefs = {};
    renderChrome();
    const main = $('#main');
    main.dataset.step = S.ui.step;
    main.innerHTML = renderStep();
    const idx = STEPS.findIndex((s) => s.id === S.ui.step);
    const h1 = $('.page-head h1', main);
    if (h1 && idx >= 0) h1.insertAdjacentHTML('afterbegin', `<span class="step-badge" aria-hidden="true">${idx + 1}</span>`);
    mountCharts(main);
    if (S.ui.step === 'model') paintLive();
    if (fk) {
      const el = $(`[data-fk="${CSS.escape(fk)}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        if (sel && typeof el.setSelectionRange === 'function' && el === document.activeElement) {
          try { el.setSelectionRange(Math.min(sel[0], el.value.length), Math.min(sel[1], el.value.length)); } catch (e) { /* tanpa seleksi */ }
        }
      }
    }
  }

  function renderChrome() {
    const title = $('#project-title');
    if (document.activeElement !== title) title.value = S.p.meta.title;
    document.title = (S.p.meta.title ? S.p.meta.title + ' — ' : '') + 'Kalkulator Decision Tree';
    const c = comp();
    $('#steps').innerHTML = '<ol>' + STEPS.map((s, i) => {
      const warn = s.id === 'model' && !c.ok ? ' has-warn' : '';
      return `<li><button class="step${S.ui.step === s.id ? ' on' : ''}${warn}" data-act="goto" data-step="${s.id}" ${S.ui.step === s.id ? 'aria-current="step"' : ''}><span class="step-no">${i + 1}</span><span class="step-label">${s.label}</span></button></li>`;
    }).join('') + '</ol>';
  }

  function renderStep() {
    switch (S.ui.step) {
      case 'results': return renderResults();
      case 'sens': return renderSens();
      case 'voi': return renderVoi();
      case 'report': return renderReport();
      default: return renderModel();
    }
  }

  /* ================================================================== *
   * Diagram (kartu)
   * ================================================================== */

  function chartCard(id, title, desc, build, opts) {
    opts = opts || {};
    S.chartDefs[id] = { build, title, file: opts.file || id, scroll: !!opts.scroll };
    return `<figure class="chart-card${opts.wide ? ' wide' : ''}${opts.plain ? ' plain' : ''}" data-chart="${id}">
      <figcaption>
        <div class="chart-cap"><h3>${esc(title)}</h3>${desc ? `<p>${desc}</p>` : ''}</div>
        <div class="chart-tools">
          <button class="btn ghost sm" data-act="chart-png" data-id="${id}" title="Unduh gambar PNG">${icon('download')}PNG</button>
          <button class="btn ghost sm" data-act="chart-svg" data-id="${id}" title="Unduh gambar vektor SVG">SVG</button>
          <button class="btn ghost sm" data-act="chart-table" data-id="${id}" aria-expanded="false">${icon('table')}Tabel</button>
        </div>
      </figcaption>
      <div class="chart-svg${opts.scroll ? ' scroll' : ''}" data-svg="${id}"></div>
      <div class="chart-table" hidden></div>
    </figure>`;
  }
  function tableHTML(t) {
    if (!t) return '';
    return `<div class="table-wrap"><table class="data"><thead><tr>${t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td class="num">${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function mountCharts(root) { $$('[data-chart]', root).forEach((fig) => mountChart(fig)); }
  function mountChart(fig) {
    const id = fig.dataset.chart;
    const def = S.chartDefs[id];
    if (!def) return;
    const box = fig.querySelector('.chart-svg');
    const width = Math.max(300, Math.floor(box.clientWidth || fig.clientWidth || 640));
    let ch = null;
    try { ch = def.build(width, theme()); } catch (e) { console.error(e); }
    if (!ch) { box.innerHTML = '<p class="empty">Belum ada data untuk diagram ini.</p>'; delete S.charts[id]; return; }
    S.charts[id] = ch;
    const sl = box.scrollLeft;
    box.innerHTML = ch.svg;
    box.scrollLeft = sl;
    if (def.scroll && ch.width > width) {
      const svg = box.querySelector('svg');
      if (width / ch.width >= 0.75) { svg.style.maxWidth = '100%'; svg.style.width = '100%'; }
    }
    const tbl = fig.querySelector('.chart-table');
    if (!tbl.hidden) tbl.innerHTML = tableHTML(ch.table);
  }
  async function exportChart(id, kind) {
    const def = S.chartDefs[id];
    if (!def) return;
    const box = $(`[data-svg="${id}"]`);
    const ch = def.build(Math.max(760, box ? box.clientWidth : 760), C.THEMES.light);
    if (!ch) return;
    const name = X.safeFileName(S.p.meta.title + '-' + def.file);
    if (kind === 'svg') { X.download(name + '.svg', ch.svg, 'image/svg+xml'); return; }
    try { const png = await X.svgToPng(ch.svg, ch.width, ch.height, 2); X.download(name + '.png', png.blob); } catch (e) { toast(e.message, 'error'); }
  }

  /* --- pembangun diagram (dipakai layar & laporan) --- */

  function rootItems(c) {
    const rv = D.rootValues(c.res);
    const r = c.res.root;
    return rv.names.map((nm, i) => {
      const node = r.type === 'decision' ? r.branches[i].child : r;
      return { name: nm, value: rv.values[i], ev: rv.ev[i], min: node.min, max: node.max };
    });
  }
  function profiles(c) {
    const rv = D.rootValues(c.res);
    const r = c.res.root;
    return rv.names.map((nm, k) => Object.assign({ name: nm, k }, D.riskProfile(c.res, r.type === 'decision' ? k : null)));
  }

  const CH = {
    tree: (sel) => (W, t) => {
      const c = comp();
      if (!c.res) return null;
      return C.treeDiagram({ root: c.res.root, fmtV, fmtP, selected: sel, utility: c.res.utility.active }, t, { minWidth: 0 });
    },
    values: (W, t) => {
      const c = comp();
      if (!c.ok) return null;
      const rv = D.rootValues(c.res);
      return C.valueBars({ items: rootItems(c), best: rv.ties, fmtV, valueLabel: c.res.utility.active ? 'Certainty equivalent' : (maximize() ? 'Nilai harapan' : 'Biaya harapan'), title: 'Nilai tiap alternatif' }, t, { width: W });
    },
    pmf: (W, t) => {
      const c = comp();
      if (!c.ok) return null;
      return C.riskPmf({ series: profiles(c), fmtV, fmtP: (p) => C.pct(p, 1), xLabel: 'Nilai hasil' + unitTxt() }, t, { width: W });
    },
    cdf: (W, t) => {
      const c = comp();
      if (!c.ok) return null;
      return C.riskCdf({ series: profiles(c), fmtV, fmtP: (p) => C.pct(p, 1), xLabel: 'Nilai hasil' + unitTxt() }, t, { width: W });
    },
    payoff: (W, t) => {
      const c = comp();
      if (S.p.mode !== 'table' || !c.table || c.table.M.flat().some((x) => !isFinite(x))) return null;
      return C.payoffBars({ alts: S.p.table.alternatives.map((a) => a.name), states: S.p.table.states.map((s) => s.name), M: c.table.M, fmtV }, t, { width: W });
    },
    oneWay: (W, t) => {
      const o = oneWayData();
      if (!o) return null;
      return C.oneWayChart(Object.assign({ names: o.names, xLabel: o.prm.label, x0: o.prm.base, fmtX: o.fmtX, fmtV, yLabel: valueWord() + unitTxt() }, o.res), t, { width: W });
    },
    tornado: (W, t) => {
      const c = comp();
      if (!c.ok) return null;
      const tor = tornadoData();
      if (!tor.rows.length) return null;
      return C.tornadoChart({ base: tor.base, fmtV, rows: tor.rows.map((r) => ({ label: r.param.label, vLo: r.vLo, vHi: r.vHi, loText: fmtParam(r.param, r.lo), hiText: fmtParam(r.param, r.hi), changes: r.changes })) }, t, { width: W });
    },
    spider: (W, t) => {
      const c = comp();
      if (!c.ok) return null;
      const tor = tornadoData();
      const top = tor.rows.slice(0, 6).map((r) => r.param);
      if (!top.length) return null;
      const sp = D.spider(evaluator(), top, 0.5, 11);
      return C.spiderChart({ ts: sp.ts, base: tor.base, fmtV, yLabel: valueWord() + unitTxt(), lines: sp.lines.map((l) => ({ label: l.param.label, values: l.values })) }, t, { width: W });
    },
    twoWay: (W, t) => {
      const o = twoWayData();
      if (!o) return null;
      return C.strategyRegion(Object.assign({ names: o.names, xLabel: o.p1.label, yLabel: o.p2.label, fmtX: o.fx, fmtY: o.fy, x0: o.p1.base, y0: o.p2.base }, o.res), t, { width: W });
    },
    evpi: (W, t) => {
      const c = comp();
      if (!c.ok || S.p.mode === 'table') return null;
      const e = evpiData();
      const items = e.groups.filter((x) => x.r && !x.r.tooMany).map((x) => ({ name: x.g.name, value: x.r.evpi }));
      if (e.total && !e.total.tooMany) items.push({ name: 'Semua ketidakpastian', value: e.total.evpi });
      if (!items.length) return null;
      return C.valueBars({ items, fmtV, valueLabel: 'EVPI', title: 'Nilai informasi sempurna' }, t, { width: W });
    },
    voi: (W, t) => {
      const c = comp();
      if (!c.ok || S.p.mode !== 'table') return null;
      const cr = c.criteria;
      const items = [{ name: 'Tanpa informasi (EV terbaik)', value: cr.bestEV }];
      if (c.sample) items.push({ name: 'Dengan informasi sampel', value: c.sample.evwsi });
      items.push({ name: 'Dengan informasi sempurna', value: cr.evwpi });
      return C.valueBars({ items, fmtV, valueLabel: maximize() ? 'Nilai harapan' : 'Biaya harapan', title: 'Nilai harapan menurut tingkat informasi', best: [items.length - 1] }, t, { width: W });
    }
  };

  function fmtParam(prm, x) { return prm.kind === 'prob' ? fmtP(x) : fmtV(x); }

  /* ================================================================== *
   * Langkah 1: Model
   * ================================================================== */

  const TYPE_ICON = { decision: '<span class="nd sq" aria-hidden="true"></span>', chance: '<span class="nd ci" aria-hidden="true"></span>', terminal: '<span class="nd tr" aria-hidden="true"></span>' };

  function settingsPanel() {
    const s = S.p.settings;
    const riskOn = s.risk.mode !== 'neutral';
    return `<section class="panel">
      <div class="panel-head"><h2>Pengaturan</h2></div>
      <div class="settings">
        <label class="field full"><span>Tujuan</span><select data-bind="set-objective">
          <option value="max"${s.objective === 'max' ? ' selected' : ''}>Maksimalkan (laba, manfaat)</option>
          <option value="min"${s.objective === 'min' ? ' selected' : ''}>Minimalkan (biaya, waktu)</option></select></label>
        <label class="field"><span>Satuan nilai</span><input type="text" value="${esc(s.unit)}" data-bind="set-unit" data-fk="set-unit" maxlength="40" placeholder="mis. juta rupiah"></label>
        <label class="field"><span>Format peluang</span><select data-bind="set-prob">
          <option value="percent"${s.probFormat === 'percent' ? ' selected' : ''}>Persen (60)</option>
          <option value="decimal"${s.probFormat === 'decimal' ? ' selected' : ''}>Desimal (0,6)</option></select></label>
        <label class="field"><span>Angka di belakang koma</span><select data-bind="set-dec">${[0, 1, 2, 3, 4].map((d) => `<option value="${d}"${s.decimals === d ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
        <label class="field"><span>Pemisah desimal</span><select data-bind="set-sep"><option value=","${s.decimalSep === ',' ? ' selected' : ''}>Koma (0,5)</option><option value="."${s.decimalSep === '.' ? ' selected' : ''}>Titik (0.5)</option></select></label>
        <label class="field full"><span>Sikap terhadap risiko</span><select data-bind="set-risk" ${s.objective === 'min' ? 'disabled' : ''}>${Object.keys(M.RISK_MODES).map((k) => `<option value="${k}"${s.risk.mode === k ? ' selected' : ''}>${M.RISK_MODES[k]}</option>`).join('')}</select></label>
        ${riskOn && s.objective === 'max' ? `<label class="field full"><span>Toleransi risiko R${unitTxt() ? ' (' + esc(s.unit) + ')' : ''}</span><input type="text" inputmode="decimal" value="${esc(s.risk.R)}" data-bind="set-R" data-fk="set-R"></label>` : ''}
      </div>
      <p class="note">${s.objective === 'min' ? 'Mode biaya: keputusan memilih nilai harapan terkecil. Analisis utilitas hanya tersedia untuk tujuan maksimalkan.' : riskOn ? `Utilitas eksponensial ${s.risk.mode === 'averse' ? 'U(x) = 1 − e<sup>−x/R</sup>' : 'U(x) = e<sup>x/R</sup> − 1'}. Keputusan memakai utilitas harapan; nilai simpul ditampilkan sebagai <i>certainty equivalent</i> (CE). R kecil = sikap risiko lebih kuat.` : 'Keputusan memakai nilai harapan (EMV). Pilih sikap risiko untuk analisis utilitas dan certainty equivalent.'}</p>
    </section>`;
  }

  function variablesPanel() {
    const vars = S.p.variables;
    const rows = vars.map((v) => `<tr>
      <td><input type="text" value="${esc(v.name)}" data-bind="var-name" data-id="${v.id}" data-fk="vn-${v.id}" maxlength="32" spellcheck="false" aria-label="Nama variabel" class="mono"></td>
      <td><input type="text" value="${esc(v.value)}" data-bind="var-value" data-id="${v.id}" data-fk="vv-${v.id}" inputmode="decimal" aria-label="Nilai ${esc(v.name)}" class="num"></td>
      <td><input type="text" value="${esc(v.note)}" data-bind="var-note" data-id="${v.id}" data-fk="vt-${v.id}" maxlength="160" placeholder="keterangan" aria-label="Keterangan"></td>
      <td class="act-col"><button class="icon-btn danger" data-act="var-del" data-id="${v.id}" aria-label="Hapus variabel ${esc(v.name)}">${icon('trash')}</button></td></tr>`).join('');
    return `<section class="panel" id="vars-panel">
      <div class="panel-head"><h2>Variabel & rumus</h2><span class="hint">opsional</span></div>
      <p class="note">Awali isian dengan <code>=</code> untuk menulis rumus, misalnya <code>=untung*0,6 - biaya</code> atau <code>=1-p</code>. Desimal memakai koma; pemisah argumen fungsi memakai titik koma, misalnya <code>=max(a; b)</code>.</p>
      ${vars.length ? `<div class="table-wrap"><table class="data vars"><thead><tr><th scope="col">Nama</th><th scope="col">Nilai / rumus</th><th scope="col">Keterangan</th><th scope="col"><span class="sr">Aksi</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      <div class="row-buttons"><button class="btn soft sm" data-act="var-add">${icon('plus')}Tambah variabel</button></div>
    </section>`;
  }

  function renderModel() {
    const p = S.p;
    const modeSeg = `<div class="seg" role="tablist" aria-label="Cara memasukkan model">
      <button role="tab" aria-selected="${p.mode === 'tree'}" class="${p.mode === 'tree' ? 'on' : ''}" data-act="set-mode" data-id="tree">${icon('tree')}Pohon keputusan</button>
      <button role="tab" aria-selected="${p.mode === 'table'}" class="${p.mode === 'table' ? 'on' : ''}" data-act="set-mode" data-id="table">${icon('table')}Tabel payoff</button></div>`;
    const head = `<div class="page-head"><div><h1>Model keputusan</h1><p>${p.mode === 'tree' ? 'Susun pilihan (simpul keputusan), kemungkinan kejadian (simpul peluang), dan nilai akhir. Pohon dihitung mundur secara otomatis.' : 'Isi tabel payoff: alternatif × kondisi beserta peluangnya. Cocok untuk kriteria keputusan (maximax, maximin, Hurwicz, regret) dan informasi sampel.'}</p></div>${modeSeg}</div>`;
    const editor = p.mode === 'tree' ? renderTreeEditor() : renderTableEditor();
    return `${head}
    <div class="model-grid">
      <div class="main-col">${editor}<div id="err-box"></div></div>
      <div class="side-col">${settingsPanel()}${variablesPanel()}</div>
    </div>
    <div class="chart-grid one">${chartCard('tree', p.mode === 'tree' ? 'Diagram pohon keputusan' : 'Pohon keputusan setara', 'Klik simpul untuk menuju isiannya. Garis tebal = kebijakan optimal; tanda ∥ = cabang keputusan yang tidak dipilih.', CH.tree(S.ui.selected), { wide: true, scroll: true, file: 'pohon-keputusan' })}</div>
    <div class="step-foot"><span></span><button class="btn primary lg" data-act="calc">Hitung dan bandingkan${icon('arrowR')}</button></div>`;
  }

  /* --- editor pohon --- */

  function typeSelect(n, isRoot) {
    const opts = (isRoot ? ['decision', 'chance'] : ['decision', 'chance', 'terminal']).map((t) => `<option value="${t}"${n.type === t ? ' selected' : ''}>${M.TYPES[t]}</option>`).join('');
    return `<select data-bind="n-type" data-id="${n.id}" data-fk="nt-${n.id}" aria-label="Jenis simpul">${opts}</select>`;
  }

  function renderBranches(n, depth) {
    let html = '';
    n.branches.forEach((b, i) => {
      const ch = b.child;
      const chance = n.type === 'chance';
      html += `<div class="tr-row" style="--d:${depth}" data-row-node="${ch.id}">
        <div class="tr-c tr-bname"><span class="tr-guide" aria-hidden="true"></span><input type="text" value="${esc(b.name)}" data-bind="b-name" data-id="${b.id}" data-fk="bn-${b.id}" maxlength="160" placeholder="${chance ? 'Nama kejadian' : 'Nama pilihan'}" aria-label="Nama cabang"></div>
        <div class="tr-c tr-prob">${chance ? `<input type="text" inputmode="decimal" value="${esc(b.prob)}" data-bind="b-prob" data-id="${b.id}" data-fk="bp-${b.id}" placeholder="${pctMode() ? '%' : '0–1'}" aria-label="Peluang ${esc(b.name)}" class="num">` : '<span class="dash">—</span>'}</div>
        <div class="tr-c tr-cash"><input type="text" inputmode="decimal" value="${esc(b.value)}" data-bind="b-value" data-id="${b.id}" data-fk="bv-${b.id}" placeholder="0" aria-label="Arus kas cabang ${esc(b.name)}" class="num"></div>
        <div class="tr-c tr-type">${TYPE_ICON[ch.type]}${typeSelect(ch, false)}</div>
        <div class="tr-c tr-node">${ch.type === 'terminal'
          ? `<input type="text" inputmode="decimal" value="${esc(ch.payoff)}" data-bind="n-payoff" data-id="${ch.id}" data-fk="np-${ch.id}" placeholder="Nilai akhir" aria-label="Payoff akhir" class="num">`
          : `<input type="text" value="${esc(ch.name)}" data-bind="n-name" data-id="${ch.id}" data-fk="nn-${ch.id}" maxlength="160" placeholder="${ch.type === 'chance' ? 'Nama ketidakpastian' : 'Nama keputusan'}" aria-label="Nama simpul">`}</div>
        <div class="tr-c tr-val num" data-val="${ch.id}"></div>
        <div class="tr-c tr-act">
          <button class="icon-btn" data-act="b-up" data-id="${b.id}" ${i === 0 ? 'disabled' : ''} aria-label="Naikkan cabang">${icon('up')}</button>
          <button class="icon-btn" data-act="b-down" data-id="${b.id}" ${i === n.branches.length - 1 ? 'disabled' : ''} aria-label="Turunkan cabang">${icon('down')}</button>
          <button class="icon-btn" data-act="b-dup" data-id="${b.id}" title="Salin cabang beserta subpohonnya" aria-label="Salin cabang">${icon('copy')}</button>
          <button class="icon-btn danger" data-act="b-del" data-id="${b.id}" aria-label="Hapus cabang">${icon('trash')}</button>
        </div>
      </div>`;
      if (ch.type !== 'terminal') html += renderBranches(ch, depth + 1) + addRow(ch, depth + 1);
    });
    return html;
  }
  function addRow(n, depth) {
    return `<div class="tr-add" style="--d:${depth}"><button class="btn ghost sm" data-act="b-add" data-id="${n.id}">${icon('plus')}Cabang ${n.type === 'chance' ? 'kejadian' : 'pilihan'}${n.name ? ' di “' + esc(n.name) + '”' : ''}</button>${n.type === 'chance' ? `<span class="psum" data-psum="${n.id}"></span>` : ''}</div>`;
  }

  function renderTreeEditor() {
    const t = S.p.tree;
    return `<section class="panel tree-panel">
      <div class="panel-head"><h2>Struktur pohon</h2><span class="hint">${D.countNodes(t)} simpul</span></div>
      <div class="tr-root" data-row-node="${t.id}">
        <span class="tr-root-label">Simpul akar</span>
        <div class="tr-c tr-type">${TYPE_ICON[t.type]}${typeSelect(t, true)}</div>
        <input type="text" value="${esc(t.name)}" data-bind="n-name" data-id="${t.id}" data-fk="nn-${t.id}" maxlength="160" placeholder="Nama keputusan utama" aria-label="Nama simpul akar">
        <span class="tr-val num" data-val="${t.id}"></span>
      </div>
      <div class="tr-head" aria-hidden="true"><span>Cabang</span><span>Peluang${pctMode() ? ' (%)' : ''}</span><span>Arus kas</span><span>Simpul berikut</span><span>Nama simpul / nilai akhir</span><span>Nilai</span><span></span></div>
      <div class="tr-body">${renderBranches(t, 0)}${addRow(t, 0)}</div>
      <p class="note">Nilai jalur = jumlah arus kas cabang sepanjang jalur + nilai akhir. Isi biaya sebagai arus kas negatif (misalnya biaya survei −10) atau langsung masukkan nilai bersih di simpul akhir.</p>
    </section>`;
  }

  /* --- editor tabel payoff --- */

  function renderTableEditor() {
    const t = S.p.table;
    const sm = t.sample;
    const head = `<tr><th scope="col" class="corner"><input type="text" value="${esc(t.decisionLabel)}" data-bind="t-dlabel" data-fk="t-dlabel" maxlength="80" aria-label="Nama keputusan"><span class="corner-sep">\\</span><input type="text" value="${esc(t.stateLabel)}" data-bind="t-slabel" data-fk="t-slabel" maxlength="80" aria-label="Nama kondisi"></th>${t.states.map((s) => `<th scope="col"><div class="th-edit"><input type="text" value="${esc(s.name)}" data-bind="t-sname" data-id="${s.id}" data-fk="ts-${s.id}" maxlength="80" aria-label="Nama kondisi"><button class="icon-btn danger" data-act="t-sdel" data-id="${s.id}" ${t.states.length <= 1 ? 'disabled' : ''} aria-label="Hapus kondisi ${esc(s.name)}">${icon('x')}</button></div></th>`).join('')}<th scope="col" class="act-col"><button class="btn ghost sm" data-act="t-sadd">${icon('plus')}Kondisi</button></th></tr>`;
    const probRow = `<tr class="prob-row"><th scope="row">Peluang${pctMode() ? ' (%)' : ''}</th>${t.states.map((s) => `<td><input type="text" inputmode="decimal" class="num" value="${esc(s.prob)}" data-bind="t-sprob" data-id="${s.id}" data-fk="tp-${s.id}" aria-label="Peluang ${esc(s.name)}"></td>`).join('')}<td class="act-col"><span class="psum" id="t-psum"></span></td></tr>`;
    const body = t.alternatives.map((a, i) => `<tr><th scope="row"><input type="text" value="${esc(a.name)}" data-bind="t-aname" data-id="${a.id}" data-fk="ta-${a.id}" maxlength="160" aria-label="Nama alternatif"></th>${t.states.map((s, j) => `<td><input type="text" inputmode="decimal" class="num" value="${esc(t.payoffs[a.id][s.id])}" data-bind="t-pay" data-a="${a.id}" data-s="${s.id}" data-i="${i}" data-j="${j}" data-fk="tv-${a.id}-${s.id}" aria-label="Payoff ${esc(a.name)} bila ${esc(s.name)}"></td>`).join('')}<td class="act-col"><button class="icon-btn danger" data-act="t-adel" data-id="${a.id}" ${t.alternatives.length <= 1 ? 'disabled' : ''} aria-label="Hapus alternatif ${esc(a.name)}">${icon('trash')}</button></td></tr>`).join('');
    const sampleBody = sm.enabled ? `
      <div class="settings two">
        <label class="field"><span>Nama informasi</span><input type="text" value="${esc(sm.name)}" data-bind="t-smname" data-fk="t-smname" maxlength="80" placeholder="mis. survei pasar"></label>
        <label class="field"><span>Biaya memperoleh informasi${unitTxt() ? ' (' + esc(S.p.settings.unit) + ')' : ''}</span><input type="text" inputmode="decimal" class="num" value="${esc(sm.cost)}" data-bind="t-smcost" data-fk="t-smcost"></label>
      </div>
      <p class="note">Isi keandalan informasi: peluang setiap hasil indikator <b>bila</b> kondisi sebenarnya diketahui, P(indikator | kondisi). Tiap baris berjumlah ${pctMode() ? '100%' : '1'}.</p>
      <div class="table-wrap"><table class="matrix lk"><thead><tr><th scope="col">P(indikator | kondisi)</th>${sm.indicators.map((k) => `<th scope="col"><div class="th-edit"><input type="text" value="${esc(k.name)}" data-bind="t-iname" data-id="${k.id}" data-fk="ti-${k.id}" maxlength="80" aria-label="Nama indikator"><button class="icon-btn danger" data-act="t-idel" data-id="${k.id}" ${sm.indicators.length <= 2 ? 'disabled' : ''} aria-label="Hapus indikator">${icon('x')}</button></div></th>`).join('')}<th class="act-col"><button class="btn ghost sm" data-act="t-iadd">${icon('plus')}Indikator</button></th></tr></thead>
      <tbody>${t.states.map((s) => `<tr><th scope="row">${esc(s.name)}</th>${sm.indicators.map((k) => `<td><input type="text" inputmode="decimal" class="num" value="${esc((sm.likelihood[s.id] || {})[k.id] || '')}" data-bind="t-like" data-s="${s.id}" data-k="${k.id}" data-fk="tl-${s.id}-${k.id}" aria-label="P(${esc(k.name)} | ${esc(s.name)})"></td>`).join('')}<td class="act-col"><span class="psum" data-lsum="${s.id}"></span></td></tr>`).join('')}</tbody></table></div>` : '<p class="note">Aktifkan bila Anda bisa membeli informasi tambahan (survei, uji, konsultan) sebelum memutuskan. Kalkulator akan menghitung revisi Bayes, EVSI, dan efisiensi informasi.</p>';
    return `<section class="panel">
      <div class="panel-head"><h2>Tabel payoff</h2><span class="hint">${t.alternatives.length} alternatif × ${t.states.length} kondisi</span></div>
      <div class="table-wrap"><table class="matrix payoff"><thead>${head}</thead><tbody>${probRow}${body}</tbody></table></div>
      <div class="toolbar"><button class="btn soft" data-act="t-aadd">${icon('plus')}Tambah alternatif</button>
        <label class="field inline alpha"><span>Koefisien optimisme Hurwicz (α)</span><input type="text" inputmode="decimal" class="num" value="${esc(t.alpha)}" data-bind="t-alpha" data-fk="t-alpha"></label>
        <button class="btn ghost" data-act="t-totree" title="Salin pohon setara ke mode pohon untuk diubah lebih lanjut">${icon('tree')}Jadikan pohon keputusan</button></div>
      <p class="note">Tip: salin blok angka dari Excel lalu tekan Ctrl+V di sel payoff mana pun untuk mengisi sel ke kanan dan ke bawah.</p>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Informasi sampel (survei)</h2><label class="check"><input type="checkbox" data-bind="t-smon" ${sm.enabled ? 'checked' : ''}> Gunakan</label></div>
      ${sampleBody}
    </section>`;
  }

  /* --- pembaruan langsung tanpa render ulang --- */

  function markErrors() {
    const c = comp();
    $$('#main .invalid').forEach((el) => { el.classList.remove('invalid'); el.removeAttribute('title'); });
    const list = [];
    const mark = (sel, msg) => { const el = $(sel); if (el) { el.classList.add('invalid'); el.title = msg; } return el; };
    for (const e of c.errors) {
      let el = null;
      if (e.varId) el = mark(`[data-bind="var-${e.field === 'name' ? 'name' : 'value'}"][data-id="${e.varId}"]`, e.msg);
      else if (S.p.mode === 'tree') {
        if (e.field === 'prob' && e.branchId) el = mark(`[data-bind="b-prob"][data-id="${e.branchId}"]`, e.msg);
        else if (e.field === 'value' && e.branchId) el = mark(`[data-bind="b-value"][data-id="${e.branchId}"]`, e.msg);
        else if (e.field === 'payoff') el = mark(`[data-bind="n-payoff"][data-id="${e.nodeId}"]`, e.msg);
      } else {
        if (e.field === 'payoff') el = mark(`[data-bind="t-pay"][data-a="${e.altId}"][data-s="${e.stateId}"]`, e.msg);
        else if (e.field === 'prob') el = mark(`[data-bind="t-sprob"][data-id="${e.stateId}"]`, e.msg);
        else if (e.field === 'likelihood') el = mark(`[data-bind="t-like"][data-s="${e.stateId}"][data-k="${e.indId}"]`, e.msg);
        else if (e.field === 'alpha') el = mark('[data-bind="t-alpha"]', e.msg);
        else if (e.field === 'cost') el = mark('[data-bind="t-smcost"]', e.msg);
      }
      if (e.field === 'riskR') el = mark('[data-bind="set-R"]', e.msg);
      list.push({ e, fk: el ? el.dataset.fk : null });
    }
    const box = $('#err-box');
    if (box) {
      box.innerHTML = list.length ? `<div class="banner warn">${icon('alert')}<div><b>${list.length} isian perlu diperiksa</b><ul>${list.slice(0, 8).map((x) => `<li>${x.fk ? `<button class="link-btn" data-act="focus" data-id="${esc(x.fk)}">${esc(errLabel(x.e))}</button>` : esc(errLabel(x.e))}</li>`).join('')}${list.length > 8 ? `<li>… ${list.length - 8} lainnya</li>` : ''}</ul></div></div>` : '';
    }
  }
  function errLabel(e) {
    if (S.p.mode === 'tree' && (e.nodeId || e.branchId)) {
      if (e.branchId) { const f = M.findBranch(S.p.tree, e.branchId); if (f) return `${f.branch.name || 'Cabang'}: ${e.msg}`; }
      const f = e.nodeId && M.find(S.p.tree, e.nodeId);
      if (f && f.node.type === 'terminal' && f.branch) return `Nilai akhir ${f.branch.name || ''}: ${e.msg}`;
    }
    if (e.varId) { const v = S.p.variables.find((x) => x.id === e.varId); return `Variabel ${v ? v.name : ''}: ${e.msg}`; }
    return e.msg;
  }

  function paintLive() {
    const c = comp();
    if (S.p.mode === 'tree' && c.res) {
      $$('[data-val]').forEach((el) => {
        const r = c.res.nodes.get(el.dataset.val);
        el.textContent = r && isFinite(r.value) ? fmtV(r.value) : '–';
        el.classList.toggle('opt', !!(r && isOnPolicy(c.res, r.id)));
      });
      $$('[data-psum]').forEach((el) => {
        const r = c.res.nodes.get(el.dataset.psum);
        if (!r || !isFinite(r.probSum)) { el.textContent = ''; return; }
        const okSum = Math.abs(r.probSum - 1) <= D.PROB_TOL;
        el.textContent = 'Σ peluang = ' + fmtP(r.probSum);
        el.className = 'psum ' + (okSum ? 'ok' : 'bad');
      });
    }
    if (S.p.mode === 'table') {
      const t = S.p.table;
      const tv = c.table;
      const ps = $('#t-psum');
      if (ps && tv) { const total = D.sum(tv.prior); ps.textContent = isFinite(total) ? 'Σ = ' + fmtP(total) : ''; ps.className = 'psum ' + (isFinite(total) && Math.abs(total - 1) <= D.PROB_TOL ? 'ok' : 'bad'); }
      if (tv && tv.sample) t.states.forEach((s, j) => { const el = $(`[data-lsum="${s.id}"]`); if (el) { const tot = D.sum(tv.sample.L[j]); el.textContent = isFinite(tot) ? 'Σ = ' + fmtP(tot) : ''; el.className = 'psum ' + (isFinite(tot) && Math.abs(tot - 1) <= D.PROB_TOL ? 'ok' : 'bad'); } });
    }
    markErrors();
  }
  function refreshLive() {
    paintLive();
    const fig = $('[data-chart="tree"]');
    if (fig) { S.chartDefs.tree.build = CH.tree(S.ui.selected); mountChart(fig); }
    renderChrome();
  }
  let liveTimer = null;
  function refreshSoon() { clearTimeout(liveTimer); liveTimer = setTimeout(refreshLive, 160); }

  function isOnPolicy(res, id) {
    let on = false;
    (function rec(r, pol) {
      if (r.id === id) { on = pol; return; }
      (r.branches || []).forEach((b, i) => rec(b.child, pol && (r.type === 'chance' || i === r.choice)));
    }(res.root, true));
    return on;
  }

  /* ================================================================== *
   * Langkah 2: Hasil
   * ================================================================== */

  function errorsBanner(c) {
    return `<div class="banner warn">${icon('alert')}<div><b>Belum bisa dihitung.</b><ul>${c.errors.slice(0, 10).map((e) => `<li>${esc(errLabel(e))}</li>`).join('')}${c.errors.length > 10 ? `<li>… ${c.errors.length - 10} lainnya</li>` : ''}</ul>
      <div class="row-buttons"><button class="btn sm" data-act="goto" data-step="model">Perbaiki model</button></div></div></div>`;
  }

  function verdictText(c) {
    const r = c.res.root;
    const U = c.res.utility;
    const vw = U.active ? 'certainty equivalent' : (maximize() ? 'nilai harapan' : 'biaya harapan');
    if (r.type === 'decision') {
      const ties = r.best.map((i) => r.branches[i].name);
      const main = ties.length > 1 ? `${ties.join(' dan ')} sama baiknya` : `Pilih “${r.branches[r.choice].name}”`;
      return `${main} dengan ${vw} ${money(r.value)}${U.active ? ` (nilai harapan ${money(r.ev)})` : ''}.`;
    }
    return `${U.active ? 'Certainty equivalent' : (maximize() ? 'Nilai harapan' : 'Biaya harapan')} keseluruhan: ${money(r.value)}.`;
  }

  /** Langkah rollback dari daun ke akar (untuk ditulis di laporan/tugas). */
  function rollbackSteps(c, limit) {
    const out = [];
    const U = c.res.utility;
    (function rec(r, trail) {
      if (r.type === 'terminal') return;
      r.branches.forEach((b) => rec(b.child, trail.concat(b.name)));
      const where = (r.name || (r.type === 'chance' ? 'Simpul peluang' : 'Simpul keputusan')) + (trail.length ? ` [${trail.join(' › ')}]` : '');
      if (r.type === 'chance') {
        if (U.active) out.push({ where, kind: 'chance', text: `EU = ${r.branches.map((b) => `${fmtP(b.p)} × U(${fmtV(b.child.ce)})`).join(' + ')} = ${C.num(r.eu, 6)} → CE = ${fmtV(r.ce)}` });
        else out.push({ where, kind: 'chance', text: `EV = ${r.branches.map((b) => `${fmtP(b.p)} × ${paren(b.child.ev)}`).join(' + ')} = ${fmtV(r.ev)}` });
      } else {
        out.push({ where, kind: 'decision', text: `${maximize() ? 'maks' : 'min'}(${r.branches.map((b) => `${b.name}: ${fmtV(b.child.value)}`).join('; ')}) = ${fmtV(r.value)} → pilih “${r.branches[r.choice].name}”` });
      }
    }(c.res.root, []));
    return limit ? out.slice(0, limit) : out;
  }
  const paren = (x) => (x < 0 ? '(' + fmtV(x) + ')' : fmtV(x));

  function statsTable(c) {
    const prof = profiles(c);
    const U = c.res.utility;
    const rv = D.rootValues(c.res);
    const rows = prof.map((pf, k) => `<tr${rv.ties.includes(k) ? ' class="best"' : ''}><th scope="row">${esc(pf.name)}</th><td class="num">${fmtV(pf.mean)}</td>${U.active ? `<td class="num">${fmtV(rv.values[k])}</td>` : ''}<td class="num">${fmtV(pf.sd)}</td><td class="num">${fmtV(pf.min)}</td><td class="num">${fmtV(pf.max)}</td>${maximize() ? `<td class="num">${C.pct(pf.pLoss, 1)}</td>` : ''}</tr>`).join('');
    let domNote = '';
    if (prof.length >= 2 && prof.length <= 6) {
      const notes = [];
      for (let a = 0; a < prof.length; a++) for (let b = a + 1; b < prof.length; b++) {
        const d = D.dominance(prof[a], prof[b], maximize());
        if (d.order) notes.push(`${d.winner === 'a' ? prof[a].name : prof[b].name} mendominasi ${d.winner === 'a' ? prof[b].name : prof[a].name} (dominansi stokastik orde ${d.order})`);
      }
      domNote = notes.length ? `<p class="note">${icon('check')}${esc(notes.join('; '))}.</p>` : '<p class="note">Tidak ada alternatif yang mendominasi alternatif lain secara stokastik; pilihan bergantung pada sikap terhadap risiko.</p>';
    }
    return `<div class="table-wrap"><table class="data" data-copy="stats"><thead><tr><th scope="col">Alternatif (mengikuti kebijakan optimal)</th><th scope="col">${maximize() ? 'Nilai harapan' : 'Biaya harapan'}</th>${U.active ? '<th scope="col">CE</th>' : ''}<th scope="col">Simpangan baku</th><th scope="col">Minimum</th><th scope="col">Maksimum</th>${maximize() ? '<th scope="col">P(rugi)</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>${domNote}`;
  }

  function criteriaPanel(c) {
    const t = S.p.table, cr = c.criteria;
    const names = t.alternatives.map((a) => a.name);
    const mx = maximize();
    const cols = [
      ['optimistic', mx ? 'Maximax (optimis)' : 'Minimin (optimis)'],
      ['pessimistic', mx ? 'Maximin (pesimis)' : 'Minimax (pesimis)'],
      ['hurwicz', `Hurwicz (α = ${C.numTrim(cr.alpha, 3)})`],
      ['laplace', 'Laplace (peluang sama)'],
      ['maxRegret', 'Regret maksimum'],
      ['ev', mx ? 'Nilai harapan (EV)' : 'Biaya harapan'],
      ['eol', 'EOL']
    ];
    const winKey = { maxRegret: 'regret' };
    const rows = cr.rows.map((r, i) => `<tr><th scope="row">${esc(names[i])}</th>${cols.map(([k]) => `<td class="num${cr.winners[winKey[k] || k].includes(i) ? ' win' : ''}">${fmtV(r[k])}</td>`).join('')}</tr>`).join('');
    const summary = cols.map(([k, label]) => `<li><b>${esc(label)}</b>: ${esc(cr.winners[winKey[k] || k].map((i) => names[i]).join(', '))}</li>`).join('');
    const regretRows = cr.regret.map((row, i) => `<tr><th scope="row">${esc(names[i])}</th>${row.map((x) => `<td class="num">${fmtV(x)}</td>`).join('')}<td class="num strong">${fmtV(cr.rows[i].maxRegret)}</td></tr>`).join('');
    return `<section class="panel">
      <div class="panel-head"><h2>Kriteria keputusan</h2>${copyBtn('crit')}</div>
      <div class="table-wrap"><table class="data crit" data-copy="crit"><thead><tr><th scope="col">Alternatif</th>${cols.map(([, l]) => `<th scope="col">${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
      <ul class="win-list">${summary}</ul>
      <p class="note">Sel hijau = alternatif terpilih menurut kriteria itu. EOL (expected opportunity loss) terkecil selalu sama dengan EVPI = ${money(cr.evpi)}.</p>
      <h3 class="sub-h">Tabel regret (opportunity loss)</h3>
      <div class="table-wrap"><table class="data" data-copy="regret"><thead><tr><th scope="col">Alternatif</th>${t.states.map((s) => `<th scope="col">${esc(s.name)}</th>`).join('')}<th scope="col">Regret maks.</th></tr></thead><tbody>${regretRows}</tbody></table></div>
      <div class="row-buttons">${copyBtn('regret')}</div>
    </section>`;
  }

  function pathsTable(c) {
    const ps = D.paths(c.res);
    const limit = 300;
    const rows = ps.slice(0, limit).map((x, i) => `<tr${x.optimal ? ' class="best"' : ''}><td class="num">${i + 1}</td><td>${esc(x.labels.join(' › '))}</td><td class="num">${fmtP(x.prob)}</td><td class="num">${fmtV(x.payoff)}</td><td>${x.optimal ? 'Ya' : ''}</td></tr>`).join('');
    return `<div class="table-wrap"><table class="data" data-copy="paths"><thead><tr><th scope="col">#</th><th scope="col">Jalur</th><th scope="col">Peluang jalur</th><th scope="col">Nilai jalur</th><th scope="col">Kebijakan optimal</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${ps.length > limit ? `<p class="note">Menampilkan ${limit} dari ${ps.length} jalur. Unduh CSV untuk daftar lengkap.</p>` : ''}
      <p class="note">Peluang jalur = hasil kali peluang kejadian sepanjang jalur, dengan asumsi cabang keputusan pada jalur itu dipilih.</p>`;
  }

  const copyBtn = (id) => `<button class="btn ghost sm" data-act="copy-table" data-id="${id}" title="Salin tabel (bisa ditempel ke Word/Excel)">${icon('copy')}Salin</button>`;

  function renderResults() {
    const c = comp();
    const head = '<div class="page-head"><div><h1>Hasil analisis</h1><p>Pohon dihitung mundur (rollback): simpul peluang memakai nilai harapan, simpul keputusan memilih cabang terbaik.</p></div>';
    if (!c.ok) return head + '</div>' + errorsBanner(c);
    const pol = D.policy(c.res).filter((x) => x.reachable);
    const steps = rollbackSteps(c);
    const U = c.res.utility;
    return `${head}<div class="head-ctrls"><button class="btn" data-act="goto" data-step="report">${icon('download')}Unduh laporan</button></div></div>
    <div class="summary verdict">
      <div class="verdict-kicker">Rekomendasi${U.active ? ' · ' + esc(U.label) : ''}</div>
      <div class="verdict-main"><span class="verdict-name">${esc(c.res.root.type === 'decision' ? c.res.root.branches[c.res.root.choice].name : (c.res.root.name || 'Hasil'))}</span><span class="verdict-val num">${esc(money(c.res.root.value))}</span></div>
      <p class="verdict-sub">${esc(verdictText(c))} Nilai ini adalah rata-rata berbobot peluang, bukan hasil yang dijamin.</p>
    </div>
    <section class="panel">
      <div class="panel-head"><h2>Kebijakan optimal</h2><span class="hint">keputusan di setiap titik pada jalur terbaik</span></div>
      <ol class="policy">${pol.map((x) => `<li><span class="nd sq" aria-hidden="true"></span><span><b>${esc(x.name || 'Keputusan')}</b>${x.trail.length ? ` <span class="muted">(${esc(x.trail.join(' › '))})</span>` : ''}: pilih <b>${esc(x.choiceName)}</b> — ${esc(money(x.value))}${x.ties.length > 1 ? ` <span class="muted">(seri dengan ${esc(x.ties.filter((n) => n !== x.choiceName).join(', '))})</span>` : ''}</span></li>`).join('') || '<li>Simpul akar adalah simpul peluang tanpa keputusan; nilai di atas adalah nilai harapan keseluruhan.</li>'}</ol>
    </section>
    ${S.p.mode === 'table' ? criteriaPanel(c) : ''}
    <div class="chart-grid">
      ${chartCard('values', U.active ? 'Certainty equivalent tiap alternatif' : (maximize() ? 'Nilai harapan tiap alternatif' : 'Biaya harapan tiap alternatif'), 'Batang = nilai alternatif di simpul akar; garis = rentang hasil terendah–tertinggi bila mengikuti kebijakan optimal.', CH.values, { wide: S.p.mode === 'tree' })}
      ${S.p.mode === 'table' ? chartCard('payoff', 'Payoff per kondisi', 'Nilai setiap alternatif pada setiap kondisi.', CH.payoff) : ''}
      ${chartCard('pmf', 'Profil risiko', 'Distribusi peluang nilai akhir tiap alternatif (mengikuti kebijakan optimal).', CH.pmf)}
      ${chartCard('cdf', 'Profil risiko kumulatif', 'Garis yang lebih ke kanan/bawah memberi peluang lebih kecil untuk hasil rendah.', CH.cdf)}
      ${chartCard('tree', 'Diagram pohon keputusan', 'Nilai di atas simpul = hasil rollback. Garis tebal = kebijakan optimal.', CH.tree(null), { wide: true, scroll: true, file: 'pohon-keputusan' })}
    </div>
    <section class="panel">
      <div class="panel-head"><h2>Ringkasan risiko</h2>${copyBtn('stats')}</div>
      ${statsTable(c)}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Langkah perhitungan mundur</h2>${copyBtn('roll')}</div>
      <div class="table-wrap"><table class="data roll" data-copy="roll"><thead><tr><th scope="col">Simpul</th><th scope="col">Perhitungan</th></tr></thead><tbody>${steps.slice(0, 200).map((x) => `<tr><th scope="row">${x.kind === 'chance' ? '<span class="nd ci" aria-hidden="true"></span>' : '<span class="nd sq" aria-hidden="true"></span>'}${esc(x.where)}</th><td class="calc">${esc(x.text)}</td></tr>`).join('')}</tbody></table></div>
      ${steps.length > 200 ? `<p class="note">Menampilkan 200 dari ${steps.length} langkah.</p>` : ''}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Semua jalur</h2>${copyBtn('paths')}</div>
      ${pathsTable(c)}
    </section>
    <div class="step-foot"><button class="btn lg" data-act="goto" data-step="model">${icon('arrowL')}Model</button><button class="btn primary lg" data-act="goto" data-step="sens">Uji sensitivitas${icon('arrowR')}</button></div>`;
  }

  /* ================================================================== *
   * Langkah 3: Sensitivitas
   * ================================================================== */

  function paramOptions(selected) {
    const groups = {};
    params().forEach((p) => { (groups[p.group] = groups[p.group] || []).push(p); });
    return Object.keys(groups).map((g) => `<optgroup label="${esc(g)}">${groups[g].map((p) => `<option value="${esc(p.key)}"${p.key === selected ? ' selected' : ''}>${esc(p.label)} (${esc(fmtParam(p, p.base))})</option>`).join('')}</optgroup>`).join('');
  }
  function defaultRange(prm) {
    if (prm.kind === 'prob') return [0, 1];
    const b = prm.base;
    const d = Math.abs(b) * 0.5 || 10;
    return [b - d, b + d];
  }
  function ensureOne() {
    const ps = params();
    if (!ps.length) return null;
    let u = S.ui.one;
    if (!u || !ps.find((p) => p.key === u.key)) {
      const prm = tornadoData().rows.length ? tornadoData().rows[0].param : ps[0];
      u = S.ui.one = { key: prm.key, lo: defaultRange(prm)[0], hi: defaultRange(prm)[1] };
    }
    return u;
  }
  function oneWayData() {
    const c = comp();
    if (!c.ok) return null;
    const u = ensureOne();
    if (!u) return null;
    const prm = params().find((p) => p.key === u.key);
    const ex = extras();
    const ck = u.key + '|' + u.lo + '|' + u.hi;
    if (!ex.one || ex.oneKey !== ck) { ex.one = D.oneWay(evaluator(), u.key, u.lo, u.hi, 61); ex.oneKey = ck; }
    const base = evaluator()(new Map());
    return { prm, res: ex.one, names: base ? base.names : [], fmtX: (x) => fmtParam(prm, x) };
  }
  function ensureTwo() {
    const ps = params();
    if (ps.length < 2) return null;
    let u = S.ui.two;
    if (!u || !ps.find((p) => p.key === u.k1) || !ps.find((p) => p.key === u.k2) || u.k1 === u.k2) {
      const top = tornadoData().rows.map((r) => r.param);
      const p1 = top[0] || ps[0], p2 = top.find((p) => p.key !== p1.key) || ps.find((p) => p.key !== p1.key);
      u = S.ui.two = { k1: p1.key, r1: defaultRange(p1), k2: p2.key, r2: defaultRange(p2) };
    }
    return u;
  }
  function twoWayData() {
    const c = comp();
    if (!c.ok) return null;
    const u = ensureTwo();
    if (!u) return null;
    const p1 = params().find((p) => p.key === u.k1), p2 = params().find((p) => p.key === u.k2);
    const ex = extras();
    const ck = JSON.stringify(u);
    if (!ex.two || ex.twoKey !== ck) { ex.two = D.twoWay(evaluator(), u.k1, u.r1, u.k2, u.r2, 31); ex.twoKey = ck; }
    const base = evaluator()(new Map());
    return { p1, p2, res: ex.two, names: base ? base.names : [], fx: (x) => fmtParam(p1, x), fy: (x) => fmtParam(p2, x) };
  }
  function rangeInputs(prefix, prm, lo, hi) {
    const show = (x) => (prm.kind === 'prob' && pctMode() ? rawNum(x * 100) : rawNum(x));
    return `<label class="field"><span>Dari${prm.kind === 'prob' && pctMode() ? ' (%)' : ''}</span><input type="text" inputmode="decimal" class="num" value="${esc(show(lo))}" data-bind="${prefix}-lo" data-fk="${prefix}-lo"></label>
      <label class="field"><span>Sampai${prm.kind === 'prob' && pctMode() ? ' (%)' : ''}</span><input type="text" inputmode="decimal" class="num" value="${esc(show(hi))}" data-bind="${prefix}-hi" data-fk="${prefix}-hi"></label>`;
  }

  function renderSens() {
    const c = comp();
    const head = '<div class="page-head"><div><h1>Analisis sensitivitas</h1><p>Uji seberapa kuat keputusan bila peluang, payoff, atau variabel berubah.</p></div></div>';
    if (!c.ok) return head + errorsBanner(c);
    const ps = params();
    if (!ps.length) return head + '<div class="banner info">' + icon('alert') + '<div>Belum ada parameter angka yang bisa diuji. Isi peluang, arus kas, atau payoff dengan angka (bukan rumus), atau tambahkan variabel.</div></div>';
    const tabs = [['one', 'Satu arah'], ['tornado', 'Tornado'], ['spider', 'Spider'], ['two', 'Dua arah']];
    const tab = S.ui.sensTab;
    const tableNote = S.p.mode === 'table' && S.p.table.sample.enabled ? '<p class="note">Mode tabel: sensitivitas dihitung untuk pilihan alternatif tanpa informasi sampel.</p>' : '';
    let body = '';
    if (tab === 'one') {
      const o = oneWayData();
      const u = S.ui.one;
      const brk = o.res.breaks;
      body = `<div class="ctrl-row">
          <label class="field grow"><span>Parameter</span><select data-bind="one-key">${paramOptions(u.key)}</select></label>
          ${rangeInputs('one', o.prm, u.lo, u.hi)}
        </div>
        ${chartCard('sens-one', `${valueWord()} terhadap ${o.prm.label}`, 'Latar berwarna = alternatif terbaik pada rentang itu; lingkaran = titik impas (keputusan terbaik berganti).', CH.oneWay, { plain: true, file: 'sensitivitas-satu-arah' })}
        <h3 class="sub-h">Titik impas</h3>
        ${brk.length ? `<ul class="win-list">${brk.map((b) => `<li>Pada <b>${esc(o.prm.label)} = ${esc(fmtParam(o.prm, b.x))}</b> keputusan terbaik berganti dari <b>${esc(o.names[b.from])}</b> ke <b>${esc(o.names[b.to])}</b>.</li>`).join('')}</ul>` : `<p class="note">${icon('check')}Keputusan terbaik tidak berubah dalam rentang ${esc(fmtParam(o.prm, u.lo))} – ${esc(fmtParam(o.prm, u.hi))}.</p>`}
        ${o.prm.kind === 'prob' ? '<p class="note">Saat satu peluang diubah, peluang lain di simpul yang sama diskalakan proporsional agar total tetap 100%.</p>' : ''}`;
    } else if (tab === 'tornado') {
      const tor = tornadoData();
      body = `<div class="ctrl-row">
          <label class="field"><span>Geser nilai ± (%)</span><input type="text" inputmode="decimal" class="num" value="${esc(rawNum(S.p.settings.sens.pct))}" data-bind="sens-pct" data-fk="sens-pct"></label>
          <label class="field"><span>Geser peluang ± (poin %)</span><input type="text" inputmode="decimal" class="num" value="${esc(rawNum(S.p.settings.sens.probDelta))}" data-bind="sens-pd" data-fk="sens-pd"></label>
        </div>
        ${chartCard('sens-tornado', 'Diagram tornado', `Pengaruh tiap parameter terhadap ${valueWord().toLowerCase()} keputusan terbaik, diurutkan dari yang paling berpengaruh. Titik merah = keputusan terbaik berubah.`, CH.tornado, { plain: true, file: 'tornado' })}
        <div class="table-wrap"><table class="data" data-copy="tornado"><thead><tr><th scope="col">Parameter</th><th scope="col">Rendah</th><th scope="col">Nilai</th><th scope="col">Tinggi</th><th scope="col">Nilai</th><th scope="col">Selisih</th><th scope="col">Keputusan berubah?</th></tr></thead>
        <tbody>${tor.rows.map((r) => `<tr><th scope="row">${esc(r.param.label)}</th><td class="num">${esc(fmtParam(r.param, r.lo))}</td><td class="num">${fmtV(r.vLo)}</td><td class="num">${esc(fmtParam(r.param, r.hi))}</td><td class="num">${fmtV(r.vHi)}</td><td class="num strong">${fmtV(r.swing)}</td><td>${r.changes ? '<span class="bad-text">Ya</span>' : 'Tidak'}</td></tr>`).join('')}</tbody></table></div>
        <div class="row-buttons">${copyBtn('tornado')}</div>`;
    } else if (tab === 'spider') {
      body = `<p class="lead">Setiap garis menunjukkan ${valueWord().toLowerCase()} keputusan terbaik bila satu parameter diubah −50% sampai +50% dari nilai dasarnya (enam parameter paling berpengaruh menurut tornado). Garis yang curam = parameter sensitif.</p>
        ${chartCard('sens-spider', 'Diagram spider', '', CH.spider, { plain: true, file: 'spider' })}`;
    } else {
      const o = twoWayData();
      if (!o) body = '<p class="note">Analisis dua arah membutuhkan minimal 2 parameter.</p>';
      else {
        const u = S.ui.two;
        body = `<div class="ctrl-row">
            <label class="field grow"><span>Parameter sumbu datar</span><select data-bind="two-k1">${paramOptions(u.k1)}</select></label>
            ${rangeInputs('two1', o.p1, u.r1[0], u.r1[1])}
          </div>
          <div class="ctrl-row">
            <label class="field grow"><span>Parameter sumbu tegak</span><select data-bind="two-k2">${paramOptions(u.k2)}</select></label>
            ${rangeInputs('two2', o.p2, u.r2[0], u.r2[1])}
          </div>
          ${chartCard('sens-two', 'Wilayah strategi', 'Warna = alternatif terbaik untuk setiap kombinasi dua parameter. Lingkaran = nilai saat ini.', CH.twoWay, { plain: true, file: 'sensitivitas-dua-arah' })}`;
      }
    }
    return `${head}${tableNote}
    <section class="panel">
      <div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" aria-selected="${tab === id}" class="${tab === id ? 'on' : ''}" data-act="sens-tab" data-id="${id}">${label}</button>`).join('')}</div>
      <div class="sens-body">${body}</div>
    </section>
    <div class="step-foot"><button class="btn lg" data-act="goto" data-step="results">${icon('arrowL')}Hasil</button><button class="btn primary lg" data-act="goto" data-step="voi">Nilai informasi${icon('arrowR')}</button></div>`;
  }

  /* ================================================================== *
   * Langkah 4: Nilai informasi
   * ================================================================== */

  function renderVoi() {
    const c = comp();
    const head = '<div class="page-head"><div><h1>Nilai informasi</h1><p>Berapa nilai maksimum yang layak dibayar untuk mengurangi ketidakpastian sebelum memutuskan?</p></div></div>';
    if (!c.ok) return head + errorsBanner(c);
    if (S.p.mode === 'table') return head + voiTable(c);
    const e = evpiData();
    const rows = e.groups.map(({ g, r }) => {
      if (!r) return '';
      if (r.tooMany) return `<tr><th scope="row">${esc(g.name)}</th><td colspan="5">Terlalu banyak kombinasi (${r.combos}).</td></tr>`;
      return `<tr><th scope="row">${esc(g.name)}</th><td>${esc(g.outcomes.map((o, i) => `${o} ${fmtP(r.q[0][i])}`).join(' · '))}</td><td class="num">${g.nodes.length}</td><td class="num">${fmtV(r.withInfo)}</td><td class="num strong">${fmtV(r.evpi)}</td><td>${r.consistent ? 'Sama' : '<span class="warn-text">Berbeda (bersyarat)</span>'}</td></tr>`;
    }).join('');
    const anyCond = e.groups.some((x) => x.r && !x.r.consistent);
    return `${head}
    <section class="panel">
      <div class="panel-head"><h2>EVPI per ketidakpastian</h2>${copyBtn('evpi')}</div>
      <p class="note">EVPI (expected value of perfect information) = nilai keputusan bila hasil suatu ketidakpastian sudah diketahui sebelum semua keputusan diambil, dikurangi nilai keputusan sekarang (${money(c.res.root.value)}). Simpul peluang dengan nama dan nama cabang yang sama dianggap ketidakpastian yang sama.</p>
      <div class="table-wrap"><table class="data" data-copy="evpi"><thead><tr><th scope="col">Ketidakpastian</th><th scope="col">Peluang yang dipakai</th><th scope="col">Jumlah simpul</th><th scope="col">Nilai dengan informasi sempurna</th><th scope="col">EVPI</th><th scope="col">Peluang antar simpul</th></tr></thead><tbody>${rows}
      ${e.total && !e.total.tooMany ? `<tr class="sum-row"><th scope="row">Semua ketidakpastian sekaligus</th><td>dianggap saling bebas</td><td class="num">${e.groups.reduce((s, x) => s + x.g.nodes.length, 0)}</td><td class="num">${fmtV(e.total.withInfo)}</td><td class="num strong">${fmtV(e.total.evpi)}</td><td></td></tr>` : ''}</tbody></table></div>
      ${anyCond ? '<p class="note">' + icon('alert') + 'Sebagian ketidakpastian punya peluang berbeda di simpul yang berbeda (misalnya peluang bersyarat setelah survei). EVPI memakai peluang dari simpul dengan kejadian sebelumnya paling sedikit (biasanya peluang awal/prior). Bila simpul-simpul itu sebenarnya ketidakpastian yang berbeda, beri nama simpul yang berbeda.</p>' : ''}
      ${!e.total && e.groups.length > 1 ? '<p class="note">EVPI gabungan tidak dihitung karena ada ketidakpastian dengan peluang bersyarat.</p>' : ''}
      <p class="note">Jangan membayar informasi (survei, uji, konsultan) lebih dari EVPI-nya. Informasi yang tidak sempurna bernilai lebih kecil; modelkan sebagai cabang “lakukan survei” dengan peluang bersyarat, atau gunakan mode Tabel payoff → Informasi sampel untuk menghitung EVSI otomatis.</p>
    </section>
    <div class="chart-grid one">${chartCard('evpi', 'Nilai informasi sempurna per ketidakpastian', '', CH.evpi)}</div>
    <div class="step-foot"><button class="btn lg" data-act="goto" data-step="sens">${icon('arrowL')}Sensitivitas</button><button class="btn primary lg" data-act="goto" data-step="report">Laporan & unduh${icon('arrowR')}</button></div>`;
  }

  function voiTable(c) {
    const t = S.p.table, cr = c.criteria, sm = c.sample;
    const names = t.alternatives.map((a) => a.name);
    const mx = maximize();
    let html = `<section class="panel">
      <div class="panel-head"><h2>Nilai informasi sempurna (EVPI)</h2></div>
      <div class="metric">
        <div><small>${mx ? 'EV terbaik tanpa informasi' : 'Biaya harapan terbaik'}</small><strong>${esc(money(cr.bestEV))}</strong><span>${esc(names[cr.winners.ev[0]])}</span></div>
        <div><small>EV dengan informasi sempurna (EVwPI)</small><strong>${esc(money(cr.evwpi))}</strong><span>Σ peluang × payoff terbaik tiap kondisi</span></div>
        <div><small>EVPI</small><strong>${esc(money(cr.evpi))}</strong><span>${mx ? 'EVwPI − EV terbaik' : 'EV terbaik − EVwPI'} = EOL minimum</span></div>
      </div>
      <p class="note">EVwPI = ${t.states.map((s, j) => `${fmtP(c.table.prior[j])} × ${paren(cr.colBest[j])}`).join(' + ')} = ${fmtV(cr.evwpi)}.</p>
    </section>`;
    if (!sm) {
      return html + `<div class="banner info">${icon('alert')}<div>Aktifkan <b>Informasi sampel (survei)</b> di langkah Model untuk menghitung revisi Bayes, EVSI, dan efisiensi informasi.<div class="row-buttons"><button class="btn sm" data-act="goto" data-step="model">Ke Model</button></div></div></div>
        <div class="chart-grid one">${chartCard('voi', 'Nilai harapan menurut tingkat informasi', '', CH.voi)}</div>`;
    }
    const B = sm.bayes;
    const inds = t.sample.indicators.map((k) => k.name);
    const states = t.states.map((s) => s.name);
    const mat = (id, title, M2, rowNames, colNames, extraRow) => `<h3 class="sub-h">${esc(title)}</h3><div class="table-wrap"><table class="data" data-copy="${id}"><thead><tr><th scope="col">Kondisi</th>${colNames.map((n) => `<th scope="col" class="num">${esc(n)}</th>`).join('')}</tr></thead><tbody>${M2.map((row, i) => `<tr><th scope="row">${esc(rowNames[i])}</th>${row.map((x) => `<td class="num">${fmtP(x)}</td>`).join('')}</tr>`).join('')}${extraRow || ''}</tbody></table></div>`;
    html += `<section class="panel">
      <div class="panel-head"><h2>Revisi Bayes: ${esc(t.sample.name)}</h2>${copyBtn('post')}</div>
      <p class="note">P(kondisi | indikator) = P(indikator | kondisi) × P(kondisi) / P(indikator).</p>
      ${mat('like', 'Keandalan: P(indikator | kondisi)', c.table.sample.L, states, inds)}
      ${mat('joint', 'Peluang bersama: P(indikator dan kondisi)', B.joint, states, inds, `<tr class="sum-row"><th scope="row">P(indikator)</th>${B.marginal.map((x) => `<td class="num">${fmtP(x)}</td>`).join('')}</tr>`)}
      ${mat('post', 'Peluang posterior: P(kondisi | indikator)', B.posterior, states, inds)}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Nilai informasi sampel (EVSI)</h2>${copyBtn('evsi')}</div>
      <div class="table-wrap"><table class="data" data-copy="evsi"><thead><tr><th scope="col">Bila indikator</th><th scope="col" class="num">Peluang</th>${names.map((n) => `<th scope="col" class="num">${mx ? 'EV' : 'Biaya'} ${esc(n)}</th>`).join('')}<th scope="col">Keputusan</th></tr></thead>
      <tbody>${sm.perIndicator.map((x) => `<tr><th scope="row">${esc(inds[x.k])}</th><td class="num">${fmtP(x.marginal)}</td>${x.evs.map((v, i) => `<td class="num${x.best.includes(i) ? ' win' : ''}">${fmtV(v)}</td>`).join('')}<td>${esc(x.best.map((i) => names[i]).join(', '))}</td></tr>`).join('')}</tbody></table></div>
      <div class="metric">
        <div><small>EV dengan informasi sampel (EVwSI)</small><strong>${esc(money(sm.evwsi))}</strong><span>${sm.perIndicator.map((x) => `${fmtP(x.marginal)} × ${paren(x.value)}`).join(' + ')}</span></div>
        <div><small>EVSI</small><strong>${esc(money(sm.evsi))}</strong><span>${mx ? 'EVwSI − EV terbaik tanpa informasi' : 'EV tanpa informasi − EVwSI'}</span></div>
        <div><small>Efisiensi informasi</small><strong>${isFinite(sm.efficiency) ? C.pct(sm.efficiency, 1) : '–'}</strong><span>EVSI / EVPI</span></div>
        <div><small>Nilai bersih (EVSI − biaya)</small><strong class="${sm.worthIt ? 'ok-text' : 'bad-text'}">${esc(money(sm.net))}</strong><span>${sm.worthIt ? 'Informasi layak dibeli' : 'Informasi tidak layak dibeli pada biaya ini'}</span></div>
      </div>
    </section>
    <div class="chart-grid one">${chartCard('voi', 'Nilai harapan menurut tingkat informasi', 'Selisih batang kedua dan pertama = EVSI; selisih batang ketiga dan pertama = EVPI.', CH.voi)}</div>`;
    return html + `<div class="step-foot"><button class="btn lg" data-act="goto" data-step="sens">${icon('arrowL')}Sensitivitas</button><button class="btn primary lg" data-act="goto" data-step="report">Laporan & unduh${icon('arrowR')}</button></div>`;
  }

  /* ================================================================== *
   * Langkah 5: Laporan & unduh
   * ================================================================== */

  const CITE = () => `Tarigan, A. G. E. (2026). <i>Decision Tree Calculator</i> (Versi 2.0) [Perangkat lunak]. ${esc(X.TOOL_URL)}`;

  function references(c) {
    const out = [
      'Raiffa, H. (1968). Decision Analysis: Introductory Lectures on Choices under Uncertainty. Addison-Wesley.',
      'Clemen, R. T., & Reilly, T. (2014). Making Hard Decisions with DecisionTools (3rd ed.). Cengage Learning.'
    ];
    if (c.res && c.res.utility.active) out.push('Kirkwood, C. W. (1997). Strategic Decision Making: Multiobjective Decision Analysis with Spreadsheets. Duxbury Press.');
    out.push('Tarigan, A. G. E. (2026). Decision Tree Calculator (Versi 2.0) [Perangkat lunak]. ' + X.TOOL_URL);
    return out;
  }

  function renderReport() {
    const p = S.p;
    const c = comp();
    const dis = c.ok ? '' : 'disabled';
    return `<div class="page-head"><div><h1>Laporan & unduh</h1><p>Semua berkas dibuat di browser Anda. Tidak ada data yang dikirim ke server.</p></div></div>
    ${c.ok ? '' : errorsBanner(c)}
    <section class="panel">
      <div class="panel-head"><h2>Identitas laporan</h2><span class="hint">opsional, tampil di PDF dan Word</span></div>
      <div class="settings two">
        <label class="field"><span>Disusun oleh</span><input type="text" value="${esc(p.meta.author)}" data-bind="meta-author" data-fk="meta-author" maxlength="120" placeholder="Nama / NIM" autocomplete="off"></label>
        <label class="field"><span>Keterangan singkat</span><input type="text" value="${esc(p.meta.description)}" data-bind="meta-desc" data-fk="meta-desc" maxlength="1000" placeholder="Misalnya: studi kasus UMKM, 2026" autocomplete="off"></label>
      </div>
    </section>
    <div class="dl-grid">
      <button class="dl-card primary" data-act="dl-pdf" ${dis}><span class="dl-ic">${icon('file')}</span><span class="dl-text"><b>Laporan PDF lengkap</b><span>Rekomendasi, diagram pohon, kebijakan optimal, langkah rollback, profil risiko, sensitivitas, nilai informasi, dan rujukan.</span></span></button>
      <button class="dl-card" data-act="dl-docx" ${dis}><span class="dl-ic">${icon('doc')}</span><span class="dl-text"><b>Laporan Word (.docx)</b><span>Isi sama dengan PDF dalam bentuk tabel dan gambar bernomor yang bisa disunting.</span></span></button>
      <button class="dl-card" data-act="dl-xlsx" ${dis}><span class="dl-ic">${icon('table')}</span><span class="dl-text"><b>Excel (.xlsx) dengan rumus</b><span>Pohon sebagai tabel simpul dengan rumus rollback (SUMPRODUCT, MAX/MIN) dan variabel bernama; tabel payoff dengan rumus kriteria.</span></span></button>
      <button class="dl-card" data-act="dl-csv" ${dis}><span class="dl-ic">${icon('download')}</span><span class="dl-text"><b>CSV semua jalur</b><span>Jalur, peluang, nilai, dan penanda kebijakan optimal.</span></span></button>
      <button class="dl-card" data-act="dl-json"><span class="dl-ic">${icon('folder')}</span><span class="dl-text"><b>Simpan proyek (.json)</b><span>Buka lagi di perangkat lain lewat tombol Buka.</span></span></button>
    </div>
    <p class="note" id="dl-status" aria-live="polite"></p>
    <section class="panel">
      <div class="panel-head"><h2>Bagikan proyek lewat tautan</h2><span class="hint">tanpa server, tanpa akun</span></div>
      <p class="note">Tautan berisi seluruh model (terkompresi). Penerima membuka tautan dan langsung melihat hasil yang sama.</p>
      <div class="share-row">
        <button class="btn primary" data-act="make-link">${icon('link')}Buat tautan</button>
        <input type="text" readonly id="share-link" value="${esc(S.shareLink)}" placeholder="Tautan muncul di sini" aria-label="Tautan proyek">
        <button class="btn" data-act="copy-link" ${S.shareLink ? '' : 'disabled'}>${icon('copy')}Salin</button>
      </div>
    </section>
    <section class="panel cite">
      <div class="panel-head"><h2>Cara mengutip</h2></div>
      <p>Bila Anda memakai alat ini untuk skripsi, tesis, atau publikasi, cantumkan:</p>
      <blockquote id="cite-text">${CITE()}</blockquote>
      <button class="btn sm" data-act="copy-cite">${icon('copy')}Salin kutipan</button>
      <p class="note">Rujukan metode: Raiffa, H. (1968). <i>Decision Analysis</i>. Addison-Wesley. Clemen, R. T., &amp; Reilly, T. (2014). <i>Making Hard Decisions with DecisionTools</i>. Cengage Learning.</p>
    </section>`;
  }

  function buildReport() {
    const c = comp();
    const t = C.THEMES.light;
    const W = 760;
    const make = (fn) => { try { return fn(W, t); } catch (e) { console.error(e); return null; } };
    const charts = { tree: make(CH.tree(null)), values: make(CH.values), pmf: make(CH.pmf), cdf: make(CH.cdf), payoff: S.p.mode === 'table' ? make(CH.payoff) : null, tornado: make(CH.tornado), spider: make(CH.spider), evpi: S.p.mode === 'tree' ? make(CH.evpi) : null, voi: S.p.mode === 'table' ? make(CH.voi) : null };
    const one = oneWayData();
    if (one) charts.oneWay = make(CH.oneWay);
    const tor = tornadoData();
    return {
      project: S.p, comp: c, dateLabel: today(), verdict: verdictText(c), policy: D.policy(c.res), rollback: rollbackSteps(c), paths: D.paths(c.res), profiles: profiles(c),
      rootValues: D.rootValues(c.res), tornado: tor, oneWay: one, evpi: S.p.mode === 'tree' ? evpiData() : null, charts, references: references(c),
      fmt: { v: fmtV, p: fmtP, money, pct: (x, d) => C.pct(x, d === undefined ? 1 : d), param: fmtParam }
    };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Gagal memuat ' + src + '. Periksa koneksi lalu coba lagi.'));
      document.head.appendChild(s);
    });
  }
  async function loadPdfLib() {
    if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript('assets/vendor/jspdf.umd.min.js');
    if (!window.autoTable && !(window.jspdf_autotable && window.jspdf_autotable.autoTable)) await loadScript('assets/vendor/jspdf.plugin.autotable.min.js');
  }
  async function busy(btn, label, fn) {
    const status = $('#dl-status');
    btn.disabled = true;
    const b = btn.querySelector('b');
    const orig = b.textContent;
    b.textContent = label;
    try { await fn((msg) => { if (status) status.textContent = 'Menyusun bagian: ' + msg; }); if (status) status.textContent = 'Selesai.'; }
    catch (e) { console.error(e); toast('Gagal: ' + e.message, 'error'); if (status) status.textContent = ''; }
    finally { b.textContent = orig; btn.disabled = false; }
  }

  /* ================================================================== *
   * Berkas masuk
   * ================================================================== */

  async function handleFiles(files) {
    for (const file of files) {
      try {
        const obj = JSON.parse(await file.text());
        const p = M.normalizeProject(obj);
        if (!(await confirmBox(`Buka proyek "${p.meta.title}"? Proyek yang sedang terbuka akan diganti. Unduh dulu bila masih diperlukan.`, 'Buka proyek'))) continue;
        S.p = p;
        C.setLocale({ decimalSep: p.settings.decimalSep });
        S.ui.step = 'results';
        resetUi();
        touch(true);
        toast('Proyek dibuka.');
      } catch (e) { toast(`${file.name}: ${e.message || 'berkas tidak dapat dibaca'}`, 'error'); }
    }
  }
  function resetUi() { S.ui.one = null; S.ui.two = null; S.ui.selected = null; }

  /* ================================================================== *
   * Bantuan & contoh
   * ================================================================== */

  function openHelp() {
    openModal(`<h2 class="modal-title">Cara Menggunakan Kalkulator Decision Tree</h2>
      <div class="help">
        <h3>1. Susun pilihan dan kemungkinan hasil</h3>
        <p>Di langkah <b>Model</b>, simpul akar adalah keputusan utama. Setiap cabang adalah pilihan; pilih jenis simpul berikutnya: <b>Keputusan</b> (□, Anda yang memilih), <b>Peluang</b> (○, kejadian tidak pasti dengan peluang), atau <b>Akhir</b> (◁, nilai akhir). Peluang di satu simpul peluang harus berjumlah 100%.</p>
        <h3>2. Isi nilai</h3>
        <p>Isi nilai bersih di simpul akhir (manfaat dikurangi biaya, angka negatif untuk kerugian), atau isi biaya/pendapatan di kolom <b>arus kas</b> cabang. Nilai jalur = jumlah arus kas sepanjang jalur + nilai akhir. Isian boleh berupa rumus, misalnya <code>=0,6*harga - biaya</code>, memakai variabel di panel kanan.</p>
        <h3>3. Baca hasilnya</h3>
        <p>Kalkulator menghitung mundur: simpul peluang = Σ (peluang × nilai), simpul keputusan = nilai terbaik di antara cabangnya. Langkah <b>Hasil</b> menampilkan rekomendasi, kebijakan optimal, profil risiko, dan langkah perhitungan.</p>
        <div class="guide-example"><strong>Contoh kedai:</strong> membuka layanan pesan antar memberi dampak bersih Rp35 juta bila permintaan tinggi (60%) dan rugi Rp5 juta bila rendah (40%). Nilai harapannya (60% × 35) + (40% × −5) = <strong>19 juta</strong>, lebih besar dari tidak membuka layanan (0), sehingga kalkulator merekomendasikan membuka layanan.</div>
        <h3>4. Uji dan laporkan</h3>
        <p><b>Sensitivitas</b>: titik impas, tornado, spider, dan wilayah strategi dua arah. <b>Nilai informasi</b>: EVPI (dan EVSI bila memakai tabel payoff dengan survei). <b>Laporan</b>: PDF, Word, Excel dengan rumus, CSV, JSON, dan tautan.</p>
        <h3>Tabel payoff</h3>
        <p>Untuk soal keputusan satu tahap (alternatif × kondisi), pilih mode <b>Tabel payoff</b>: kalkulator menghitung kriteria maximax, maximin, Hurwicz, Laplace, minimax regret, nilai harapan, EOL, EVPI, serta revisi Bayes dan EVSI bila ada survei. Tabel bisa dijadikan pohon keputusan.</p>
        <h3>Sikap terhadap risiko</h3>
        <p>Nilai harapan cocok untuk pengambil keputusan netral risiko. Bila kerugian besar sangat dihindari, pilih <b>Menghindari risiko</b> dan isi toleransi risiko R (kira-kira jumlah yang Anda rela pertaruhkan dalam undian 50:50 untuk menang R atau kalah R/2). Keputusan lalu memakai utilitas harapan dan <i>certainty equivalent</i>.</p>
        <h3>Catatan penting</h3>
        <p>Nilai harapan adalah rata-rata berbobot peluang, bukan jaminan. Estimasikan peluang dan dampak secara realistis, dan pertimbangkan risiko kerugian terbesar sebelum mengambil keputusan. Semua perhitungan berjalan di browser; proyek tersimpan otomatis di browser ini.</p>
      </div>
      <div class="modal-actions"><button class="btn primary" data-act="close-modal" autofocus>Mengerti</button></div>`, { wide: true });
  }

  function openSamples() {
    openModal(`<h2 class="modal-title">Mulai dari contoh atau proyek kosong</h2>
      <p class="modal-text">Proyek yang sedang terbuka akan diganti. Unduh dulu (.json) bila masih diperlukan.</p>
      <ul class="sample-list">${M.SAMPLE_INFO.map((s) => `<li><button class="sample" data-act="load-sample" data-id="${s.id}"><b>${esc(s.title)}</b><span>${esc(s.text)}</span></button></li>`).join('')}
        <li><button class="sample" data-act="load-sample" data-id="__empty"><b>Proyek kosong</b><span>Satu keputusan dengan dua pilihan untuk diisi sendiri.</span></button></li></ul>
      <div class="modal-actions"><button class="btn" data-act="close-modal">Batal</button></div>`);
  }

  /* ================================================================== *
   * Event: klik
   * ================================================================== */

  async function onClick(e) {
    const nodeEl = e.target.closest && e.target.closest('[data-node]');
    if (nodeEl && nodeEl.closest('.chart-svg')) { focusNode(nodeEl.getAttribute('data-node')); return; }
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const act = t.dataset.act, id = t.dataset.id, p = S.p;
    switch (act) {
      case 'goto': S.ui.step = t.dataset.step; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); $('#main').focus({ preventScroll: true }); break;
      case 'calc': { const c = comp(); S.ui.step = 'results'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); if (!c.ok) toast('Masih ada isian yang perlu diperiksa.', 'error'); break; }
      case 'samples': openSamples(); break;
      case 'load-sample':
        S.p = t.dataset.id === '__empty' ? M.newProject() : M.sampleProject(t.dataset.id);
        C.setLocale({ decimalSep: S.p.settings.decimalSep });
        S.ui.step = t.dataset.id === '__empty' ? 'model' : 'results';
        resetUi(); closeModal(); touch(true);
        toast(t.dataset.id === '__empty' ? 'Proyek kosong dibuat.' : 'Contoh dimuat.');
        break;
      case 'help': openHelp(); break;
      case 'close-modal': closeModal(); break;
      case 'confirm-yes': closeModal(true); break;
      case 'confirm-no': closeModal(false); break;
      case 'open-file': $('#file-input').click(); break;
      case 'save-json': case 'dl-json':
        saveNow();
        X.download(X.safeFileName(p.meta.title, 'json'), M.serialize(p), 'application/json');
        toast('Proyek diunduh.');
        break;
      case 'focus': { const el = $(`[data-fk="${CSS.escape(id)}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); } break; }
      case 'set-mode':
        if (p.mode === id) break;
        p.mode = id; resetUi(); touch(true);
        break;
      case 'b-add': { const f = M.find(p.tree, id); if (f) { const b = M.addBranch(f.node); S.focusKey = 'bn-' + b.id; touch(true); } break; }
      case 'b-del': {
        const f = M.findBranch(p.tree, id);
        if (!f) break;
        const size = M.subtreeSize(f.branch.child);
        if (size > 1 && !(await confirmBox(`Hapus cabang "${f.branch.name}" beserta ${size - 1} simpul di bawahnya?`, 'Hapus', true))) break;
        if (f.parent.branches.length <= 1 && f.parent === p.tree) { toast('Simpul akar perlu minimal satu cabang.', 'error'); break; }
        M.removeBranch(p.tree, id); touch(true);
        break;
      }
      case 'b-up': case 'b-down': if (M.moveBranch(p.tree, id, act === 'b-up' ? -1 : 1)) touch(true); break;
      case 'b-dup': { const b = M.duplicateBranch(p.tree, id); if (b) { S.focusKey = 'bn-' + b.id; touch(true); toast('Cabang disalin beserta subpohonnya.'); } break; }
      case 'var-add': {
        let k = p.variables.length + 1, name = 'var' + k;
        while (p.variables.some((v) => v.name.toLowerCase() === name)) name = 'var' + (++k);
        const v = { id: M.uid('v'), name, value: '0', note: '' };
        p.variables.push(v); S.focusKey = 'vn-' + v.id; touch(true);
        break;
      }
      case 'var-del': p.variables = p.variables.filter((v) => v.id !== id); touch(true); break;
      case 't-aadd': { const a = M.addAlternative(p.table); S.focusKey = 'ta-' + a.id; touch(true); break; }
      case 't-sadd': { const s = M.addState(p.table); S.focusKey = 'ts-' + s.id; touch(true); break; }
      case 't-iadd': { const k = M.addIndicator(p.table); S.focusKey = 'ti-' + k.id; touch(true); break; }
      case 't-adel': M.removeAlternative(p.table, id); touch(true); break;
      case 't-sdel': M.removeState(p.table, id); touch(true); break;
      case 't-idel': M.removeIndicator(p.table, id); touch(true); break;
      case 't-totree': {
        try {
          const tree = M.tableToTreeProject(p);
          if (!(await confirmBox('Salin pohon setara ke mode Pohon keputusan? Pohon yang ada di mode pohon akan diganti.', 'Jadikan pohon'))) break;
          p.tree = tree; p.mode = 'tree'; resetUi(); touch(true);
          toast('Pohon setara dibuat. Peluang posterior ditulis sebagai angka.');
        } catch (err) { toast(err.message, 'error'); }
        break;
      }
      case 'chart-png': exportChart(id, 'png'); break;
      case 'chart-svg': exportChart(id, 'svg'); break;
      case 'chart-table': {
        const fig = t.closest('[data-chart]');
        const box = fig.querySelector('.chart-table');
        box.hidden = !box.hidden;
        t.setAttribute('aria-expanded', String(!box.hidden));
        if (!box.hidden) box.innerHTML = tableHTML(S.charts[id] && S.charts[id].table);
        break;
      }
      case 'copy-table': {
        const tb = $(`table[data-copy="${CSS.escape(id)}"]`);
        if (!tb) break;
        const txt = (cell) => (cell.dataset.t || cell.textContent).replace(/\s+/g, ' ').trim();
        const tsv = Array.from(tb.rows).map((r) => Array.from(r.cells).map(txt).join('\t')).join('\n');
        const html = '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Times New Roman;font-size:10pt">' + Array.from(tb.rows).map((r, ri) => '<tr>' + Array.from(r.cells).map((cell) => { const tag = ri === 0 && tb.tHead ? 'th' : 'td'; return `<${tag}>${esc(txt(cell))}</${tag}>`; }).join('') + '</tr>').join('') + '</table>';
        copyRich(html, tsv, 'Tabel disalin. Tempel di Word atau Excel (sebagai tabel).');
        break;
      }
      case 'sens-tab': S.ui.sensTab = id; render(); break;
      case 'dl-pdf': busy(t, 'Menyusun PDF…', async (tick) => { await loadPdfLib(); const blob = await X.buildPdf(buildReport(), tick); X.download(X.safeFileName(p.meta.title, 'pdf'), blob); toast('Laporan PDF diunduh.'); }); break;
      case 'dl-docx': busy(t, 'Menyusun dokumen…', async (tick) => { const bytes = await X.buildDocx(buildReport(), tick); X.download(X.safeFileName(p.meta.title, 'docx'), new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); toast('Laporan Word diunduh.'); }); break;
      case 'dl-xlsx': busy(t, 'Menyusun Excel…', async () => { const bytes = X.buildXlsx(X.workbookFromReport(buildReport())); X.download(X.safeFileName(p.meta.title, 'xlsx'), new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); toast('Berkas Excel diunduh.'); }); break;
      case 'dl-csv': { const c = comp(); if (!c.ok) break; X.download(X.safeFileName(p.meta.title + '-jalur', 'csv'), X.csvString(X.pathRows(buildReport()), p.settings.decimalSep), 'text/csv'); toast('CSV jalur diunduh.'); break; }
      case 'make-link': {
        try {
          const code = await M.encodePayload(p);
          S.shareLink = location.origin + location.pathname + '#proyek=' + code;
          const inp = $('#share-link'); if (inp) inp.value = S.shareLink;
          const cb = $('[data-act="copy-link"]'); if (cb) cb.disabled = false;
          toast(S.shareLink.length > 8000 ? 'Tautan cukup panjang; bila terpotong di aplikasi chat, kirim berkas .json.' : 'Tautan dibuat.', S.shareLink.length > 8000 ? 'error' : 'info');
        } catch (err) { toast('Gagal membuat tautan: ' + err.message, 'error'); }
        break;
      }
      case 'copy-link': copyText(S.shareLink, 'Tautan disalin.'); break;
      case 'copy-cite': copyText($('#cite-text').innerText, 'Kutipan disalin.'); break;
      default: break;
    }
  }

  function focusNode(nodeId) {
    S.ui.selected = nodeId;
    if (S.p.mode === 'tree' && (S.ui.step !== 'model' || !$(`[data-row-node="${CSS.escape(nodeId)}"]`))) { S.ui.step = 'model'; render(); }
    const row = $(`[data-row-node="${CSS.escape(nodeId)}"]`);
    if (row) {
      $$('.tr-row.sel, .tr-root.sel').forEach((r) => r.classList.remove('sel'));
      row.classList.add('sel');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const inp = $('input', row);
      if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 300);
    }
    const fig = $('[data-chart="tree"]');
    if (fig && S.chartDefs.tree) { S.chartDefs.tree.build = CH.tree(nodeId); mountChart(fig); }
  }

  async function copyRich(html, text, okMsg) {
    try {
      if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('x');
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      toast(okMsg);
    } catch (e) { copyText(text, okMsg); }
  }
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(okMsg); } catch (err) { toast('Salin manual: tekan Ctrl+C.', 'error'); }
      ta.remove();
    }
  }

  /* ================================================================== *
   * Event: input / change / paste
   * ================================================================== */

  function parseUi(raw) {
    try { return D.readField(raw, null, S.p.settings.decimalSep); } catch (e) { return null; }
  }

  function onInput(e) {
    const t = e.target;
    const bind = t.dataset ? t.dataset.bind : null;
    const p = S.p;
    if (t.id === 'project-title') { p.meta.title = t.value.slice(0, 160) || 'Analisis pohon keputusan'; touch(false); document.title = p.meta.title + ' — Kalkulator Decision Tree'; return; }
    if (!bind) return;
    const tree = p.tree, tb = p.table;
    const setBranch = (key, max) => { const f = M.findBranch(tree, t.dataset.id); if (f) { f.branch[key] = t.value.slice(0, max); touch(false); refreshSoon(); } };
    switch (bind) {
      case 'b-name': setBranch('name', 160); break;
      case 'b-prob': setBranch('prob', 200); break;
      case 'b-value': setBranch('value', 200); break;
      case 'n-name': { const f = M.find(tree, t.dataset.id); if (f) { f.node.name = t.value.slice(0, 160); touch(false); refreshSoon(); } break; }
      case 'n-payoff': { const f = M.find(tree, t.dataset.id); if (f) { f.node.payoff = t.value.slice(0, 200); touch(false); refreshSoon(); } break; }
      case 'var-name': case 'var-value': case 'var-note': {
        const v = p.variables.find((x) => x.id === t.dataset.id);
        if (!v) break;
        if (bind === 'var-name') v.name = t.value.trim().slice(0, 32);
        else if (bind === 'var-value') v.value = t.value.slice(0, 200);
        else v.note = t.value.slice(0, 160);
        touch(false); refreshSoon();
        break;
      }
      case 'set-unit': p.settings.unit = t.value.slice(0, 40); touch(false); refreshSoon(); break;
      case 'set-R': p.settings.risk.R = t.value.slice(0, 40); touch(false); refreshSoon(); break;
      case 't-dlabel': tb.decisionLabel = t.value.slice(0, 80); touch(false); refreshSoon(); break;
      case 't-slabel': tb.stateLabel = t.value.slice(0, 80); touch(false); refreshSoon(); break;
      case 't-sname': { const s = tb.states.find((x) => x.id === t.dataset.id); if (s) { s.name = t.value.slice(0, 80); touch(false); refreshSoon(); } break; }
      case 't-sprob': { const s = tb.states.find((x) => x.id === t.dataset.id); if (s) { s.prob = t.value.slice(0, 200); touch(false); refreshSoon(); } break; }
      case 't-aname': { const a = tb.alternatives.find((x) => x.id === t.dataset.id); if (a) { a.name = t.value.slice(0, 160); touch(false); refreshSoon(); } break; }
      case 't-pay': tb.payoffs[t.dataset.a][t.dataset.s] = t.value.slice(0, 200); touch(false); refreshSoon(); break;
      case 't-alpha': tb.alpha = t.value.slice(0, 40); touch(false); refreshSoon(); break;
      case 't-smname': tb.sample.name = t.value.slice(0, 80); touch(false); refreshSoon(); break;
      case 't-smcost': tb.sample.cost = t.value.slice(0, 200); touch(false); refreshSoon(); break;
      case 't-iname': { const k = tb.sample.indicators.find((x) => x.id === t.dataset.id); if (k) { k.name = t.value.slice(0, 80); touch(false); refreshSoon(); } break; }
      case 't-like': (tb.sample.likelihood[t.dataset.s] = tb.sample.likelihood[t.dataset.s] || {})[t.dataset.k] = t.value.slice(0, 200); touch(false); refreshSoon(); break;
      case 'meta-author': p.meta.author = t.value.slice(0, 120); touch(false); break;
      case 'meta-desc': p.meta.description = t.value.slice(0, 1000); touch(false); break;
      default: break;
    }
  }

  function readRangeInput(raw, prm) {
    const r = parseUi(raw);
    if (!r || r.v === null || !isFinite(r.v)) return NaN;
    return prm.kind === 'prob' && pctMode() && !r.pct ? r.v / 100 : r.v;
  }

  function onChange(e) {
    const t = e.target;
    const p = S.p;
    if (t.id === 'file-input') { handleFiles(Array.from(t.files || [])); t.value = ''; return; }
    const bind = t.dataset ? t.dataset.bind : null;
    if (!bind) return;
    switch (bind) {
      case 'n-type': {
        const f = M.find(p.tree, t.dataset.id);
        if (!f) break;
        const n = f.node;
        if (t.value === 'terminal' && n.branches.length) {
          const size = M.subtreeSize(n) - 1;
          if (!window.confirm(`Ubah menjadi simpul akhir? ${size} simpul di bawahnya akan dihapus.`)) { t.value = n.type; break; }
        }
        M.setType(n, t.value);
        S.focusKey = t.dataset.fk;
        touch(true);
        break;
      }
      case 'set-objective': p.settings.objective = t.value; if (t.value === 'min') p.settings.risk.mode = 'neutral'; touch(true); break;
      case 'set-prob': {
        const from = p.settings.probFormat, to = t.value;
        p.settings.probFormat = to;
        convertProbFormat(from, to);
        touch(true);
        toast(to === 'percent' ? 'Peluang angka dikonversi ke persen.' : 'Peluang angka dikonversi ke desimal.');
        break;
      }
      case 'set-dec': p.settings.decimals = Number(t.value); touch(true); break;
      case 'set-sep': convertSeparator(p.settings.decimalSep, t.value); p.settings.decimalSep = t.value; C.setLocale({ decimalSep: t.value }); touch(true); break;
      case 'set-risk': p.settings.risk.mode = t.value; if (t.value !== 'neutral' && !(parseUi(p.settings.risk.R) || {}).v) p.settings.risk.R = '100'; touch(true); break;
      case 't-smon': p.table.sample.enabled = t.checked; touch(true); break;
      case 'one-key': { const prm = params().find((x) => x.key === t.value); const r = defaultRange(prm); S.ui.one = { key: prm.key, lo: r[0], hi: r[1] }; render(); break; }
      case 'one-lo': case 'one-hi': {
        const u = S.ui.one, prm = params().find((x) => x.key === u.key);
        const v = readRangeInput(t.value, prm);
        if (!isFinite(v)) { toast('Isi batas dengan angka.', 'error'); break; }
        if (bind === 'one-lo') u.lo = v; else u.hi = v;
        if (u.lo >= u.hi) { toast('Batas bawah harus lebih kecil dari batas atas.', 'error'); [u.lo, u.hi] = defaultRange(prm); }
        if (prm.kind === 'prob') { u.lo = Math.max(0, u.lo); u.hi = Math.min(1, u.hi); }
        render();
        break;
      }
      case 'sens-pct': case 'sens-pd': {
        const r = parseUi(t.value);
        const v = r && r.v;
        if (!(v > 0)) { toast('Isi angka lebih dari 0.', 'error'); break; }
        if (bind === 'sens-pct') p.settings.sens.pct = Math.min(100, v); else p.settings.sens.probDelta = Math.min(50, v);
        S.extraCache = null; scheduleSave(); render();
        break;
      }
      case 'two-k1': case 'two-k2': {
        const prm = params().find((x) => x.key === t.value);
        const u = S.ui.two;
        if (bind === 'two-k1') { u.k1 = prm.key; u.r1 = defaultRange(prm); } else { u.k2 = prm.key; u.r2 = defaultRange(prm); }
        if (u.k1 === u.k2) { toast('Pilih dua parameter yang berbeda.', 'error'); S.ui.two = null; }
        render();
        break;
      }
      case 'two1-lo': case 'two1-hi': case 'two2-lo': case 'two2-hi': {
        const u = S.ui.two;
        const which = bind.startsWith('two1') ? 1 : 2;
        const prm = params().find((x) => x.key === (which === 1 ? u.k1 : u.k2));
        const v = readRangeInput(t.value, prm);
        if (!isFinite(v)) { toast('Isi batas dengan angka.', 'error'); break; }
        const r = which === 1 ? u.r1 : u.r2;
        if (bind.endsWith('lo')) r[0] = v; else r[1] = v;
        if (r[0] >= r[1]) { toast('Batas bawah harus lebih kecil dari batas atas.', 'error'); const d = defaultRange(prm); r[0] = d[0]; r[1] = d[1]; }
        if (prm.kind === 'prob') { r[0] = Math.max(0, r[0]); r[1] = Math.min(1, r[1]); }
        render();
        break;
      }
      case 'b-name': case 'n-name': case 't-aname': case 't-sname':
        if (!t.value.trim() && bind === 't-aname') { t.value = 'Alternatif'; onInput({ target: t }); }
        break;
      default: break;
    }
  }

  /** Ubah peluang berupa angka biasa antara persen dan desimal saat format diganti. */
  function convertProbFormat(from, to) {
    if (from === to) return;
    const k = to === 'percent' ? 100 : 0.01;
    const conv = (raw) => {
      if (raw === null || raw === undefined || D.isFormula(raw)) return raw;
      const s = String(raw).trim();
      if (!s || /%$/.test(s)) return raw;
      const v = D.parseNumber(s, S.p.settings.decimalSep);
      if (v === null || !isFinite(v)) return raw;
      return rawNum(+(v * k).toPrecision(12));
    };
    D.walkTree(S.p.tree, (n) => { (n.branches || []).forEach((b) => { if (n.type === 'chance') b.prob = conv(b.prob); }); });
    S.p.table.states.forEach((s) => { s.prob = conv(s.prob); });
    Object.values(S.p.table.sample.likelihood).forEach((row) => Object.keys(row).forEach((k2) => { row[k2] = conv(row[k2]); }));
  }

  /** Tulis ulang angka biasa (bukan rumus) dengan pemisah desimal yang baru, mis. "1.500" (koma) → "1500" (titik). */
  function convertSeparator(from, to) {
    if (from === to) return;
    const conv = (raw) => {
      if (raw === null || raw === undefined || typeof raw !== 'string' || D.isFormula(raw)) return raw;
      const st = raw.trim();
      if (!st) return raw;
      const pct = /%$/.test(st);
      const v = D.parseNumber(pct ? st.slice(0, -1) : st, from);
      if (v === null || !isFinite(v)) return raw;
      const out = String(+v.toPrecision(15));
      return (to === ',' ? out.replace('.', ',') : out) + (pct ? '%' : '');
    };
    const p = S.p;
    D.walkTree(p.tree, (n, parent, b) => { if (b) { b.prob = conv(b.prob); b.value = conv(b.value); } if (n.type === 'terminal') n.payoff = conv(n.payoff); });
    p.variables.forEach((v) => { v.value = conv(v.value); });
    const t = p.table;
    t.states.forEach((st) => { st.prob = conv(st.prob); });
    Object.values(t.payoffs).forEach((row) => Object.keys(row).forEach((k) => { row[k] = conv(row[k]); }));
    Object.values(t.sample.likelihood).forEach((row) => Object.keys(row).forEach((k) => { row[k] = conv(row[k]); }));
    t.alpha = conv(t.alpha);
    t.sample.cost = conv(t.sample.cost);
    p.settings.risk.R = conv(p.settings.risk.R);
  }

  function onPaste(e) {
    const t = e.target;
    if (!t.dataset || t.dataset.bind !== 't-pay') return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text || !/[\t\n\r]/.test(text.trim())) return;
    e.preventDefault();
    const rows = text.replace(/\r\n?/g, '\n').split('\n').filter((l, i, a) => l.trim() || i < a.length - 1).map((l) => l.split('\t'));
    const tb = S.p.table;
    const i0 = Number(t.dataset.i), j0 = Number(t.dataset.j);
    let added = 0, cut = 0;
    rows.forEach((row, di) => {
      if (!row.some((c) => c.trim())) return;
      const i = i0 + di;
      while (i >= tb.alternatives.length) { M.addAlternative(tb); added++; }
      row.forEach((cell, dj) => {
        const j = j0 + dj;
        if (j >= tb.states.length) { if (cell.trim()) cut++; return; }
        tb.payoffs[tb.alternatives[i].id][tb.states[j].id] = cell.trim();
      });
    });
    S.focusKey = t.dataset.fk;
    touch(true);
    toast(`${rows.length} baris ditempel${added ? `, ${added} alternatif baru` : ''}${cut ? `, ${cut} sel di luar kolom kondisi diabaikan` : ''}.`, cut ? 'error' : 'info');
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && !$('#modal').hidden) { closeModal(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault(); saveNow();
      X.download(X.safeFileName(S.p.meta.title, 'json'), M.serialize(S.p), 'application/json');
      toast('Proyek diunduh.');
    }
  }

  function onPointerMove(e) {
    const tipT = e.target.closest && e.target.closest('[data-tip]');
    if (tipT && tipT.closest('.chart-svg')) { showTip(tipT, e.clientX, e.clientY); return; }
    hideTip();
  }

  /* ================================================================== *
   * Inisialisasi
   * ================================================================== */

  async function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('pointermove', onPointerMove);
    document.documentElement.addEventListener('mouseleave', hideTip);
    window.addEventListener('scroll', hideTip, { passive: true, capture: true });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('#modal-close')) closeModal(); });
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
    document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dropping'); });
    document.addEventListener('dragleave', (e) => { if (e.target === document.documentElement || e.clientX <= 0) document.body.classList.remove('dropping'); });
    document.addEventListener('drop', (e) => { e.preventDefault(); document.body.classList.remove('dropping'); if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files)); });
    let resizeTimer = null, lastW = window.innerWidth;
    window.addEventListener('resize', () => {
      if (Math.abs(window.innerWidth - lastW) < 8) return;
      lastW = window.innerWidth;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => mountCharts(document), 180);
    });

    const hash = location.hash || '';
    const params0 = new URLSearchParams(location.search);
    const saved = M.loadLocal();
    try {
      if (/^#proyek=/.test(hash)) {
        const linked = M.normalizeProject(await M.decodePayload(hash));
        history.replaceState(null, '', location.pathname + location.search);
        if (saved && JSON.stringify(saved.tree) !== JSON.stringify(linked.tree)) {
          S.p = saved;
          setTimeout(() => toast(`Tautan berisi proyek "${linked.meta.title}". Proyek Anda saat ini tetap dibuka.`, 'info', { label: 'Buka proyek tautan', run: () => { S.p = linked; C.setLocale({ decimalSep: linked.settings.decimalSep }); S.ui.step = 'results'; resetUi(); touch(true); } }), 50);
        } else { S.p = linked; S.ui.step = 'results'; }
      } else if (params0.get('contoh')) {
        const id = params0.get('contoh');
        history.replaceState(null, '', location.pathname);
        if (saved) { S.p = saved; setTimeout(() => toast('Proyek terakhir Anda tetap dibuka.', 'info', { label: 'Buka contoh', run: () => { S.p = M.sampleProject(id); S.ui.step = 'results'; resetUi(); touch(true); } }), 50); }
        else { S.p = M.sampleProject(id); S.ui.step = 'results'; }
      } else S.p = saved || M.sampleProject('kedai');
    } catch (e) {
      console.error(e);
      S.p = saved || M.sampleProject('kedai');
      setTimeout(() => toast('Tautan tidak dapat dibuka: ' + e.message, 'error'), 50);
    }
    C.setLocale({ decimalSep: S.p.settings.decimalSep });
    render();
    saveNow();
  }

  window.DTApp = { state: S, render, comp, buildReport, params, evaluator };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
