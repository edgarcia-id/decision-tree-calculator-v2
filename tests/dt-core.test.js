'use strict';
// Jalankan: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../assets/js/dt-core.js');
const FX = require('./fixtures-python.json');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1e-9) * Math.max(1, Math.abs(b)), `${msg || ''} ${a} ≠ ${b}`);

test('parseNumber & readField: format Indonesia, persen, rumus', () => {
  assert.equal(D.parseNumber('1.234,5', ','), 1234.5);
  assert.equal(D.parseNumber('0,6', ','), 0.6);
  assert.equal(D.parseNumber('-180.000', ','), -180000);
  assert.equal(D.parseNumber('(5)', ','), -5);
  assert.equal(D.readField('60%', null, ',').v, 0.6);
  assert.equal(D.readField('60%', null, ',').pct, true);
  assert.equal(D.readField('', null, ',').v, null);
  const scope = D.makeScope([{ name: 'p', value: '0,3' }, { name: 'harga', value: '=2*biaya' }, { name: 'biaya', value: '1.500' }], ',');
  close(D.readField('=1-p', scope, ',').v, 0.7);
  close(D.readField('=harga - 100', scope, ',').v, 2900);
  close(D.readField('=max(1;2,5;-3) + 50%', scope, ',').v, 3);
  close(D.readField('=2^3^2', scope, ',').v, 512);
  close(D.readField('=-2^2', scope, ',').v, -4);
  close(D.readField('=round(2/3;2)', scope, ',').v, 0.67);
  assert.throws(() => D.readField('=x+1', scope, ','), /belum didefinisikan/);
  assert.throws(() => D.readField('=2+', scope, ','), /tidak lengkap/);
  assert.throws(() => D.readField('abc', scope, ','), /bukan angka/);
  assert.throws(() => D.readField('=foo(1)', scope, ','), /tidak dikenal/);
  const loop = D.makeScope([{ name: 'a', value: '=b+1' }, { name: 'b', value: '=a+1' }], ',');
  assert.throws(() => D.readField('=a', loop, ','), /melingkar/);
});

test('rumus → Excel', () => {
  const ast = D.compile('max(p;0,5)*(1-q)^2 + 10%', ',');
  assert.equal(D.toExcel(ast, (n) => 'v_' + n), 'MAX(v_p,0.5)*(1-v_q)^2+10%');
  assert.equal(D.toExcel(D.compile('a-(b-c)', ','), (n) => n), 'a-(b-c)');
  assert.equal(D.toExcel(D.compile('-x^2', ','), (n) => n), '-(x^2)');
  assert.equal(D.toExcel(D.compile('(-x)^2', ','), (n) => n), '(-x)^2');
  close(D.readField('=2^-1', null, ',').v, 0.5);
});

test('contoh kedai versi pertama: EV 19 vs 0', () => {
  const tree = {
    id: 'r', type: 'decision', name: 'Keputusan', branches: [
      { id: 'b1', name: 'Buka layanan', value: 0, child: { id: 'c1', type: 'chance', name: 'Permintaan', branches: [
        { id: 'b11', name: 'Tinggi', prob: '60', value: 0, child: { id: 't1', type: 'terminal', payoff: '35' } },
        { id: 'b12', name: 'Rendah', prob: '40', value: 0, child: { id: 't2', type: 'terminal', payoff: '-5' } }] } },
      { id: 'b2', name: 'Tidak membuka', value: 0, child: { id: 't3', type: 'terminal', payoff: '0' } }
    ]
  };
  const r = D.evaluateTree(tree, { probPercent: true, sep: ',' });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  close(r.root.value, 19);
  assert.equal(r.root.choice, 0);
  const rp = D.riskProfile(r, 0);
  assert.deepEqual(rp.points.map((x) => [x.x, +x.p.toFixed(10)]), [[-5, 0.4], [35, 0.6]]);
  close(rp.pLoss, 0.4);
  close(rp.sd, Math.sqrt(0.4 * 24 * 24 + 0.6 * 16 * 16));
});

const LUMBER = {
  M: [[200000, -180000], [100000, -20000], [0, 0]],
  prior: [0.5, 0.5],
  L: [[0.7, 0.3], [0.2, 0.8]]
};

test('tabel payoff buku teks (pabrik besar/kecil/tidak): semua kriteria', () => {
  const c = D.payoffCriteria(LUMBER.M, LUMBER.prior, { alpha: 0.8 });
  assert.deepEqual(c.winners.optimistic, [0]);
  assert.deepEqual(c.winners.pessimistic, [2]);
  assert.deepEqual(c.winners.laplace, [1]);
  assert.deepEqual(c.winners.hurwicz, [0]);
  close(c.rows[0].hurwicz, 124000);
  assert.deepEqual(c.winners.regret, [1]);
  close(c.rows[1].maxRegret, 100000);
  assert.deepEqual(c.winners.ev, [1]);
  close(c.rows[0].ev, 10000);
  close(c.evwpi, 100000);
  close(c.evpi, 60000);
  assert.deepEqual(c.winners.eol, [1]);
  close(c.rows[1].eol, 60000, 1e-12, 'EOL minimum = EVPI');
});

