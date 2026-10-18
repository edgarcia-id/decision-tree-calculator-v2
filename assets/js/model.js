/*!
 * Decision Tree Calculator — model proyek, contoh kasus, operasi pohon, perhitungan proyek
 * (c) 2026 Alfredo Garcia — MIT License
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dt-core.js'));
  else root.DTModel = factory(root.DTCore);
}(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const APP_ID = 'decision-tree-calculator';
  const VERSION = 2;
  const STORAGE_KEY = 'dtree-engine:v2:project';

  const TYPES = { decision: 'Keputusan', chance: 'Peluang', terminal: 'Akhir' };
  const RISK_MODES = { neutral: 'Netral (nilai harapan)', averse: 'Menghindari risiko', seeking: 'Menyukai risiko' };
  const DEFAULT_SETTINGS = { objective: 'max', unit: 'juta rupiah', decimals: 2, decimalSep: ',', probFormat: 'percent', risk: { mode: 'neutral', R: '100' }, sens: { pct: 20, probDelta: 10 } };

  let counter = 0;
  function uid(prefix) {
    counter = (counter + 1) % 1e6;
    return (prefix || 'x') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6) + counter.toString(36);
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const str = (v, max, fallback) => {
    const s = typeof v === 'string' ? v : (v === null || v === undefined ? '' : String(v));
    return (s.trim() ? s : (fallback || '')).slice(0, max || 160);
  };
  const rawField = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : String(v).slice(0, 200));

  /* ------------------------------------------------------------------ *
   * Simpul & cabang
   * ------------------------------------------------------------------ */

  function node(type, name, extra) {
    const n = { id: uid('n'), type, name: name || '', branches: [] };
    if (type === 'terminal') n.payoff = extra && extra.payoff !== undefined ? rawField(extra.payoff) : '0';
    return n;
  }
  function branch(name, child, prob, value) {
    return { id: uid('b'), name: name || '', prob: rawField(prob === undefined ? '' : prob), value: rawField(value === undefined ? '' : value), child: child || node('terminal', '') };
  }
  /** Bangun pohon dari spesifikasi ringkas (untuk contoh). */
  function T(type, name, branches, payoff) {
    const n = node(type, name, { payoff });
    n.branches = (branches || []).map(([bname, prob, value, child]) => branch(bname, child, prob, value));
    return n;
  }
  const end = (payoff, name) => T('terminal', name || '', [], payoff);

  function newTree() {
    return T('decision', 'Keputusan', [
      ['Pilihan 1', '', '', T('chance', 'Kondisi', [['Baik', '50', '', end('100')], ['Buruk', '50', '', end('-20')]])],
      ['Pilihan 2', '', '', end('0')]
    ]);
  }

  function newTable() {
    const a = [{ id: uid('a'), name: 'Alternatif 1' }, { id: uid('a'), name: 'Alternatif 2' }, { id: uid('a'), name: 'Alternatif 3' }];
    const s = [{ id: uid('s'), name: 'Kondisi baik', prob: '50' }, { id: uid('s'), name: 'Kondisi buruk', prob: '50' }];
    const payoffs = {};
    a.forEach((x) => { payoffs[x.id] = {}; s.forEach((y) => { payoffs[x.id][y.id] = ''; }); });
    return { decisionLabel: 'Keputusan', stateLabel: 'Kondisi', alternatives: a, states: s, payoffs, alpha: '0,5', sample: newSample(s) };
  }
  function newSample(states) {
    const ind = [{ id: uid('i'), name: 'Hasil positif' }, { id: uid('i'), name: 'Hasil negatif' }];
    const likelihood = {};
    (states || []).forEach((s) => { likelihood[s.id] = {}; ind.forEach((k) => { likelihood[s.id][k.id] = ''; }); });
    return { enabled: false, name: 'survei', cost: '0', indicators: ind, likelihood };
  }

  function newProject() {
    const now = new Date().toISOString();
    return {
      app: APP_ID, version: VERSION,
      meta: { title: 'Analisis pohon keputusan', author: '', description: '', createdAt: now, updatedAt: now },
      mode: 'tree',
      settings: clone(DEFAULT_SETTINGS),
      variables: [],
      tree: newTree(),
      table: newTable()
    };
  }

  /* ------------------------------------------------------------------ *
   * Normalisasi (berkas, penyimpanan, tautan)
   * ------------------------------------------------------------------ */

  function normalizeTree(t, seen, depth) {
    if (!t || typeof t !== 'object') return node('terminal', '');
    if (depth > 40) throw new Error('Pohon terlalu dalam (lebih dari 40 tingkat).');
    const okId = (id, p) => { let s = typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : uid(p); while (seen.has(s)) s = uid(p); seen.add(s); return s; };
    const type = TYPES[t.type] ? t.type : 'terminal';
    const n = { id: okId(t.id, 'n'), type, name: str(t.name, 160), branches: [] };
    if (type === 'terminal') { n.payoff = rawField(t.payoff === undefined ? '0' : t.payoff); return n; }
    n.branches = (Array.isArray(t.branches) ? t.branches : []).slice(0, 40).map((b) => ({
      id: okId(b && b.id, 'b'), name: str(b && b.name, 160), prob: rawField(b && b.prob), value: rawField(b && b.value),
      child: normalizeTree(b && b.child, seen, depth + 1)
    }));
    return n;
  }

  function normalizeTable(t) {
    const base = newTable();
    if (!t || typeof t !== 'object') return base;
    const seen = new Set();
    const okId = (id, p) => { let s = typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : uid(p); while (seen.has(s)) s = uid(p); seen.add(s); return s; };
    const alts = (Array.isArray(t.alternatives) ? t.alternatives : []).slice(0, 30).map((a, i) => ({ id: okId(a && a.id, 'a'), name: str(a && a.name, 160, 'Alternatif ' + (i + 1)) }));
    const states = (Array.isArray(t.states) ? t.states : []).slice(0, 30).map((s, i) => ({ id: okId(s && s.id, 's'), name: str(s && s.name, 160, 'Kondisi ' + (i + 1)), prob: rawField(s && s.prob) }));
    const payoffs = {};
    alts.forEach((a) => { payoffs[a.id] = {}; states.forEach((s) => { payoffs[a.id][s.id] = rawField(t.payoffs && t.payoffs[a.id] && t.payoffs[a.id][s.id]); }); });
    const sm = t.sample && typeof t.sample === 'object' ? t.sample : {};
    const inds = (Array.isArray(sm.indicators) ? sm.indicators : base.sample.indicators).slice(0, 12).map((k, i) => ({ id: okId(k && k.id, 'i'), name: str(k && k.name, 160, 'Indikator ' + (i + 1)) }));
    const likelihood = {};
    states.forEach((s) => { likelihood[s.id] = {}; inds.forEach((k) => { likelihood[s.id][k.id] = rawField(sm.likelihood && sm.likelihood[s.id] && sm.likelihood[s.id][k.id]); }); });
    return {
      decisionLabel: str(t.decisionLabel, 80, 'Keputusan'), stateLabel: str(t.stateLabel, 80, 'Kondisi'),
      alternatives: alts.length ? alts : base.alternatives, states: states.length ? states : base.states,
      payoffs: alts.length ? payoffs : base.payoffs, alpha: rawField(t.alpha === undefined ? '0,5' : t.alpha),
      sample: { enabled: !!sm.enabled, name: str(sm.name, 80, 'survei'), cost: rawField(sm.cost === undefined ? '0' : sm.cost), indicators: inds, likelihood }
    };
  }

  function normalizeProject(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Berkas proyek tidak valid.');
    if (obj.app && obj.app !== APP_ID) throw new Error('Berkas ini bukan proyek Decision Tree Calculator.');
    if (!obj.tree && !obj.table) throw new Error('Berkas proyek tidak memuat pohon atau tabel payoff.');
    const p = newProject();
    p.meta = {
      title: str(obj.meta && obj.meta.title, 160, 'Analisis pohon keputusan'), author: str(obj.meta && obj.meta.author, 120),
      description: str(obj.meta && obj.meta.description, 1000),
      createdAt: (obj.meta && obj.meta.createdAt) || p.meta.createdAt, updatedAt: (obj.meta && obj.meta.updatedAt) || p.meta.updatedAt
    };
    p.mode = obj.mode === 'table' ? 'table' : 'tree';
    const s = obj.settings || {};
    p.settings = {
      objective: s.objective === 'min' ? 'min' : 'max',
      unit: str(s.unit, 40),
      decimals: [0, 1, 2, 3, 4].includes(Number(s.decimals)) ? Number(s.decimals) : 2,
      decimalSep: s.decimalSep === '.' ? '.' : ',',
      probFormat: s.probFormat === 'decimal' ? 'decimal' : 'percent',
      risk: { mode: RISK_MODES[s.risk && s.risk.mode] ? s.risk.mode : 'neutral', R: rawField(s.risk && s.risk.R !== undefined ? s.risk.R : '100') },
      sens: { pct: clampNum(s.sens && s.sens.pct, 1, 100, 20), probDelta: clampNum(s.sens && s.sens.probDelta, 1, 50, 10) }
    };
    const vseen = new Set();
    p.variables = (Array.isArray(obj.variables) ? obj.variables : []).slice(0, 60).filter((v) => v && D.VAR_RE.test(v.name || '') && !vseen.has(String(v.name).toLowerCase()) && vseen.add(String(v.name).toLowerCase())).map((v) => ({ id: typeof v.id === 'string' ? v.id : uid('v'), name: v.name, value: rawField(v.value), note: str(v.note, 160) }));
    p.tree = obj.tree ? normalizeTree(obj.tree, new Set(), 0) : newTree();
    p.table = normalizeTable(obj.table);
    return p;
  }
  function clampNum(v, lo, hi, def) { const n = Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; }

  function serialize(p) { return JSON.stringify(p, null, 2); }
  function saveLocal(p, storage) { try { (storage || localStorage).setItem(STORAGE_KEY, JSON.stringify(p)); return true; } catch (e) { return false; } }
  function loadLocal(storage) { try { const s = (storage || localStorage).getItem(STORAGE_KEY); return s ? normalizeProject(JSON.parse(s)) : null; } catch (e) { return null; } }

  /* ------------------------------------------------------------------ *
   * Operasi pohon
   * ------------------------------------------------------------------ */

  /** Cari simpul; kembalikan {node, parent, branch, index, depth}. */
  function find(tree, nodeId) {
    let hit = null;
    (function rec(n, parent, br, idx, depth) {
      if (hit) return;
      if (n.id === nodeId) { hit = { node: n, parent, branch: br, index: idx, depth }; return; }
      (n.branches || []).forEach((b, i) => rec(b.child, n, b, i, depth + 1));
    }(tree, null, null, -1, 0));
    return hit;
  }
  function findBranch(tree, branchId) {
    let hit = null;
    (function rec(n) {
      if (hit) return;
      (n.branches || []).forEach((b, i) => { if (b.id === branchId) hit = { parent: n, branch: b, index: i }; else rec(b.child); });
    }(tree));
    return hit;
  }

  function addBranch(nodeObj, probFormat) {
    if (nodeObj.type === 'terminal') return null;
    const k = nodeObj.branches.length + 1;
    const b = branch(nodeObj.type === 'chance' ? 'Hasil ' + k : 'Pilihan ' + k, end('0'), '', '');
    nodeObj.branches.push(b);
    return b;
  }

  /** Ubah jenis simpul. Dari akhir → keputusan/peluang: tambah 2 cabang. Ke akhir: buang subpohon. */
  function setType(nodeObj, type) {
    if (nodeObj.type === type) return;
    const from = nodeObj.type;
    nodeObj.type = type;
    if (type === 'terminal') {
      const keep = nodeObj.payoff;
      nodeObj.branches = [];
      nodeObj.payoff = keep !== undefined ? keep : '0';
      return;
    }
    delete nodeObj.payoff;
    if (from === 'terminal' || !nodeObj.branches.length) {
      nodeObj.branches = [];
      addBranch(nodeObj); addBranch(nodeObj);
      if (type === 'chance') nodeObj.branches.forEach((b) => { b.prob = ''; });
    }
    if (type === 'decision') nodeObj.branches.forEach((b) => { b.prob = ''; });
    if (!nodeObj.name) nodeObj.name = type === 'chance' ? 'Kondisi' : 'Keputusan';
  }

  function removeBranch(tree, branchId) {
    const f = findBranch(tree, branchId);
    if (!f) return false;
    f.parent.branches.splice(f.index, 1);
    return true;
  }
  function moveBranch(tree, branchId, dir) {
    const f = findBranch(tree, branchId);
    if (!f) return false;
    const j = f.index + dir;
    if (j < 0 || j >= f.parent.branches.length) return false;
    const arr = f.parent.branches;
    [arr[f.index], arr[j]] = [arr[j], arr[f.index]];
    return true;
  }
  /** Salin cabang beserta subpohonnya (id baru) tepat di bawahnya. */
  function duplicateBranch(tree, branchId) {
    const f = findBranch(tree, branchId);
    if (!f) return null;
    const copy = clone(f.branch);
    (function reid(b) { b.id = uid('b'); (function rn(n) { n.id = uid('n'); (n.branches || []).forEach((x) => { x.id = uid('b'); rn(x.child); }); }(b.child)); }(copy));
    copy.name = copy.name ? copy.name + ' (salinan)' : '';
    f.parent.branches.splice(f.index + 1, 0, copy);
    return copy;
  }
  function subtreeSize(n) { let c = 0; D.walkTree(n, () => { c++; }); return c; }

  /* ------------------------------------------------------------------ *
   * Perhitungan proyek
   * ------------------------------------------------------------------ */

  function riskOf(p) {
    const r = p.settings.risk;
    if (!r || r.mode === 'neutral' || p.settings.objective === 'min') return { mode: 'neutral' };
    let R = NaN;
    try { R = D.readField(r.R, null, p.settings.decimalSep).v; } catch (e) { R = NaN; }
    return { mode: r.mode, R };
  }

  function variableErrors(p, scope) {
    const errs = [];
    for (const v of p.variables) {
      if (!D.VAR_RE.test(v.name || '')) { errs.push({ varId: v.id, field: 'name', msg: 'Nama variabel hanya huruf, angka, dan _ (diawali huruf).' }); continue; }
      if (D.FUNCS[v.name.toLowerCase()]) { errs.push({ varId: v.id, field: 'name', msg: `"${v.name}" adalah nama fungsi.` }); continue; }
      try { scope.get(v.name); } catch (e) { errs.push({ varId: v.id, field: 'value', msg: e.message }); }
    }
    const names = p.variables.map((v) => String(v.name).toLowerCase());
    names.forEach((n, i) => { if (n && names.indexOf(n) !== i) errs.push({ varId: p.variables[i].id, field: 'name', msg: 'Nama variabel ganda.' }); });
    return errs;
  }

  /** Baca tabel payoff menjadi angka. overrides: 'tp:<state>', 'tv:<alt>:<state>', 'tc', 'var:<nama>'. */
  function tableValues(p, scope, ov) {
    const t = p.table, sep = p.settings.decimalSep;
    const errors = [];
    const read = (raw, where, emptyAs) => {
      try {
        const r = D.readField(raw, scope, sep);
        if (r.v === null) { if (emptyAs !== undefined) return { v: emptyAs }; errors.push(Object.assign({ msg: 'Belum diisi.' }, where)); return { v: NaN }; }
        return r;
      } catch (e) { errors.push(Object.assign({ msg: e.message }, where)); return { v: NaN }; }
    };
    const asProb = (r) => (r.pct || r.v === null || !isFinite(r.v) ? r.v : (p.settings.probFormat === 'percent' ? r.v / 100 : r.v));
    const M = t.alternatives.map((a) => t.states.map((s) => {
      const key = 'tv:' + a.id + ':' + s.id;
      if (ov && ov.has(key)) return ov.get(key);
      return read(t.payoffs[a.id] && t.payoffs[a.id][s.id], { altId: a.id, stateId: s.id, field: 'payoff' }).v;
    }));
    let prior = t.states.map((s) => asProb(read(s.prob, { stateId: s.id, field: 'prob' })));
    const ovIdx = t.states.map((s, j) => (ov && ov.has('tp:' + s.id) ? j : -1)).filter((j) => j >= 0);
    if (ovIdx.length) {
      const fixed = D.sum(ovIdx.map((j) => ov.get('tp:' + t.states[j].id)));
      const others = prior.map((x, j) => (ovIdx.includes(j) ? 0 : x));
      const base = D.sum(others);
      const n0 = prior.length - ovIdx.length;
      prior = prior.map((x, j) => (ovIdx.includes(j) ? ov.get('tp:' + t.states[j].id) : (base > D.EPS ? x * (1 - fixed) / base : (1 - fixed) / n0)));
    }
    const probErrors = [];
    if (prior.every(isFinite)) {
      const total = D.sum(prior);
      if (Math.abs(total - 1) > D.PROB_TOL) probErrors.push({ field: 'probsum', msg: `Jumlah peluang kondisi = ${+(total * (p.settings.probFormat === 'percent' ? 100 : 1)).toFixed(6)}${p.settings.probFormat === 'percent' ? '%' : ''}; harus ${p.settings.probFormat === 'percent' ? '100%' : '1'}.` });
      prior.forEach((x, j) => { if (x < -D.PROB_TOL || x > 1 + D.PROB_TOL) probErrors.push({ stateId: t.states[j].id, field: 'prob', msg: 'Peluang harus di antara 0 dan 1.' }); });
    }
    errors.push(...probErrors);
    let alpha = read(t.alpha, { field: 'alpha' }, 0.5).v;
    if (isFinite(alpha) && (alpha < 0 || alpha > 1)) { errors.push({ field: 'alpha', msg: 'Koefisien optimisme α harus di antara 0 dan 1.' }); alpha = 0.5; }
    let sample = null;
    if (t.sample.enabled) {
      const sm = t.sample;
      const cost = ov && ov.has('tc') ? ov.get('tc') : read(sm.cost, { field: 'cost' }, 0).v;
      const L = t.states.map((s) => sm.indicators.map((k) => asProb(read(sm.likelihood[s.id] && sm.likelihood[s.id][k.id], { stateId: s.id, indId: k.id, field: 'likelihood' }))));
      L.forEach((row, j) => {
        if (row.every(isFinite) && Math.abs(D.sum(row) - 1) > D.PROB_TOL) errors.push({ stateId: t.states[j].id, field: 'likesum', msg: `Peluang indikator bila "${t.states[j].name}" berjumlah ${+(D.sum(row) * (p.settings.probFormat === 'percent' ? 100 : 1)).toFixed(6)}${p.settings.probFormat === 'percent' ? '%' : ''}; harus ${p.settings.probFormat === 'percent' ? '100%' : '1'}.` });
      });
      if (sm.indicators.length < 2) errors.push({ field: 'indicators', msg: 'Informasi sampel membutuhkan minimal 2 indikator.' });
      sample = { name: sm.name || 'survei', cost, indicators: sm.indicators, L };
    }
    if (t.alternatives.length < 1) errors.push({ field: 'alternatives', msg: 'Tambahkan minimal 1 alternatif.' });
    if (t.states.length < 1) errors.push({ field: 'states', msg: 'Tambahkan minimal 1 kondisi.' });
    return { errors, M, prior, alpha, sample };
  }

  /**
   * Hitung proyek. Mengembalikan:
   *  {ok, errors, mode, tree (pohon yang dievaluasi), res (hasil evaluateTree), criteria?, sample?, table?}
   * opts.noSample: abaikan informasi sampel (dipakai analisis sensitivitas mode tabel).
   */
  function compute(p, overrides, opts) {
    opts = opts || {};
    const sep = p.settings.decimalSep;
    const objective = p.settings.objective;
    const risk = riskOf(p);
    const scope = D.makeScope(p.variables, sep, overrides);
    const varErrs = overrides && overrides.size ? [] : variableErrors(p, scope);
    const riskErr = risk.mode !== 'neutral' && !(risk.R > 0) ? [{ field: 'riskR', msg: 'Toleransi risiko R harus angka lebih dari 0.' }] : [];
    if (p.mode === 'table') {
      const tv = tableValues(p, scope, overrides);
      const errors = varErrs.concat(riskErr, tv.errors);
      if (errors.length) return { ok: false, errors, mode: 'table', table: tv };
      const t = p.table;
      const spec = { alternatives: t.alternatives, states: t.states, M: tv.M, prior: tv.prior, stateLabel: t.stateLabel, decisionLabel: t.decisionLabel, sample: opts.noSample ? null : tv.sample };
      const tree = D.tableToTree(spec);
      const res = D.evaluateTree(tree, { sep, objective, risk });
      const criteria = D.payoffCriteria(tv.M, tv.prior, { objective, alpha: tv.alpha });
      const sample = tv.sample && !opts.noSample ? D.evsi(tv.M, tv.prior, tv.sample.L, { objective, alpha: tv.alpha, cost: tv.sample.cost }) : null;
      return { ok: res.ok, errors: res.errors, mode: 'table', tree, res, criteria, sample, table: tv };
    }
    const res = D.evaluateTree(p.tree, { scope, sep, probPercent: p.settings.probFormat === 'percent', objective, risk, overrides });
    const errors = varErrs.concat(riskErr, res.errors);
    return { ok: errors.length === 0, errors, mode: 'tree', tree: p.tree, res };
  }

  /** Fungsi evaluasi untuk analisis sensitivitas: overrides → {values, best, names} | null. */
  function evaluator(p) {
    return (ov) => {
      const c = compute(p, ov, { noSample: true });
      return c.ok ? D.rootValues(c.res) : null;
    };
  }

  /** Parameter yang dapat diuji sensitivitasnya. */
  function parameters(p) {
    const out = [];
    const sep = p.settings.decimalSep;
    const scope = D.makeScope(p.variables, sep);
    for (const v of p.variables) {
      if (D.isFormula(v.value)) continue;
      let base = NaN;
      try { base = scope.get(v.name); } catch (e) { /* lewati */ }
      if (isFinite(base)) out.push({ key: 'var:' + v.name.toLowerCase(), kind: 'value', group: 'Variabel', label: `Variabel ${v.name}`, base });
    }
    if (p.mode === 'table') {
      const c = compute(p, null, { noSample: true });
      if (!c.table) return out;
      const t = p.table;
      // Dua kondisi: peluang kondisi kedua hanyalah cerminan kondisi pertama.
      if (t.states.length > 1) t.states.forEach((s, j) => { if (!(t.states.length === 2 && j === 1)) out.push({ key: 'tp:' + s.id, kind: 'prob', group: 'Peluang', label: `P(${s.name})`, base: c.table.prior[j] }); });
      t.alternatives.forEach((a, i) => t.states.forEach((s, j) => { if (!D.isFormula(t.payoffs[a.id][s.id])) out.push({ key: 'tv:' + a.id + ':' + s.id, kind: 'value', group: 'Payoff', label: `Payoff ${a.name} | ${s.name}`, base: c.table.M[i][j] }); }));
      return out;
    }
    const opts = { scope, sep, probPercent: p.settings.probFormat === 'percent', objective: p.settings.objective, risk: riskOf(p) };
    for (const prm of D.treeParams(p.tree, opts)) {
      // Simpul peluang dua cabang: peluang cabang kedua hanyalah cerminan cabang pertama.
      if (prm.kind === 'prob') {
        const f = find(p.tree, prm.nodeId);
        if (f && f.node.branches.length === 2 && f.node.branches[1].id === prm.branchId && !D.isFormula(f.node.branches[0].prob)) continue;
      }
      out.push(Object.assign({ group: prm.kind === 'prob' ? 'Peluang' : (prm.field === 'payoff' ? 'Payoff akhir' : 'Arus kas cabang') }, prm));
    }
    return out;
  }

  /** Data tabel payoff yang setara dengan pohon satu tahap (untuk ekspor). */
  function tableRows(p) {
    const t = p.table;
    const rows = [[t.decisionLabel + ' \\ ' + t.stateLabel].concat(t.states.map((s) => s.name))];
    rows.push(['Peluang'].concat(t.states.map((s) => s.prob)));
    t.alternatives.forEach((a) => rows.push([a.name].concat(t.states.map((s) => t.payoffs[a.id][s.id]))));
    return rows;
  }

  /* ------------------------------------------------------------------ *
   * Tabel payoff: operasi baris/kolom
   * ------------------------------------------------------------------ */

  function addAlternative(t) {
    const a = { id: uid('a'), name: 'Alternatif ' + (t.alternatives.length + 1) };
    t.alternatives.push(a);
    t.payoffs[a.id] = {};
    t.states.forEach((s) => { t.payoffs[a.id][s.id] = ''; });
    return a;
  }
  function addState(t) {
    const s = { id: uid('s'), name: 'Kondisi ' + (t.states.length + 1), prob: '' };
    t.states.push(s);
    t.alternatives.forEach((a) => { t.payoffs[a.id][s.id] = ''; });
    t.sample.likelihood[s.id] = {};
    t.sample.indicators.forEach((k) => { t.sample.likelihood[s.id][k.id] = ''; });
    return s;
  }
  function addIndicator(t) {
    const k = { id: uid('i'), name: 'Indikator ' + (t.sample.indicators.length + 1) };
    t.sample.indicators.push(k);
    t.states.forEach((s) => { (t.sample.likelihood[s.id] = t.sample.likelihood[s.id] || {})[k.id] = ''; });
    return k;
  }
  function removeAlternative(t, id) { t.alternatives = t.alternatives.filter((a) => a.id !== id); delete t.payoffs[id]; }
  function removeState(t, id) { t.states = t.states.filter((s) => s.id !== id); Object.values(t.payoffs).forEach((row) => { delete row[id]; }); delete t.sample.likelihood[id]; }
  function removeIndicator(t, id) { t.sample.indicators = t.sample.indicators.filter((k) => k.id !== id); Object.values(t.sample.likelihood).forEach((row) => { delete row[id]; }); }

  /** Salin pohon setara dari tabel ke mode pohon (peluang ditulis desimal/persen sesuai pengaturan). */
  function tableToTreeProject(p) {
    const c = compute(p);
    if (!c.ok) throw new Error('Perbaiki dulu isian tabel: ' + c.errors[0].msg);
    const pct = p.settings.probFormat === 'percent';
    const loc = (str) => (p.settings.decimalSep === ',' ? str.replace('.', ',') : str);
    const fmtP = (x) => loc(String(+(pct ? x * 100 : x).toPrecision(10)));
    const fmtV = (x) => loc(String(+Number(x).toPrecision(12)));
    const t = normalizeTree(JSON.parse(JSON.stringify(c.tree, (k, v) => {
      if (k === 'prob') return v === '' ? '' : fmtP(v);
      if (k === 'value' || k === 'payoff') return fmtV(v);
      return v;
    })), new Set(), 0);
    return t;
  }

  /* ------------------------------------------------------------------ *
   * Tautan proyek (tanpa server)
   * ------------------------------------------------------------------ */

  function b64urlFromBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bytesFromB64url(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function streamBytes(stream) { return new Uint8Array(await new Response(stream).arrayBuffer()); }
  async function encodePayload(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'function') {
      try { return 'z' + b64urlFromBytes(await streamBytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')))); } catch (e) { /* fallback */ }
    }
    return 'j' + b64urlFromBytes(bytes);
  }
  async function decodePayload(code) {
    code = String(code || '').trim();
    const m = code.match(/[#&?]proyek=([A-Za-z0-9_-]+)/);
    if (m) code = m[1];
    const kind = code[0];
    const bytes = bytesFromB64url(code.slice(1));
    let text;
    if (kind === 'z') {
      if (typeof DecompressionStream !== 'function') throw new Error('Browser ini belum mendukung dekompresi. Gunakan Chrome, Edge, Firefox, atau Safari terbaru.');
      text = new TextDecoder().decode(await streamBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))));
    } else if (kind === 'j') text = new TextDecoder().decode(bytes);
    else throw new Error('Tautan tidak dikenali.');
    return JSON.parse(text);
  }

  /* ------------------------------------------------------------------ *
   * Contoh kasus
   * ------------------------------------------------------------------ */

  const SAMPLES = {
    kedai: () => {
      const p = newProject();
      p.meta.title = 'Layanan pesan antar kedai';
      p.meta.description = 'Contoh dari versi pertama: membuka layanan pesan antar atau tidak, dengan permintaan tinggi atau rendah.';
      p.tree = T('decision', 'Keputusan kedai', [
        ['Buka layanan pesan antar', '', '', T('chance', 'Permintaan', [
          ['Tinggi', '60', '', end('35', 'Bersih setelah biaya')],
          ['Rendah', '40', '', end('-5', 'Bersih setelah biaya')]
        ])],
        ['Tidak membuka layanan', '', '', end('0', 'Tidak ada pendapatan tambahan')]
      ]);
      return p;
    },
    produk: () => {
      const p = newProject();
      p.meta.title = 'Peluncuran produk dengan uji pasar';
      p.meta.description = 'Pohon dua tahap: uji pasar dulu atau langsung meluncurkan. Payoff memakai variabel sehingga mudah diuji sensitivitasnya.';
      p.settings.probFormat = 'decimal';
      p.variables = [
        { id: uid('v'), name: 'biaya_uji', value: '5', note: 'Biaya uji pasar' },
        { id: uid('v'), name: 'untung_sukses', value: '120', note: 'Laba bersih bila produk sukses' },
        { id: uid('v'), name: 'rugi_gagal', value: '-60', note: 'Rugi bersih bila produk gagal' }
      ];
      const l2 = (ps, pg) => T('decision', 'Keputusan peluncuran', [
        ['Luncurkan nasional', '', '', T('chance', 'Pasar', [['Sukses', ps, '', end('=untung_sukses')], ['Gagal', pg, '', end('=rugi_gagal')]])],
        ['Batalkan', '', '', end('0')]
      ]);
      p.tree = T('decision', 'Uji pasar?', [
        ['Lakukan uji pasar', '', '=-biaya_uji', T('chance', 'Hasil uji', [['Positif', '0,6', '', l2('0,75', '0,25')], ['Negatif', '0,4', '', l2('0,25', '0,75')]])],
        ['Tanpa uji pasar', '', '', l2('0,55', '0,45')]
      ]);
      return p;
    },
    pabrik: () => {
      const p = newProject();
      p.meta.title = 'Ekspansi pabrik (tabel payoff & survei)';
      p.meta.description = 'Contoh klasik buku teks teori keputusan: pabrik besar, pabrik kecil, atau tidak membangun; lengkap dengan kriteria keputusan, EVPI, revisi Bayes, dan EVSI survei pasar.';
      p.mode = 'table';
      p.settings.probFormat = 'decimal';
      const t = newTable();
      t.decisionLabel = 'Keputusan ekspansi';
      t.stateLabel = 'Kondisi pasar';
      t.alternatives = [{ id: uid('a'), name: 'Pabrik besar' }, { id: uid('a'), name: 'Pabrik kecil' }, { id: uid('a'), name: 'Tidak membangun' }];
      t.states = [{ id: uid('s'), name: 'Pasar baik', prob: '0,5' }, { id: uid('s'), name: 'Pasar buruk', prob: '0,5' }];
      const M = [['200', '-180'], ['100', '-20'], ['0', '0']];
      t.payoffs = {};
      t.alternatives.forEach((a, i) => { t.payoffs[a.id] = {}; t.states.forEach((s, j) => { t.payoffs[a.id][s.id] = M[i][j]; }); });
      t.alpha = '0,8';
      t.sample = { enabled: true, name: 'survei pasar', cost: '10', indicators: [{ id: uid('i'), name: 'Survei positif' }, { id: uid('i'), name: 'Survei negatif' }], likelihood: {} };
      const L = [['0,7', '0,3'], ['0,2', '0,8']];
      t.states.forEach((s, j) => { t.sample.likelihood[s.id] = {}; t.sample.indicators.forEach((k, kk) => { t.sample.likelihood[s.id][k.id] = L[j][kk]; }); });
      p.table = t;
      p.tree = tableToTreeProject(p);
      return p;
    },
    vendor: () => {
      const p = newProject();
      p.meta.title = 'Pemilihan vendor sistem informasi (biaya minimum)';
      p.meta.description = 'Tujuan meminimalkan total biaya proyek. Pengembangan internal punya keputusan lanjutan bila gagal.';
      p.settings.objective = 'min';
      p.tree = T('decision', 'Pilih pengembang', [
        ['Vendor lokal', '', '', T('chance', 'Jadwal vendor lokal', [['Tepat waktu', '70', '', end('420')], ['Terlambat', '30', '', end('560')]])],
        ['Vendor global', '', '', T('chance', 'Jadwal vendor global', [['Tepat waktu', '90', '', end('480')], ['Terlambat', '10', '', end('620')]])],
        ['Kembangkan sendiri', '', '', T('chance', 'Hasil pengembangan', [
          ['Berhasil', '60', '', end('350')],
          ['Gagal', '40', '', T('decision', 'Tindak lanjut', [['Perbaiki sendiri', '', '', end('600')], ['Alihkan ke vendor global', '', '', end('650')]])]
        ])]
      ]);
      return p;
    }
  };

  const SAMPLE_INFO = [
    { id: 'kedai', title: 'Layanan pesan antar kedai', text: 'Contoh versi pertama: satu keputusan, permintaan tinggi 60% / rendah 40%.' },
    { id: 'produk', title: 'Peluncuran produk dengan uji pasar', text: 'Pohon dua tahap dengan variabel dan rumus; cocok untuk latihan sensitivitas dan EVPI.' },
    { id: 'pabrik', title: 'Ekspansi pabrik (tabel payoff & survei)', text: 'Contoh buku teks: maximax, maximin, Hurwicz, regret, EV, EVPI, revisi Bayes, EVSI.' },
    { id: 'vendor', title: 'Pemilihan vendor (biaya minimum)', text: 'Tujuan meminimalkan biaya, dengan keputusan lanjutan bila pengembangan internal gagal.' }
  ];
  function sampleProject(id) { return (SAMPLES[id] || SAMPLES.kedai)(); }

  return {
    APP_ID, VERSION, STORAGE_KEY, TYPES, RISK_MODES, DEFAULT_SETTINGS, SAMPLE_INFO,
    uid, clone, node, branch, T, end, newTree, newTable, newSample, newProject, normalizeProject, normalizeTree, serialize, saveLocal, loadLocal,
    find, findBranch, addBranch, setType, removeBranch, moveBranch, duplicateBranch, subtreeSize,
    riskOf, compute, evaluator, parameters, tableValues, tableRows,
    addAlternative, addState, addIndicator, removeAlternative, removeState, removeIndicator, tableToTreeProject,
    encodePayload, decodePayload, sampleProject
  };
}));
