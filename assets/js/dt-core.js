/*!
 * Decision Tree Calculator — mesin hitung (tanpa pustaka, tanpa DOM)
 * (c) 2026 Alfredo Garcia — MIT License
 *
 * Isi:
 *  - pembaca angka (format Indonesia/Inggris) dan rumus sederhana dengan variabel ("=0,6*harga - biaya")
 *  - evaluasi pohon keputusan: rollback nilai harapan, pilihan optimal, utilitas eksponensial & certainty equivalent
 *  - jalur & profil risiko, dominansi stokastik
 *  - nilai informasi sempurna (EVPI) per ketidakpastian
 *  - analisis sensitivitas: satu arah, tornado, spider, dua arah (wilayah strategi)
 *  - tabel payoff: maximax, maximin, Laplace, Hurwicz, minimax regret, EV, EOL, EVPI; revisi Bayes & EVSI
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DTCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-9;
  const PROB_TOL = 1e-6;

  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-9) * Math.max(1, Math.abs(a), Math.abs(b));

  /* ------------------------------------------------------------------ *
   * Angka
   * ------------------------------------------------------------------ */

  /**
   * Baca angka format Indonesia ("1.234,5"), Inggris ("1,234.5"), "Rp 12.000", "(12)".
   * Tanda % TIDAK dibuang di sini (lihat readField).
   * @returns {number|null|NaN}
   */
  function parseNumber(s, sep) {
    if (s === null || s === undefined) return null;
    if (typeof s === 'number') return isFinite(s) ? s : NaN;
    let t = String(s).trim().replace(/[\s  ]/g, '').replace(/^Rp\.?/i, '').replace(/^\$/, '').replace(/^\((.*)\)$/, '-$1').replace(/^[−–]/, '-');
    if (t === '' || t === '-') return null;
    const hasDot = t.includes('.'), hasComma = t.includes(',');
    if (hasDot && hasComma) {
      t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    } else if (hasComma) {
      if (/^-?[1-9]\d{0,2}(,\d{3}){2,}$/.test(t) || (sep === '.' && /^-?[1-9]\d{0,2}(,\d{3})+$/.test(t))) t = t.replace(/,/g, '');
      else t = t.replace(',', '.');
    } else if (hasDot) {
      if (/^-?[1-9]\d{0,2}(\.\d{3}){2,}$/.test(t) || (sep === ',' && /^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t))) t = t.replace(/\./g, '');
    }
    if (!/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
    const v = Number(t);
    return isFinite(v) ? v : NaN;
  }

  /* ------------------------------------------------------------------ *
   * Rumus: =ekspresi dengan + - * / ^ ( ) %, variabel, dan fungsi.
   * Pemisah argumen ';' (seperti Excel berbahasa Indonesia); desimal ',' atau '.'.
   * ------------------------------------------------------------------ */

  const FUNCS = {
    min: { args: [1, 64], fn: (a) => Math.min(...a), xl: 'MIN' },
    max: { args: [1, 64], fn: (a) => Math.max(...a), xl: 'MAX' },
    abs: { args: [1, 1], fn: (a) => Math.abs(a[0]), xl: 'ABS' },
    sqrt: { args: [1, 1], fn: (a) => Math.sqrt(a[0]), xl: 'SQRT' },
    exp: { args: [1, 1], fn: (a) => Math.exp(a[0]), xl: 'EXP' },
    ln: { args: [1, 1], fn: (a) => Math.log(a[0]), xl: 'LN' },
    log: { args: [1, 1], fn: (a) => Math.log10(a[0]), xl: 'LOG10' },
    round: { args: [1, 2], fn: (a) => { const k = Math.pow(10, a.length > 1 ? a[1] : 0); return Math.round(a[0] * k) / k; }, xl: 'ROUND' }
  };

  function tokenize(src, sep) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      const rest = src.slice(i);
      if (/[0-9]/.test(c) || ((c === '.' || c === ',') && /[0-9]/.test(src[i + 1] || ''))) {
        let m = sep === ',' ? /^\d{1,3}(?:\.\d{3})+(?:,\d+)?(?![\d.])/.exec(rest) : /^\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])/.exec(rest);
        let v;
        if (m) v = Number(sep === ',' ? m[0].replace(/\./g, '').replace(',', '.') : m[0].replace(/,/g, ''));
        else { m = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][-+]?\d+)?/.exec(rest); v = Number(m[0].replace(',', '.')); }
        out.push({ t: 'num', v, pos: i });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
        out.push({ t: 'id', v: m[0], pos: i });
        i += m[0].length;
        continue;
      }
      const map = { '−': '-', '×': '*', '÷': '/', '·': '*' };
      const ch = map[c] || c;
      if ('+-*/^();%'.includes(ch)) { out.push({ t: ch, pos: i }); i++; continue; }
      throw new Error(`Karakter "${c}" tidak dikenali di posisi ${i + 1}.`);
    }
    return out;
  }

  function parseExpr(src, sep) {
    const toks = tokenize(src, sep);
    let k = 0;
    const peek = () => toks[k];
    const take = (t) => { const x = toks[k]; if (!x || (t && x.t !== t)) throw new Error(t ? `Diharapkan "${t}"${x ? ` di posisi ${x.pos + 1}` : ' di akhir rumus'}.` : 'Rumus tidak lengkap.'); k++; return x; };
    function expr() {
      let a = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) { const op = take().t; a = { k: 'bin', op, a, b: term() }; }
      return a;
    }
    function term() {
      let a = unary();
      while (peek() && (peek().t === '*' || peek().t === '/')) { const op = take().t; a = { k: 'bin', op, a, b: unary() }; }
      return a;
    }
    // Konvensi matematika: -2^2 = -(2^2) = -4; pangkat asosiatif kanan; 2^-1 diperbolehkan.
    function unary() {
      if (peek() && peek().t === '-') { take(); return { k: 'neg', a: unary() }; }
      if (peek() && peek().t === '+') { take(); return unary(); }
      return power();
    }
    function power() {
      const a = postfix();
      if (peek() && peek().t === '^') { take(); return { k: 'bin', op: '^', a, b: unary() }; }
      return a;
    }
    function postfix() {
      let a = primary();
      while (peek() && peek().t === '%') { take(); a = { k: 'pct', a }; }
      return a;
    }
    function primary() {
      const x = peek();
      if (!x) throw new Error('Rumus tidak lengkap.');
      if (x.t === 'num') { k++; return { k: 'num', v: x.v }; }
      if (x.t === 'id') {
        k++;
        if (peek() && peek().t === '(') {
          const f = FUNCS[x.v.toLowerCase()];
          if (!f) throw new Error(`Fungsi "${x.v}" tidak dikenal. Tersedia: ${Object.keys(FUNCS).join(', ')}.`);
          take('(');
          const args = [];
          if (!(peek() && peek().t === ')')) {
            args.push(expr());
            while (peek() && peek().t === ';') { take(); args.push(expr()); }
          }
          take(')');
          if (args.length < f.args[0] || args.length > f.args[1]) throw new Error(`Fungsi ${x.v} menerima ${f.args[0]}${f.args[1] > f.args[0] ? '–' + f.args[1] : ''} argumen (pisahkan dengan ;).`);
          return { k: 'call', name: x.v.toLowerCase(), args };
        }
        return { k: 'var', name: x.v };
      }
      if (x.t === '(') { k++; const e = expr(); take(')'); return e; }
      throw new Error(`Simbol "${x.t}" tidak diharapkan di posisi ${x.pos + 1}.`);
    }
    const ast = expr();
    if (k < toks.length) throw new Error(`Simbol "${toks[k].t === 'num' ? toks[k].v : toks[k].v || toks[k].t}" tidak diharapkan di posisi ${toks[k].pos + 1}.`);
    return ast;
  }

  const astCache = new Map();
  function compile(src, sep) {
    const key = (sep || ',') + '\u0000' + src;
    let hit = astCache.get(key);
    if (!hit) {
      try { hit = { ast: parseExpr(src, sep) }; } catch (e) { hit = { error: e.message }; }
      if (astCache.size > 5000) astCache.clear();
      astCache.set(key, hit);
    }
    if (hit.error) throw new Error(hit.error);
    return hit.ast;
  }

  function evalAst(n, getVar) {
    switch (n.k) {
      case 'num': return n.v;
      case 'var': return getVar(n.name);
      case 'neg': return -evalAst(n.a, getVar);
      case 'pct': return evalAst(n.a, getVar) / 100;
      case 'call': return FUNCS[n.name].fn(n.args.map((a) => evalAst(a, getVar)));
      case 'bin': {
        const a = evalAst(n.a, getVar), b = evalAst(n.b, getVar);
        if (n.op === '+') return a + b;
        if (n.op === '-') return a - b;
        if (n.op === '*') return a * b;
        if (n.op === '/') { if (b === 0) throw new Error('Pembagian dengan nol.'); return a / b; }
        return Math.pow(a, b);
      }
      default: throw new Error('Rumus tidak valid.');
    }
  }

  function astVars(n, out) {
    out = out || new Set();
    if (n.k === 'var') out.add(n.name.toLowerCase());
    if (n.a) astVars(n.a, out);
    if (n.b) astVars(n.b, out);
    if (n.args) n.args.forEach((a) => astVars(a, out));
    return out;
  }

  /** Ubah AST menjadi rumus Excel (desimal titik, pemisah koma). nameOf(var) → nama terdefinisi di Excel. */
  function toExcel(n, nameOf) {
    const p = (x, parentPrec) => { const s = toExcel(x, nameOf); return prec(x) < parentPrec ? '(' + s + ')' : s; };
    function prec(x) { if (x.k === 'bin') return { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }[x.op]; if (x.k === 'neg') return 3; return 5; }
    switch (n.k) {
      case 'num': return String(n.v);
      case 'var': return nameOf(n.name);
      // Excel memberi -x^2 = (-x)^2, jadi pangkat di bawah tanda minus selalu diberi kurung.
      case 'neg': return n.a.k === 'bin' && n.a.op === '^' ? '-(' + toExcel(n.a, nameOf) + ')' : '-' + p(n.a, 3);
      case 'pct': return p(n.a, 5) + '%';
      case 'call': return FUNCS[n.name].xl + '(' + n.args.map((a) => toExcel(a, nameOf)).join(',') + ')';
      case 'bin': { const q = prec(n); return p(n.a, q) + n.op + p(n.b, n.op === '^' || n.op === '-' || n.op === '/' ? q + 1 : q); }
      default: return '0';
    }
  }

  const isFormula = (raw) => typeof raw === 'string' && raw.trim().startsWith('=');
  const VAR_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;

  /**
   * Lingkup variabel dengan evaluasi malas & deteksi siklus.
   * variables: [{name, value}] (value boleh angka atau rumus "=...")
   */
  function makeScope(variables, sep, overrides) {
    const defs = new Map();
    for (const v of variables || []) if (v && VAR_RE.test(v.name || '')) defs.set(v.name.toLowerCase(), v);
    const cache = new Map();
    const stack = new Set();
    function get(name) {
      const key = name.toLowerCase();
      if (overrides && overrides.has('var:' + key)) return overrides.get('var:' + key);
      if (cache.has(key)) return cache.get(key);
      const d = defs.get(key);
      if (!d) throw new Error(`Variabel "${name}" belum didefinisikan.`);
      if (stack.has(key)) throw new Error(`Rumus variabel "${name}" melingkar (merujuk dirinya sendiri).`);
      stack.add(key);
      try {
        const r = readField(d.value, scope, sep);
        if (r.v === null) throw new Error(`Variabel "${d.name}" belum diisi.`);
        cache.set(key, r.v);
        return r.v;
      } finally { stack.delete(key); }
    }
    const scope = { get, has: (n) => defs.has(String(n).toLowerCase()), names: () => Array.from(defs.values()).map((d) => d.name) };
    return scope;
  }

  /**
   * Baca isi kolom: angka biasa, "60%", atau rumus "=...".
   * @returns {{v:number|null, pct:boolean, formula:boolean}}
   */
  function readField(raw, scope, sep) {
    if (raw === null || raw === undefined) return { v: null, pct: false, formula: false };
    if (typeof raw === 'number') return { v: isFinite(raw) ? raw : NaN, pct: false, formula: false };
    const s = String(raw).trim();
    if (!s) return { v: null, pct: false, formula: false };
    if (s[0] === '=') {
      const body = s.slice(1).trim();
      if (!body) throw new Error('Rumus kosong.');
      const ast = compile(body, sep);
      const v = evalAst(ast, (name) => {
        if (!scope) throw new Error(`Variabel "${name}" belum didefinisikan.`);
        return scope.get(name);
      });
      if (!isFinite(v)) throw new Error('Hasil rumus bukan angka terhingga.');
      return { v, pct: /%\s*$/.test(body), formula: true };
    }
    const pct = /%$/.test(s);
    const v = parseNumber(pct ? s.slice(0, -1) : s, sep);
    if (Number.isNaN(v)) throw new Error(`"${s}" bukan angka. Awali dengan = untuk menulis rumus.`);
    return { v: v === null ? null : (pct ? v / 100 : v), pct, formula: false };
  }

  /* ------------------------------------------------------------------ *
   * Utilitas & sikap terhadap risiko
   * ------------------------------------------------------------------ */

  /**
   * risk: {mode: 'neutral'|'averse'|'seeking', R}
   *  - averse : U(x) = 1 − e^(−x/R)   → CE = −R·ln(1 − EU)
   *  - seeking: U(x) = e^(x/R) − 1    → CE =  R·ln(1 + EU)
   */
  function utility(risk) {
    const R = risk ? Number(risk.R) : NaN;
    if (!risk || risk.mode === 'neutral' || !(R > 0)) return { active: false, u: (x) => x, inv: (u) => u, label: 'Netral risiko (nilai harapan)' };
    if (risk.mode === 'averse') return { active: true, R, u: (x) => 1 - Math.exp(-x / R), inv: (u) => -R * Math.log(1 - u), label: `Menghindari risiko (R = ${R})` };
    return { active: true, R, u: (x) => Math.exp(x / R) - 1, inv: (u) => R * Math.log(1 + u), label: `Menyukai risiko (R = ${R})` };
  }

  /* ------------------------------------------------------------------ *
   * Evaluasi pohon
   * ------------------------------------------------------------------ */

  /**
   * Struktur pohon:
   *   node   = {id, type: 'decision'|'chance'|'terminal', name, branches: [branch], payoff (terminal)}
   *   branch = {id, name, prob (chance), value (arus kas cabang), child: node}
   * Nilai jalur = jumlah arus kas cabang sepanjang jalur + payoff simpul akhir.
   *
   * opts: { scope, sep, probPercent, objective: 'max'|'min', risk, overrides: Map }
   *   overrides kunci: 'p:<branchId>' (peluang 0..1), 'v:<branchId>' (arus kas), 't:<nodeId>' (payoff akhir), 'var:<nama>'
   */
  function evaluateTree(tree, opts) {
    opts = opts || {};
    const ov = opts.overrides || null;
    const maximize = opts.objective !== 'min';
    const U = maximize ? utility(opts.risk) : utility(null);
    const scope = opts.scope || makeScope([], opts.sep, ov);
    const errors = [];
    const nodes = new Map();
    const err = (nodeId, branchId, field, msg) => errors.push({ nodeId, branchId, field, msg });

    const readNum = (raw, key, nodeId, branchId, field, emptyAs) => {
      if (ov && ov.has(key)) return { v: ov.get(key), pct: false, formula: false, override: true };
      try {
        const r = readField(raw, scope, opts.sep);
        if (r.v === null) {
          if (emptyAs !== undefined) return { v: emptyAs, pct: false, formula: false };
          err(nodeId, branchId, field, 'Belum diisi.');
          return { v: NaN };
        }
        return r;
      } catch (e) { err(nodeId, branchId, field, e.message); return { v: NaN }; }
    };

    function walk(node, cum, depth) {
      const r = { id: node.id, type: node.type, name: node.name || '', cum, depth, branches: [] };
      nodes.set(node.id, r);
      if (node.type === 'terminal') {
        const t = readNum(node.payoff, 't:' + node.id, node.id, null, 'payoff', 0);
        r.terminal = t.v;
        r.payoff = cum + t.v;
        r.ev = r.payoff;
        r.eu = U.u(r.payoff);
        r.ce = r.payoff;
        r.value = r.payoff;
        r.min = r.max = r.payoff;
        return r;
      }
      if (!node.branches || !node.branches.length) {
        err(node.id, null, 'branches', `Simpul "${node.name || (node.type === 'chance' ? 'peluang' : 'keputusan')}" belum memiliki cabang.`);
        r.ev = r.eu = r.ce = r.value = NaN;
        return r;
      }
      for (const b of node.branches) {
        const cash = readNum(b.value, 'v:' + b.id, node.id, b.id, 'value', 0);
        const child = walk(b.child, cum + cash.v, depth + 1);
        r.branches.push({ id: b.id, name: b.name || '', cash: cash.v, cashFormula: !!cash.formula, p: null, child });
      }
      if (node.type === 'chance') {
        const raw = node.branches.map((b) => {
          if (ov && ov.has('p:' + b.id)) return { v: ov.get('p:' + b.id), override: true };
          const x = readNum(b.prob, '__none', node.id, b.id, 'prob');
          if (!isFinite(x.v)) return { v: NaN };
          const v = x.pct ? x.v : (opts.probPercent ? x.v / 100 : x.v);
          return { v, formula: !!x.formula };
        });
        // Bila sebagian peluang di-override (analisis sensitivitas), cabang lain yang berupa angka biasa diskalakan proporsional.
        if (raw.some((x) => x.override)) {
          const plainIdx = raw.map((x, i) => (!x.override && !x.formula ? i : -1)).filter((i) => i >= 0);
          const fixed = sum(raw.filter((x, i) => !plainIdx.includes(i)).map((x) => x.v));
          const base = sum(plainIdx.map((i) => raw[i].v));
          const target = Math.max(0, 1 - fixed);
          plainIdx.forEach((i) => { raw[i].v = base > EPS ? raw[i].v * target / base : target / plainIdx.length; });
        }
        raw.forEach((x, i) => {
          r.branches[i].p = x.v;
          if (isFinite(x.v) && (x.v < -PROB_TOL || x.v > 1 + PROB_TOL)) err(node.id, r.branches[i].id, 'prob', `Peluang harus di antara 0 dan ${opts.probPercent ? '100%' : '1'}.`);
        });
        const total = sum(raw.map((x) => x.v));
        if (isFinite(total) && Math.abs(total - 1) > PROB_TOL) err(node.id, null, 'probsum', `Jumlah peluang di simpul "${node.name || 'peluang'}" = ${+(total * (opts.probPercent ? 100 : 1)).toFixed(6)}${opts.probPercent ? '%' : ''}; harus ${opts.probPercent ? '100%' : '1'}.`);
        r.probSum = total;
        r.ev = sum(r.branches.map((b) => b.p * b.child.ev));
        r.eu = sum(r.branches.map((b) => b.p * b.child.eu));
        r.min = Math.min(...r.branches.filter((b) => b.p > EPS).map((b) => b.child.min));
        r.max = Math.max(...r.branches.filter((b) => b.p > EPS).map((b) => b.child.max));
      } else {
        const score = r.branches.map((b) => (U.active ? b.child.eu : b.child.ev));
        let bestScore = maximize ? -Infinity : Infinity;
        score.forEach((s) => { if (maximize ? s > bestScore : s < bestScore) bestScore = s; });
        r.best = score.map((s, i) => (near(s, bestScore, 1e-10) ? i : -1)).filter((i) => i >= 0);
        r.choice = r.best.length ? r.best[0] : 0;
        const c = r.branches[r.choice].child;
        r.ev = c.ev;
        r.eu = c.eu;
        r.min = c.min;
        r.max = c.max;
      }
      r.ce = U.inv(r.eu);
      r.value = U.active ? r.ce : r.ev;
      return r;
    }

    const rootRes = walk(tree, 0, 0);
    return { ok: errors.length === 0, errors, root: rootRes, nodes, utility: U, maximize };
  }

  /** Nilai tiap alternatif di simpul akar (bila akar = keputusan) dan indeks terbaik. */
  function rootValues(res) {
    const r = res.root;
    if (r.type === 'decision') return { names: r.branches.map((b) => b.name), values: r.branches.map((b) => b.child.value), ev: r.branches.map((b) => b.child.ev), best: r.choice, ties: r.best };
    return { names: [r.name || 'Akar'], values: [r.value], ev: [r.ev], best: 0, ties: [0] };
  }

  /** Daftar simpul keputusan beserta pilihan optimal; reachable = berada di jalur kebijakan optimal. */
  function policy(res) {
    const out = [];
    (function rec(r, reachable, trail) {
      if (r.type === 'terminal') return;
      if (r.type === 'decision') out.push({ id: r.id, name: r.name, choice: r.choice, choiceName: r.branches[r.choice].name, ties: r.best.map((i) => r.branches[i].name), value: r.value, ev: r.ev, reachable, trail });
      r.branches.forEach((b, i) => rec(b.child, reachable && (r.type === 'chance' ? b.p > EPS : i === r.choice), trail.concat(b.name)));
    }(res.root, true, []));
    return out;
  }

  /**
   * Semua jalur dari akar ke simpul akhir.
   * prob = peluang gabungan peristiwa sepanjang jalur (bersyarat pada cabang keputusan yang dilalui).
   * optimal = jalur mengikuti kebijakan optimal di semua simpul keputusan.
   */
  function paths(res) {
    const out = [];
    (function rec(r, prob, labels, optimal, rootIdx) {
      if (r.type === 'terminal') { out.push({ id: r.id, name: r.name, labels, prob, payoff: r.payoff, optimal, rootIdx }); return; }
      r.branches.forEach((b, i) => {
        const isRoot = r === res.root;
        rec(b.child, r.type === 'chance' ? prob * b.p : prob, labels.concat(b.name), optimal && (r.type === 'chance' || i === r.choice), isRoot ? i : rootIdx);
      });
    }(res.root, 1, [], true, null));
    return out;
  }

  /**
   * Profil risiko: distribusi nilai akhir bila memilih cabang akar ke-rootIdx lalu mengikuti kebijakan optimal.
   * rootIdx null → mengikuti kebijakan optimal sejak akar.
   */
  function riskProfile(res, rootIdx) {
    const pts = [];
    (function rec(r, prob) {
      if (prob <= 0) return;
      if (r.type === 'terminal') { pts.push({ x: r.payoff, p: prob }); return; }
      if (r.type === 'chance') { r.branches.forEach((b) => rec(b.child, prob * b.p)); return; }
      const i = (r === res.root && rootIdx !== null && rootIdx !== undefined) ? rootIdx : r.choice;
      rec(r.branches[i].child, prob);
    }(res.root, 1));
    pts.sort((a, b) => a.x - b.x);
    const merged = [];
    for (const q of pts) {
      const last = merged[merged.length - 1];
      if (last && near(last.x, q.x, 1e-12)) last.p += q.p; else merged.push({ x: q.x, p: q.p });
    }
    let c = 0;
    merged.forEach((m) => { c += m.p; m.cum = c; });
    const mean = sum(merged.map((m) => m.x * m.p));
    const variance = sum(merged.map((m) => m.p * (m.x - mean) * (m.x - mean)));
    return {
      points: merged, mean, sd: Math.sqrt(Math.max(0, variance)), min: merged.length ? merged[0].x : NaN, max: merged.length ? merged[merged.length - 1].x : NaN,
      pLoss: sum(merged.filter((m) => m.x < -EPS).map((m) => m.p))
    };
  }

  /** CDF di x (kanan-kontinu). */
  function cdfAt(points, x) { let c = 0; for (const m of points) { if (m.x <= x + EPS * Math.max(1, Math.abs(x))) c = m.cum; else break; } return c; }

  /**
   * Dominansi stokastik orde-1 dan orde-2 antara dua profil risiko.
   * Untuk tujuan maksimum: A mendominasi B (orde-1) bila F_A(x) ≤ F_B(x) untuk semua x.
   */
  function dominance(pa, pb, maximize) {
    const xs = Array.from(new Set(pa.points.map((m) => m.x).concat(pb.points.map((m) => m.x)))).sort((a, b) => a - b);
    let fsdAB = true, fsdBA = true, strict = false;
    let ssdAB = true, ssdBA = true;
    let intA = 0, intB = 0;
    for (let i = 0; i < xs.length; i++) {
      const fa = cdfAt(pa.points, xs[i]), fb = cdfAt(pb.points, xs[i]);
      if (fa > fb + 1e-12) fsdAB = false;
      if (fb > fa + 1e-12) fsdBA = false;
      if (Math.abs(fa - fb) > 1e-12) strict = true;
      if (i + 1 < xs.length) {
        const w = xs[i + 1] - xs[i];
        intA += fa * w; intB += fb * w;
        if (intA > intB + 1e-9 * Math.max(1, Math.abs(intB))) ssdAB = false;
        if (intB > intA + 1e-9 * Math.max(1, Math.abs(intA))) ssdBA = false;
      }
    }
    if (!strict) return { order: 0, winner: null };
    // Untuk tujuan minimum (biaya), nilai kecil lebih baik: balik arah.
    const aWins1 = maximize ? fsdAB : fsdBA, bWins1 = maximize ? fsdBA : fsdAB;
    if (aWins1) return { order: 1, winner: 'a' };
    if (bWins1) return { order: 1, winner: 'b' };
    if (maximize && pa.mean >= pb.mean - EPS && ssdAB) return { order: 2, winner: 'a' };
    if (maximize && pb.mean >= pa.mean - EPS && ssdBA) return { order: 2, winner: 'b' };
    return { order: 0, winner: null };
  }

  /* ------------------------------------------------------------------ *
   * Nilai informasi sempurna (EVPI) per ketidakpastian
   * ------------------------------------------------------------------ */

  const normKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  /** Kelompokkan simpul peluang yang mewakili ketidakpastian yang sama (nama simpul & nama cabang sama). */
  function eventGroups(tree) {
    const groups = new Map();
    (function rec(n, chanceAnc) {
      if (n.type === 'chance') {
        const key = normKey(n.name) + '::' + n.branches.map((b) => normKey(b.name)).join('|');
        if (!groups.has(key)) groups.set(key, { key, name: n.name || 'Simpul peluang', outcomes: n.branches.map((b) => b.name), nodes: [], anc: [] });
        groups.get(key).nodes.push(n);
        groups.get(key).anc.push(chanceAnc);
      }
      (n.branches || []).forEach((b) => rec(b.child, chanceAnc + (n.type === 'chance' ? 1 : 0)));
    }(tree, 0));
    return Array.from(groups.values());
  }

  /**
   * EVPI untuk sekumpulan ketidakpastian (diketahui sebelum semua keputusan).
   * Peluang hasil diambil dari simpul pertama tiap kelompok; consistent=false bila simpul lain berpeluang berbeda.
   */
  function evpi(tree, opts, groups, maxCombos) {
    const base = evaluateTree(tree, opts);
    if (!base.ok) return null;
    const U = base.utility;
    // Peluang acuan: simpul dengan paling sedikit peristiwa sebelumnya (peluang tak bersyarat bila ada).
    const info = groups.map((g) => {
      const anc = g.anc || g.nodes.map(() => 0);
      let ref = 0;
      anc.forEach((a, i) => { if (a < anc[ref]) ref = i; });
      const q = base.nodes.get(g.nodes[ref].id).branches.map((b) => b.p);
      const consistent = g.nodes.every((n) => { const r = base.nodes.get(n.id); return r && r.branches.every((b, i) => Math.abs(b.p - q[i]) < 1e-9); });
      return { g, q, consistent, ref };
    });
    let combos = 1;
    for (const x of info) combos *= x.q.length;
    if (combos > (maxCombos || 4096)) return { tooMany: true, combos };
    const idx = info.map(() => 0);
    let withInfoEV = 0, withInfoEU = 0;
    const scenarios = [];
    for (let c = 0; c < combos; c++) {
      let prob = 1;
      const ov = new Map(opts.overrides || []);
      info.forEach((x, gi) => {
        prob *= x.q[idx[gi]];
        for (const n of x.g.nodes) n.branches.forEach((b, j) => ov.set('p:' + b.id, j === idx[gi] ? 1 : 0));
      });
      if (prob > 0) {
        const r = evaluateTree(tree, Object.assign({}, opts, { overrides: ov }));
        const v = r.root.value;
        scenarios.push({ outcomes: info.map((x, gi) => x.g.outcomes[idx[gi]]), prob, value: v, choice: r.root.type === 'decision' ? r.root.branches[r.root.choice].name : null });
        withInfoEV += prob * v;
        withInfoEU += prob * U.u(v);
      }
      for (let gi = info.length - 1; gi >= 0; gi--) { idx[gi]++; if (idx[gi] < info[gi].q.length) break; idx[gi] = 0; }
    }
    const withInfo = U.active ? U.inv(withInfoEU) : withInfoEV;
    const v0 = base.root.value;
    return { base: v0, withInfo, evpi: base.maximize ? withInfo - v0 : v0 - withInfo, scenarios, consistent: info.every((x) => x.consistent), combos, q: info.map((x) => x.q), refNode: info.map((x) => x.g.nodes[x.ref].id) };
  }

  /* ------------------------------------------------------------------ *
   * Analisis sensitivitas
   * ------------------------------------------------------------------ */

  /** Daftar parameter angka (bukan rumus) di pohon: peluang, arus kas cabang, payoff akhir. */
  function treeParams(tree, opts) {
    const base = evaluateTree(tree, opts);
    const out = [];
    (function rec(n, trail) {
      if (n.type === 'terminal') {
        if (!isFormula(n.payoff)) {
          const r = base.nodes.get(n.id);
          out.push({ key: 't:' + n.id, kind: 'value', field: 'payoff', nodeId: n.id, label: `Payoff ${trail.length ? trail.join(' › ') : (n.name || 'akhir')}`, base: r ? r.terminal : NaN });
        }
        return;
      }
      const r = base.nodes.get(n.id);
      n.branches.forEach((b, i) => {
        const rb = r && r.branches[i];
        if (n.type === 'chance' && !isFormula(b.prob) && n.branches.length > 1) out.push({ key: 'p:' + b.id, kind: 'prob', field: 'prob', nodeId: n.id, branchId: b.id, label: `P(${b.name}) di ${n.name || 'simpul peluang'}${trail.length ? ' [' + trail.join(' › ') + ']' : ''}`, base: rb ? rb.p : NaN });
        const raw = b.value;
        const hasCash = raw !== null && raw !== undefined && String(raw).trim() !== '' && !isFormula(raw) && rb && rb.cash !== 0;
        if (hasCash) out.push({ key: 'v:' + b.id, kind: 'value', field: 'value', nodeId: n.id, branchId: b.id, label: `Arus kas cabang ${trail.concat(b.name).join(' › ')}`, base: rb.cash });
        rec(b.child, trail.concat(b.name));
      });
    }(tree, []));
    return out;
  }

  function linspace(lo, hi, n) { const out = []; for (let i = 0; i < n; i++) out.push(lo + (hi - lo) * i / (n - 1)); return out; }

  /**
   * evalFn(overrides:Map) → {values:[...], best:int} | null
   */
  function oneWay(evalFn, key, lo, hi, steps) {
    steps = steps || 41;
    const xs = linspace(lo, hi, steps);
    const series = [];
    const best = [];
    xs.forEach((x) => {
      const r = evalFn(new Map([[key, x]]));
      if (!r) { best.push(null); return; }
      r.values.forEach((v, k) => { (series[k] = series[k] || []).push(v); });
      best.push(r.best);
    });
    const breaks = [];
    for (let i = 1; i < xs.length; i++) {
      if (best[i] === null || best[i - 1] === null || best[i] === best[i - 1]) continue;
      let a = xs[i - 1], b = xs[i];
      const from = best[i - 1];
      for (let it = 0; it < 50; it++) { const m = (a + b) / 2; const r = evalFn(new Map([[key, m]])); if (r && r.best === from) a = m; else b = m; }
      const xm = (a + b) / 2;
      const rr = evalFn(new Map([[key, xm]]));
      breaks.push({ x: xm, from, to: best[i], value: rr ? rr.values[from] : NaN });
    }
    return { xs, series, best, breaks };
  }

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  /**
   * Tornado: tiap parameter digeser ±pct (nilai) atau ±probDelta (peluang).
   * baseValue = nilai akar dasar.
   */
  function tornado(evalFn, params, opts) {
    opts = opts || {};
    const pct = opts.pct === undefined ? 0.2 : opts.pct;
    const pd = opts.probDelta === undefined ? 0.1 : opts.probDelta;
    const base = evalFn(new Map());
    const out = [];
    for (const prm of params) {
      if (!isFinite(prm.base)) continue;
      let lo, hi;
      if (prm.kind === 'prob') { lo = clamp(prm.base - pd, 0, 1); hi = clamp(prm.base + pd, 0, 1); }
      else { const d = Math.abs(prm.base) * pct || pct; lo = prm.base - d; hi = prm.base + d; }
      if (lo === hi) continue;
      const rl = evalFn(new Map([[prm.key, lo]])), rh = evalFn(new Map([[prm.key, hi]]));
      if (!rl || !rh) continue;
      const vl = rl.values[rl.best], vh = rh.values[rh.best];
      out.push({ param: prm, lo, hi, vLo: vl, vHi: vh, swing: Math.abs(vh - vl), bestLo: rl.best, bestHi: rh.best, changes: rl.best !== base.best || rh.best !== base.best });
    }
    out.sort((a, b) => b.swing - a.swing);
    return { base: base.values[base.best], baseBest: base.best, rows: out };
  }

  /** Spider: nilai akar terhadap perubahan relatif tiap parameter (−pct..+pct). */
  function spider(evalFn, params, pct, steps) {
    pct = pct || 0.5;
    steps = steps || 11;
    const ts = linspace(-pct, pct, steps);
    return {
      ts,
      lines: params.filter((p) => isFinite(p.base) && p.base !== 0).map((prm) => ({
        param: prm,
        values: ts.map((t) => {
          let x = prm.base * (1 + t);
          if (prm.kind === 'prob') x = clamp(x, 0, 1);
          const r = evalFn(new Map([[prm.key, x]]));
          return r ? r.values[r.best] : NaN;
        })
      }))
    };
  }

  /** Dua arah: alternatif terbaik di setiap titik kisi (p1 × p2). */
  function twoWay(evalFn, k1, r1, k2, r2, n) {
    n = n || 31;
    const xs = linspace(r1[0], r1[1], n), ys = linspace(r2[0], r2[1], n);
    const grid = ys.map((y) => xs.map((x) => { const r = evalFn(new Map([[k1, x], [k2, y]])); return r ? { best: r.best, value: r.values[r.best] } : null; }));
    return { xs, ys, grid };
  }

  /* ------------------------------------------------------------------ *
   * Tabel payoff (keputusan dalam ketidakpastian / berisiko)
   * ------------------------------------------------------------------ */

  function argBest(arr, better) {
    let b = null;
    arr.forEach((v) => { if (isFinite(v) && (b === null || better(v, b))) b = v; });
    return arr.map((v, i) => (b !== null && near(v, b, 1e-10) ? i : -1)).filter((i) => i >= 0);
  }

  /**
   * M: m×n payoff; probs: n peluang (boleh null); alpha: koefisien optimisme Hurwicz.
   */
  function payoffCriteria(M, probs, opts) {
    opts = opts || {};
    const maximize = opts.objective !== 'min';
    const alpha = opts.alpha === undefined ? 0.5 : opts.alpha;
    const better = maximize ? (a, b) => a > b : (a, b) => a < b;
    const bestOf = (a) => (maximize ? Math.max(...a) : Math.min(...a));
    const worstOf = (a) => (maximize ? Math.min(...a) : Math.max(...a));
    const n = M[0].length;
    const colBest = [];
    for (let j = 0; j < n; j++) colBest.push(bestOf(M.map((r) => r[j])));
    const regret = M.map((row) => row.map((x, j) => (maximize ? colBest[j] - x : x - colBest[j])));
    const rows = M.map((row, i) => ({
      optimistic: bestOf(row),
      pessimistic: worstOf(row),
      hurwicz: alpha * bestOf(row) + (1 - alpha) * worstOf(row),
      laplace: sum(row) / n,
      ev: probs ? sum(row.map((x, j) => x * probs[j])) : NaN,
      maxRegret: Math.max(...regret[i]),
      eol: probs ? sum(regret[i].map((x, j) => x * probs[j])) : NaN
    }));
    const lower = (a, b) => a < b;
    const winners = {
      optimistic: argBest(rows.map((r) => r.optimistic), better),
      pessimistic: argBest(rows.map((r) => r.pessimistic), better),
      hurwicz: argBest(rows.map((r) => r.hurwicz), better),
      laplace: argBest(rows.map((r) => r.laplace), better),
      regret: argBest(rows.map((r) => r.maxRegret), lower),
      ev: probs ? argBest(rows.map((r) => r.ev), better) : [],
      eol: probs ? argBest(rows.map((r) => r.eol), lower) : []
    };
    let evwpi = NaN, evpiV = NaN, bestEV = NaN;
    if (probs) {
      evwpi = sum(colBest.map((x, j) => x * probs[j]));
      bestEV = rows[winners.ev[0]].ev;
      evpiV = maximize ? evwpi - bestEV : bestEV - evwpi;
    }
    return { rows, regret, colBest, winners, evwpi, evpi: evpiV, bestEV, maximize, alpha };
  }

  /**
   * Revisi Bayes. prior[s], L[s][k] = P(indikator k | keadaan s).
   */
  function bayes(prior, L) {
    const n = prior.length, K = L[0].length;
    const joint = prior.map((p, s) => L[s].map((l) => p * l));
    const marginal = [];
    for (let k = 0; k < K; k++) marginal.push(sum(joint.map((row) => row[k])));
    const posterior = joint.map((row) => row.map((x, k) => (marginal[k] > EPS ? x / marginal[k] : NaN)));
    const rowSums = L.map((row) => sum(row));
    return { joint, marginal, posterior, rowSums, n, K };
  }

  /**
   * Nilai informasi sampel (EVSI) untuk tabel payoff dengan indikator survei.
   */
  function evsi(M, prior, L, opts) {
    opts = opts || {};
    const maximize = opts.objective !== 'min';
    const better = maximize ? (a, b) => a > b : (a, b) => a < b;
    const crit = payoffCriteria(M, prior, opts);
    const B = bayes(prior, L);
    const perIndicator = B.marginal.map((m, k) => {
      const post = B.posterior.map((row) => row[k]);
      const evs = M.map((row) => sum(row.map((x, s) => x * (isFinite(post[s]) ? post[s] : 0))));
      const best = argBest(evs, better);
      return { k, marginal: m, posterior: post, evs, best, value: evs[best[0]] };
    });
    const evwsi = sum(perIndicator.filter((x) => x.marginal > EPS).map((x) => x.marginal * x.value));
    const evsiV = maximize ? evwsi - crit.bestEV : crit.bestEV - evwsi;
    const cost = opts.cost || 0;
    return {
      bayes: B, perIndicator, evwsi, evsi: evsiV, evpi: crit.evpi, bestEV: crit.bestEV,
      efficiency: crit.evpi > EPS ? evsiV / crit.evpi : NaN, cost, net: evsiV - cost, worthIt: evsiV - cost > EPS
    };
  }

  /**
   * Bentuk pohon setara dari tabel payoff (angka sudah dievaluasi).
   * t: {alternatives:[{name}], states:[{name}], M, prior, stateLabel, decisionLabel, sample?: {name, cost, indicators:[{name}], L}}
   */
  function tableToTree(t) {
    let seq = 0;
    const id = (p) => `${p}${++seq}`;
    const term = (v) => ({ id: id('n'), type: 'terminal', name: '', payoff: v, branches: [] });
    const chanceStates = (probs) => ({
      id: id('n'), type: 'chance', name: t.stateLabel || 'Kondisi',
      branches: t.states.map((s, j) => ({ id: id('b'), name: s.name, prob: probs[j], value: 0, child: null }))
    });
    const decisionAlts = (probs) => ({
      id: id('n'), type: 'decision', name: t.decisionLabel || 'Keputusan',
      branches: t.alternatives.map((a, i) => {
        const c = chanceStates(probs);
        c.branches.forEach((b, j) => { b.child = term(t.M[i][j]); });
        return { id: id('b'), name: a.name, prob: '', value: 0, child: c };
      })
    });
    if (!t.sample) return decisionAlts(t.prior);
    const B = bayes(t.prior, t.sample.L);
    const sname = t.sample.name || 'Survei';
    const withSurvey = {
      id: id('n'), type: 'chance', name: 'Hasil ' + sname,
      branches: t.sample.indicators.map((ind, k) => ({ id: id('b'), name: ind.name, prob: B.marginal[k], value: 0, child: decisionAlts(B.posterior.map((row) => (isFinite(row[k]) ? row[k] : 0))) }))
    };
    return {
      id: id('n'), type: 'decision', name: 'Lakukan ' + sname + '?',
      branches: [
        { id: id('b'), name: 'Lakukan ' + sname, prob: '', value: -(t.sample.cost || 0), child: withSurvey },
        { id: id('b'), name: 'Tanpa ' + sname, prob: '', value: 0, child: decisionAlts(t.prior) }
      ]
    };
  }

  /* ------------------------------------------------------------------ *
   * Utilitas pohon
   * ------------------------------------------------------------------ */

  function walkTree(tree, fn) {
    (function rec(n, parent, branch, depth) {
      fn(n, parent, branch, depth);
      (n.branches || []).forEach((b) => rec(b.child, n, b, depth + 1));
    }(tree, null, null, 0));
  }

  function countNodes(tree) { let c = 0; walkTree(tree, () => { c++; }); return c; }

  return {
    EPS, PROB_TOL, FUNCS, VAR_RE,
    sum, near, parseNumber, tokenize, parseExpr, compile, evalAst, astVars, toExcel, isFormula, makeScope, readField,
    utility, evaluateTree, rootValues, policy, paths, riskProfile, cdfAt, dominance,
    eventGroups, evpi, treeParams, linspace, oneWay, tornado, spider, twoWay,
    payoffCriteria, bayes, evsi, tableToTree, walkTree, countNodes
  };
}));