test('Bayes & EVSI buku teks: EVSI 19.000, efisiensi 31,7%', () => {
  const e = D.evsi(LUMBER.M, LUMBER.prior, LUMBER.L, { cost: 10000 });
  close(e.bayes.marginal[0], 0.45);
  close(e.bayes.posterior[0][0], 0.35 / 0.45);
  close(e.bayes.posterior[0][1], 0.15 / 0.55);
  assert.deepEqual(e.perIndicator[0].best, [0]);
  assert.deepEqual(e.perIndicator[1].best, [1]);
  close(e.evwsi, 59000, 1e-12);
  close(e.evsi, 19000, 1e-12);
  close(e.efficiency, 19000 / 60000);
  close(e.net, 9000, 1e-12);
  assert.equal(e.worthIt, true);
  // Pohon setara: nilai akar = 59.000 − 10.000 = 49.000, pilih survei
  const tree = D.tableToTree({ alternatives: [{ name: 'Besar' }, { name: 'Kecil' }, { name: 'Tidak' }], states: [{ name: 'Baik' }, { name: 'Buruk' }], M: LUMBER.M, prior: LUMBER.prior, sample: { name: 'survei', cost: 10000, indicators: [{ name: 'Positif' }, { name: 'Negatif' }], L: LUMBER.L } });
  const r = D.evaluateTree(tree, {});
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  close(r.root.value, 49000, 1e-12);
  assert.equal(r.root.choice, 0);
});

function treeOpts(extra) { return Object.assign({ sep: ',' }, extra || {}); }

test('rollback, CE, minimisasi, profil risiko: cocok dengan Python (30 pohon acak)', () => {
  for (const t of FX.trees) {
    const r = D.evaluateTree(t.tree, treeOpts());
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    close(r.root.ev, t.ev, 1e-9, 'EV');
    for (const [id, i] of Object.entries(t.choices)) assert.equal(r.nodes.get(id).choice, i, 'pilihan ' + id);
    const rp = D.riskProfile(r, null);
    close(rp.mean, t.profile_mean, 1e-9, 'mean');
    close(rp.sd, t.profile_sd, 1e-9, 'sd');
    for (const mode of ['averse', 'seeking']) {
      const ru = D.evaluateTree(t.tree, treeOpts({ risk: { mode, R: t[mode].R } }));
      close(ru.root.ce, t[mode].ce, 1e-8, mode + ' CE');
      close(ru.root.ev, t[mode].ev, 1e-9, mode + ' EV kebijakan');
      for (const [id, i] of Object.entries(t[mode].choices)) assert.equal(ru.nodes.get(id).choice, i, mode + ' pilihan ' + id);
    }
    const rm = D.evaluateTree(t.tree, treeOpts({ objective: 'min' }));
    close(rm.root.ev, t.min.ev, 1e-9, 'min EV');
  }
});

test('kriteria tabel payoff, Bayes, EVSI: cocok dengan Python (20 tabel × max/min)', () => {
  for (const t of FX.tables) {
    for (const obj of ['max', 'min']) {
      const ref = t[obj];
      const c = D.payoffCriteria(t.M, t.prior, { objective: obj, alpha: t.alpha });
      for (const key of ['optimistic', 'pessimistic', 'hurwicz', 'laplace', 'ev', 'maxRegret', 'eol']) c.rows.forEach((row, i) => close(row[key], ref[key][i], 1e-9, `${obj} ${key}`));
      close(c.evpi, ref.evpi, 1e-9, obj + ' evpi');
      const e = D.evsi(t.M, t.prior, t.L, { objective: obj });
      e.bayes.marginal.forEach((m, k) => close(m, ref.marginal[k], 1e-12));
      e.bayes.posterior.forEach((row, s) => row.forEach((x, k) => close(x, ref.posterior[s][k], 1e-12)));
      close(e.evsi, ref.evsi, 1e-9, obj + ' evsi');
      assert.ok(e.evsi >= -1e-9 && e.evsi <= c.evpi + 1e-9, '0 ≤ EVSI ≤ EVPI');
    }
  }
});

test('validasi: peluang tidak 100%, kosong, cabang hilang', () => {
  const tree = { id: 'r', type: 'chance', name: 'X', branches: [
    { id: 'a', name: 'A', prob: '0,5', child: { id: 't1', type: 'terminal', payoff: '1' } },
    { id: 'b', name: 'B', prob: '0,4', child: { id: 't2', type: 'terminal', payoff: '2' } }] };
  const r = D.evaluateTree(tree, treeOpts());
  assert.equal(r.ok, false);
  assert.match(r.errors[0].msg, /harus 1/);
  tree.branches[1].prob = '';
  assert.match(D.evaluateTree(tree, treeOpts()).errors[0].msg, /Belum diisi/);
  const empty = { id: 'r', type: 'decision', name: 'K', branches: [] };
  assert.match(D.evaluateTree(empty, treeOpts()).errors[0].msg, /belum memiliki cabang/);
});

