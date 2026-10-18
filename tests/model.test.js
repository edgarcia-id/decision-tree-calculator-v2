// Uji model proyek, contoh bawaan, dan ekspor (node --test tests/*.test.js)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../assets/js/dt-core.js');
const M = require('../assets/js/model.js');
const X = require('../assets/js/export.js');

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('contoh bawaan dihitung dengan nilai yang benar', () => {
  const kedai = M.compute(M.sampleProject('kedai'));
  assert.ok(kedai.ok);
  near(kedai.res.root.value, 19);
  assert.equal(kedai.res.root.branches[kedai.res.root.choice].name, 'Buka layanan pesan antar');

  const produk = M.compute(M.sampleProject('produk'));
  assert.ok(produk.ok);
  near(produk.res.root.value, 40);
  near(produk.res.root.branches[1].child.value, 39);

  const pabrik = M.compute(M.sampleProject('pabrik'));
  assert.ok(pabrik.ok);
  near(pabrik.res.root.value, 49);
  near(pabrik.criteria.evpi, 60);
  near(pabrik.sample.evsi, 19);
  near(pabrik.sample.net, 9);

  const vendor = M.compute(M.sampleProject('vendor'));
  assert.ok(vendor.ok);
  near(vendor.res.root.value, 450);
  assert.equal(vendor.res.maximize, false);
});

test('serialize → normalizeProject mempertahankan hasil', () => {
  for (const s of M.SAMPLE_INFO) {
    const p = M.sampleProject(s.id);
    const q = M.normalizeProject(JSON.parse(M.serialize(p)));
    near(M.compute(q).res.root.value, M.compute(p).res.root.value);
    assert.equal(q.mode, p.mode);
  }
});

test('normalizeProject menolak berkas yang bukan proyek', () => {
  assert.throws(() => M.normalizeProject({ foo: 1 }));
  assert.throws(() => M.normalizeProject(null));
});

test('tabel payoff → pohon setara memberi nilai sama (desimal koma aman)', () => {
  const p = M.sampleProject('pabrik');
  p.table.payoffs[p.table.alternatives[1].id][p.table.states[0].id] = '100,375';
  const tree = M.tableToTreeProject(p);
  const q = M.sampleProject('pabrik');
  q.tree = tree;
  q.mode = 'tree';
  const a = M.compute(p), b = M.compute(q);
  assert.ok(b.ok);
  near(b.res.root.value, a.res.root.value, 1e-6);
});

test('parameter sensitivitas: simpul peluang dua cabang hanya diwakili satu peluang', () => {
  const proj = M.sampleProject('kedai');
  const prm = M.parameters(proj);
  const probs = prm.filter((x) => x.kind === 'prob');
  assert.equal(probs.length, 1);
  assert.match(probs[0].label, /Tinggi/);
  const ev = M.evaluator(proj);
  const r = D.oneWay(ev, probs[0].key, 0, 1, 41);
  assert.equal(r.breaks.length, 1);
  near(r.breaks[0].x, 0.125, 1e-6); // 35p − 5(1 − p) = 0 → p = 0,125
});

test('mengubah format peluang tetap memberi hasil sama', () => {
  const p = M.sampleProject('kedai');
  p.settings.probFormat = 'decimal';
  D.walkTree(p.tree, (n) => (n.branches || []).forEach((b) => { if (n.type === 'chance') b.prob = String(Number(b.prob) / 100).replace('.', ','); }));
  near(M.compute(p).res.root.value, 19);
});

test('operasi editor: tambah, salin, pindah, hapus cabang', () => {
  const p = M.sampleProject('kedai');
  const root = p.tree;
  const b = M.addBranch(root);
  assert.equal(root.branches.length, 3);
  b.child.payoff = '25';
  near(M.compute(p).res.root.value, 25);
  const dup = M.duplicateBranch(p.tree, root.branches[0].id);
  assert.equal(root.branches.length, 4);
  assert.notEqual(dup.child.id, root.branches[0].child.id);
  assert.ok(M.moveBranch(p.tree, b.id, -1));
  M.removeBranch(p.tree, b.id);
  near(M.compute(p).res.root.value, 19);
  M.setType(root.branches[0].child, 'terminal');
  assert.equal(root.branches[0].child.branches.length, 0);
});

test('tautan berbagi: encode → decode', async () => {
  if (typeof CompressionStream !== 'function') return;
  const p = M.sampleProject('produk');
  const code = await M.encodePayload(p);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const q = M.normalizeProject(await M.decodePayload('#proyek=' + code));
  near(M.compute(q).res.root.value, 40);
});

test('workbook Excel berisi sheet dan rumus rollback', () => {
  for (const id of ['produk', 'pabrik']) {
    const p = M.sampleProject(id);
    const c = M.compute(p);
    const fmt = { v: (x) => String(x), p: (x) => String(x), money: (x) => String(x), pct: (x) => String(x), param: (k, x) => String(x) };
    const rv = D.rootValues(c.res);
    const R = {
      project: p, comp: c, dateLabel: '18 Oktober 2026', verdict: 'uji', policy: D.policy(c.res), rollback: [], paths: D.paths(c.res),
      profiles: rv.names.map((n, k) => Object.assign({ name: n, k }, D.riskProfile(c.res, k))), rootValues: rv,
      tornado: { rows: [] }, oneWay: null, evpi: null, charts: {}, references: [], fmt
    };
    const sheets = X.workbookFromReport(R);
    const names = sheets.map((s) => s.name);
    assert.ok(names.includes('Ringkasan') && names.includes('Jalur'));
    if (id === 'produk') {
      assert.ok(names.includes('Pohon') && names.includes('Variabel'));
      assert.ok(sheets.names.some((n) => n.name === 'v_untung_sukses'));
      const tree = sheets.find((s) => s.name === 'Pohon');
      const formulas = tree.rows.flat().filter((x) => x && x.f).map((x) => x.f);
      assert.ok(formulas.some((f) => /^MAX\(/.test(f)));
      assert.ok(formulas.some((f) => /v_untung_sukses/.test(f)));
    } else {
      assert.ok(names.includes('Tabel payoff') && names.includes('Bayes & EVSI') && names.includes('Pohon setara'));
    }
    const bytes = X.buildXlsx(sheets);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
  }
});

test('CSV jalur memakai titik koma untuk desimal koma', () => {
  const p = M.sampleProject('kedai');
  const c = M.compute(p);
  const csv = X.csvString(X.pathRows({ paths: D.paths(c.res) }), ',');
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /Buka layanan pesan antar > Tinggi;0,6;35;Ya/);
});