test('override peluang menskalakan saudara secara proporsional; rumus tetap', () => {
  const tree = { id: 'r', type: 'chance', name: 'X', branches: [
    { id: 'a', name: 'A', prob: '0,5', child: { id: 't1', type: 'terminal', payoff: '10' } },
    { id: 'b', name: 'B', prob: '0,3', child: { id: 't2', type: 'terminal', payoff: '20' } },
    { id: 'c', name: 'C', prob: '0,2', child: { id: 't3', type: 'terminal', payoff: '30' } }] };
  const r = D.evaluateTree(tree, treeOpts({ overrides: new Map([['p:a', 0.8]]) }));
  close(r.nodes.get('r').branches[1].p, 0.12);
  close(r.nodes.get('r').branches[2].p, 0.08);
  const scope = D.makeScope([{ name: 'q', value: '0,6' }], ',');
  const t2 = { id: 'r', type: 'chance', name: 'X', branches: [
    { id: 'a', name: 'A', prob: '=q', child: { id: 't1', type: 'terminal', payoff: '10' } },
    { id: 'b', name: 'B', prob: '=1-q', child: { id: 't2', type: 'terminal', payoff: '20' } }] };
  const r2 = D.evaluateTree(t2, treeOpts({ scope: D.makeScope([{ name: 'q', value: '0,6' }], ',', new Map([['var:q', 0.25]])) }));
  close(r2.root.ev, 0.25 * 10 + 0.75 * 20);
  assert.ok(scope);
});

test('EVPI per ketidakpastian = EVPI tabel payoff untuk pohon satu tahap', () => {
  const tree = D.tableToTree({ alternatives: [{ name: 'Besar' }, { name: 'Kecil' }, { name: 'Tidak' }], states: [{ name: 'Baik' }, { name: 'Buruk' }], M: LUMBER.M, prior: LUMBER.prior, stateLabel: 'Pasar' });
  const groups = D.eventGroups(tree);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].nodes.length, 3);
  const v = D.evpi(tree, {}, groups);
  close(v.evpi, 60000, 1e-12);
  close(v.withInfo, 100000, 1e-12);
  assert.equal(v.consistent, true);
  // Dengan utilitas menghindari risiko: EVPI tetap positif dan ≤ nilai netral
  const vu = D.evpi(tree, { risk: { mode: 'averse', R: 100000 } }, groups);
  assert.ok(vu.evpi > 0);
});

test('sensitivitas: titik impas peluang = solusi analitik', () => {
  // EV besar = 380000p − 180000; EV kecil = 120000p − 20000; sama pada p = 160000/260000
  const tree = D.tableToTree({ alternatives: [{ name: 'Besar' }, { name: 'Kecil' }, { name: 'Tidak' }], states: [{ name: 'Baik' }, { name: 'Buruk' }], M: LUMBER.M, prior: LUMBER.prior });
  const pKey = 'p:' + tree.branches[0].child.branches[0].id;
  const groupNodes = tree.branches.map((b) => b.child);
  const evalFn = (ov) => {
    // terapkan peluang yang sama ke semua simpul pasar
    const x = ov.get(pKey);
    const m = new Map();
    if (x !== undefined) groupNodes.forEach((n) => { m.set('p:' + n.branches[0].id, x); m.set('p:' + n.branches[1].id, 1 - x); });
    const r = D.evaluateTree(tree, { overrides: m });
    return r.ok ? D.rootValues(r) : null;
  };
  const s = D.oneWay(evalFn, pKey, 0, 1, 21);
  const xs = s.breaks.map((b) => b.x);
  assert.equal(s.breaks.length, 2, JSON.stringify(s.breaks));
  close(xs[0], 20000 / 120000, 1e-9);   // tidak → kecil
  close(xs[1], 160000 / 260000, 1e-9);  // kecil → besar
  const tor = D.tornado(evalFn, [{ key: pKey, kind: 'prob', base: 0.5 }]);
  assert.equal(tor.rows.length, 1);
  close(tor.base, 40000);
  const two = D.twoWay(evalFn, pKey, [0, 1], pKey, [0, 1], 5);
  assert.equal(two.grid.length, 5);
});

test('dominansi stokastik', () => {
  const a = { points: [{ x: 10, p: 0.5, cum: 0.5 }, { x: 20, p: 0.5, cum: 1 }], mean: 15 };
  const b = { points: [{ x: 5, p: 0.5, cum: 0.5 }, { x: 20, p: 0.5, cum: 1 }], mean: 12.5 };
  assert.deepEqual(D.dominance(a, b, true), { order: 1, winner: 'a' });
  assert.deepEqual(D.dominance(a, b, false), { order: 1, winner: 'b' });
  const c = { points: [{ x: 15, p: 1, cum: 1 }], mean: 15 };
  const d = { points: [{ x: 0, p: 0.5, cum: 0.5 }, { x: 30, p: 0.5, cum: 1 }], mean: 15 };
  assert.equal(D.dominance(c, d, true).order, 2);
});
