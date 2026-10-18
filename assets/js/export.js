/*!
 * Decision Tree Calculator — ekspor berkas: XLSX (tanpa pustaka, dengan rumus hidup), CSV, PNG/SVG, PDF (jsPDF), DOCX
 * (c) 2026 Alfredo Garcia — MIT License
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./dt-core.js'), require('./model.js'));
  else root.DTExport = factory(root.DTCore, root.DTModel);
}(typeof self !== 'undefined' ? self : this, function (D, M) {
  'use strict';

  const TOOL_URL = 'https://edgarcia-id.github.io/decision-tree-calculator-v2/';
  const TOOL_NAME = 'Decision Tree Calculator';

  /* ------------------------------------------------------------------ *
   * Unduh berkas
   * ------------------------------------------------------------------ */

  function download(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function safeFileName(s, ext) {
    const base = String(s || 'pohon-keputusan').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'pohon-keputusan';
    return base + (ext ? '.' + ext : '');
  }

  /* ------------------------------------------------------------------ *
   * CSV
   * ------------------------------------------------------------------ */

  /** CSV dengan BOM. Pemisah ';' bila desimal koma (Excel Indonesia), ',' bila desimal titik. */
  function csvString(rows, decimalSep) {
    const sep = decimalSep === ',' ? ';' : ',';
    const q = (v) => {
      if (v === null || v === undefined) return '';
      let s = typeof v === 'number' ? (isFinite(v) ? String(+v.toPrecision(15)) : '') : String(v);
      if (typeof v === 'number' && decimalSep === ',') s = s.replace('.', ',');
      return new RegExp('["\\n\\r' + sep + ']').test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + rows.map((r) => r.map(q).join(sep)).join('\r\n') + '\r\n';
  }

  function pathRows(R) {
    const rows = [['No', 'Jalur', 'Peluang jalur', 'Nilai jalur', 'Kebijakan optimal']];
    R.paths.forEach((x, i) => rows.push([i + 1, x.labels.join(' > '), x.prob, x.payoff, x.optimal ? 'Ya' : 'Tidak']));
    return rows;
  }

  /* ------------------------------------------------------------------ *
   * ZIP (store) + XLSX minimal
   * ------------------------------------------------------------------ */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function zip(files) {
    const enc = new TextEncoder();
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const locals = [], centrals = [];
    let offset = 0;
    for (const file of files) {
      const name = enc.encode(file.name);
      const data = typeof file.data === 'string' ? enc.encode(file.data) : file.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      locals.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      centrals.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = centrals.reduce((s, b) => s + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const parts = locals.concat(centrals, [new Uint8Array(end.buffer)]);
    const total = parts.reduce((s, b) => s + b.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const b of parts) { out.set(b, o); o += b.length; }
    return out;
  }

  const S = { normal: 0, bold: 1, title: 2, note: 3, th: 4, num: 5, pct: 6, td: 7, numb: 8, pctb: 9, n4: 10, int: 11, tdb: 12, inNum: 13, inPct: 14 };

  function stylesXml(decimals) {
    const d = Math.max(0, Math.min(6, decimals === undefined ? 2 : decimals));
    const numFmt = '#,##0' + (d ? '.' + '0'.repeat(d) : '');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<numFmts count="3"><numFmt numFmtId="164" formatCode="${numFmt}"/><numFmt numFmtId="165" formatCode="0.00%"/><numFmt numFmtId="166" formatCode="0.000000"/></numFmts>` +
      '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="14"/><color rgb="FF312E81"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font></fonts>' +
      '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="15">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
      '<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
      '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }

  function xmlEsc(s) {
    return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function colName(i) {
    let s = '';
    i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  function ref(r, c, absCol, absRow) { return (absCol ? '$' : '') + colName(c) + (absRow ? '$' : '') + (r + 1); }

  function sheetXml(sheet) {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    if (sheet.cols && sheet.cols.length) {
      xml += '<cols>' + sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    }
    xml += '<sheetData>';
    sheet.rows.forEach((row, r) => {
      if (!row || !row.length) return;
      let cells = '';
      row.forEach((cell, c) => {
        if (cell === null || cell === undefined || cell === '') return;
        const o = typeof cell === 'object' ? cell : { v: cell };
        const at = ref(r, c);
        const st = o.s !== undefined ? ` s="${o.s}"` : (typeof o.v === 'number' ? ' s="0"' : '');
        if (o.f) {
          const v = typeof o.v === 'number' && isFinite(o.v) ? `<v>${o.v}</v>` : '';
          cells += `<c r="${at}"${st}><f>${xmlEsc(o.f)}</f>${v}</c>`;
        } else if (typeof o.v === 'number') {
          if (isFinite(o.v)) cells += `<c r="${at}"${st}><v>${o.v}</v></c>`;
        } else {
          cells += `<c r="${at}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(o.v)}</t></is></c>`;
        }
      });
      if (cells) xml += `<row r="${r + 1}">${cells}</row>`;
    });
    xml += '</sheetData></worksheet>';
    return xml;
  }

  function uniqueSheetName(name, used) {
    let base = String(name).replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
    let n = base, k = 2;
    while (used.has(n.toLowerCase())) { const suf = ' (' + k++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
    used.add(n.toLowerCase());
    return n;
  }

  /** sheets: [{name, rows, cols}], sheets.names: [{name, sheet, ref}], sheets.decimals → Uint8Array .xlsx */
  function buildXlsx(sheets) {
    const used = new Set();
    const named = sheets.map((s) => Object.assign({}, s, { name: uniqueSheetName(s.name, used) }));
    const defNames = (sheets.names || []).map((n) => {
      const sh = named.find((s, i) => sheets[i].name === n.sheet);
      return sh ? `<definedName name="${xmlEsc(n.name)}">${xmlEsc("'" + sh.name.replace(/'/g, "''") + "'!" + n.ref)}</definedName>` : '';
    }).join('');
    const files = [];
    files.push({
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        named.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>'
    });
    files.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
    });
    files.push({
      name: 'docProps/core.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:title>${xmlEsc(sheets.title || 'Analisis pohon keputusan')}</dc:title><dc:creator>${TOOL_NAME}</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`
    });
    files.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView/></bookViews><sheets>' +
        named.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets>' + (defNames ? `<definedNames>${defNames}</definedNames>` : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'
    });
    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        named.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    });
    files.push({ name: 'xl/styles.xml', data: stylesXml(sheets.decimals) });
    named.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }));
    return zip(files);
  }

  /* ------------------------------------------------------------------ *
   * Isi workbook dari laporan (rumus hidup)
   * ------------------------------------------------------------------ */

  const th = (v) => ({ v, s: S.th });
  const td = (v) => ({ v, s: S.td });
  const tdb = (v) => ({ v, s: S.tdb });
  const nm = (v) => ({ v, s: S.num });
  const pc = (v) => ({ v, s: S.pct });
  const fx = (f, v, s) => ({ f, v, s: s === undefined ? S.num : s });
  const qs = (name) => "'" + String(name).replace(/'/g, "''") + "'";
  const sref = (sheet, r, c) => qs(sheet) + '!' + ref(r, c, true, true);
  const rng = (r1, c1, r2, c2) => ref(r1, c1, true, true) + ':' + ref(r2, c2, true, true);
  const xs = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const finite = (x) => (typeof x === 'number' && isFinite(x) ? x : undefined);

  const TYPE_LABEL = { decision: 'Keputusan', chance: 'Peluang', terminal: 'Akhir' };

  /** Simpul hasil evaluasi dalam urutan DFS + indeks induk/anak. */
  function nodeList(res) {
    const out = [];
    (function rec(r, parent, branch, depth) {
      const k = out.length;
      const it = { r, parent, branch, depth, k, kids: [] };
      out.push(it);
      if (parent !== null) out[parent].kids.push(k);
      (r.branches || []).forEach((b) => rec(b.child, k, b, depth + 1));
    }(res.root, null, null, 0));
    return out;
  }

  /** Sumber isian mentah (rumus) per id simpul / cabang. */
  function rawIndex(tree) {
    const byNode = new Map(), byBranch = new Map();
    D.walkTree(tree, (n, parent, b) => { byNode.set(n.id, n); if (b) byBranch.set(b.id, b); });
    return { byNode, byBranch };
  }

  /** Isian → sel Excel: rumus diterjemahkan (variabel = nama terdefinisi v_<nama>), angka biasa = nilai. */
  function rawCell(raw, value, sep, style, asProb) {
    if (D.isFormula(raw)) {
      try {
        const body = String(raw).trim().slice(1).trim();
        const ast = D.compile(body, sep);
        let f = D.toExcel(ast, (n) => 'v_' + n.toLowerCase());
        if (asProb && asProb.percent && !/%\s*$/.test(body)) f = '(' + f + ')/100';
        return fx(f, finite(value), style);
      } catch (e) { /* jatuh ke nilai */ }
    }
    return { v: finite(value), s: style };
  }

  function variablesSheet(p) {
    const sep = p.settings.decimalSep;
    const scope = D.makeScope(p.variables, sep);
    const rows = [[{ v: 'Variabel', s: S.title }], [{ v: 'Sel kuning dapat diubah. Setiap variabel adalah nama terdefinisi (Formulas › Name Manager) yang dipakai rumus di sheet Pohon.', s: S.note }], [],
      [th('Nama'), th('Nilai / rumus'), th('Nama di Excel'), th('Keterangan')]];
    const names = [];
    p.variables.forEach((v) => {
      let val;
      try { val = scope.get(v.name); } catch (e) { val = NaN; }
      const r = rows.length;
      rows.push([td(v.name), rawCell(v.value, val, sep, S.inNum), td('v_' + v.name.toLowerCase()), td(v.note || '')]);
      names.push({ name: 'v_' + v.name.toLowerCase(), sheet: 'Variabel', ref: ref(r, 1, true, true) });
    });
    return { sheet: { name: 'Variabel', rows, cols: [22, 18, 22, 48] }, names };
  }

  /**
   * Sheet pohon: satu baris per simpul, rumus rollback hidup.
   * Kolom: ID, Induk, Cabang, Jenis, Nama, Peluang, Arus kas, Nilai akhir, Kumulatif, EV, [EU, CE], Pilihan, Σ peluang
   */
  function treeSheet(R, sheetName, srcTree, fromUser) {
    const p = R.project, c = R.comp, res = c.res, U = res.utility;
    const sep = p.settings.decimalSep;
    const percent = fromUser && p.settings.probFormat === 'percent';
    const mx = res.maximize, util = U.active;
    const list = nodeList(res);
    const raw = rawIndex(srcTree);
    const rows = [];
    rows[0] = [{ v: sheetName === 'Pohon' ? 'Pohon keputusan — perhitungan mundur (rollback) dengan rumus' : 'Pohon keputusan setara dari tabel payoff', s: S.title }];
    rows[1] = [{ v: 'Sel kuning = isian (boleh diubah); kolom lain dihitung ulang otomatis. Nilai jalur = arus kas kumulatif + nilai akhir. Simpul peluang = Σ peluang × nilai; simpul keputusan = ' + (mx ? 'MAX' : 'MIN') + ' nilai cabang.', s: S.note }];
    rows[2] = [td('Tujuan'), td(mx ? 'Maksimalkan' : 'Minimalkan')];
    let Rref = null;
    if (util) {
      rows[3] = [td('Toleransi risiko R'), { v: U.R, s: S.inNum }, td(U.label.replace(/\s*\(R = .*\)$/, ''))];
      Rref = ref(3, 1, true, true);
    }
    const H = 5, R0 = H + 1;
    const C = { id: 0, par: 1, br: 2, type: 3, name: 4, p: 5, cash: 6, term: 7, cum: 8, ev: 9 };
    let col = 10;
    if (util) { C.eu = col++; C.ce = col++; }
    C.choice = col++;
    C.sum = col++;
    const head = ['ID', 'Induk', 'Cabang', 'Jenis simpul', 'Nama simpul', 'Peluang', 'Arus kas cabang', 'Nilai akhir', 'Arus kas kumulatif', util ? 'Nilai harapan (EV) kebijakan' : (mx ? 'Nilai harapan (EV)' : 'Biaya harapan')];
    if (util) head.push('Utilitas harapan (EU)', 'Certainty equivalent (CE)');
    head.push('Pilihan optimal', 'Σ peluang cabang');
    rows[H] = head.map(th);
    const at = (k, cc) => ref(R0 + k, cc);
    const averse = p.settings.risk.mode === 'averse';
    const uOf = (x) => (averse ? `1-EXP(-(${x})/${Rref})` : `EXP((${x})/${Rref})-1`);
    const invOf = (x) => (averse ? `-${Rref}*LN(1-${x})` : `${Rref}*LN(1+${x})`);
    for (const it of list) {
      const r = it.r, k = it.k;
      const row = [];
      const parent = it.parent === null ? null : list[it.parent];
      row[C.id] = td('S' + (k + 1));
      row[C.par] = td(parent ? 'S' + (parent.k + 1) : '–');
      row[C.br] = td(parent ? '   '.repeat(Math.max(0, it.depth - 1)) + (it.branch.name || '(cabang)') : '(akar)');
      row[C.type] = td(TYPE_LABEL[r.type]);
      row[C.name] = td(r.type === 'terminal' ? '' : (r.name || ''));
      if (parent && parent.r.type === 'chance') {
        const src = raw.byBranch.get(it.branch.id);
        row[C.p] = rawCell(src ? src.prob : null, it.branch.p, sep, S.inPct, { percent });
        row[C.p].s = S.inPct;
      }
      if (parent) { const src = raw.byBranch.get(it.branch.id); row[C.cash] = rawCell(src ? src.value : null, it.branch.cash, sep, S.inNum); }
      if (r.type === 'terminal') { const src = raw.byNode.get(r.id); row[C.term] = rawCell(src ? src.payoff : null, r.terminal, sep, S.inNum); }
      row[C.cum] = parent ? fx(`${at(parent.k, C.cum)}+${at(k, C.cash)}`, r.cum) : nm(0);
      const kids = it.kids.map((j) => list[j]);
      if (r.type === 'terminal') {
        row[C.ev] = fx(`${at(k, C.cum)}+${at(k, C.term)}`, r.ev);
        if (util) { row[C.eu] = fx(uOf(at(k, C.ev)), r.eu, S.n4); row[C.ce] = fx(at(k, C.ev), r.ce); }
      } else if (r.type === 'chance') {
        row[C.ev] = fx(kids.map((q) => `${at(q.k, C.p)}*${at(q.k, C.ev)}`).join('+'), r.ev);
        if (util) { row[C.eu] = fx(kids.map((q) => `${at(q.k, C.p)}*${at(q.k, C.eu)}`).join('+'), r.eu, S.n4); row[C.ce] = fx(invOf(at(k, C.eu)), r.ce); }
        row[C.sum] = fx('SUM(' + kids.map((q) => at(q.k, C.p)).join(',') + ')', r.probSum, S.pct);
      } else if (kids.length) {
        const keyCol = util ? C.eu : C.ev;
        const nested = (vals) => { let f = vals[vals.length - 1]; for (let i = kids.length - 2; i >= 0; i--) f = `IF(${at(kids[i].k, keyCol)}=${at(k, keyCol)},${vals[i]},${f})`; return f; };
        if (util) {
          row[C.eu] = fx(`MAX(${kids.map((q) => at(q.k, C.eu)).join(',')})`, r.eu, S.n4);
          row[C.ce] = fx(invOf(at(k, C.eu)), r.ce);
          row[C.ev] = fx(nested(kids.map((q) => at(q.k, C.ev))), r.ev);
        } else row[C.ev] = fx(`${mx ? 'MAX' : 'MIN'}(${kids.map((q) => at(q.k, C.ev)).join(',')})`, r.ev);
        row[C.choice] = fx(nested(kids.map((q) => xs(q.branch.name || '(cabang)'))), r.branches[r.choice].name, S.td);
      }
      if (r.type === 'decision' && it.k === 0 && row[C.choice]) row[C.choice].s = S.tdb;
      rows[R0 + k] = row;
    }
    if (rows[R0] && rows[R0][util ? C.ce : C.ev]) rows[R0][util ? C.ce : C.ev].s = S.numb;
    const cols = [6, 7, 30, 12, 26, 11, 14, 13, 14, 16].concat(util ? [14, 16] : [], [24, 12]);
    return { sheet: { name: sheetName, rows, cols }, list, C, R0, util };
  }

  function workbookFromReport(R) {
    const p = R.project, c = R.comp, res = c.res, fmt = R.fmt;
    const U = res.utility, mx = res.maximize;
    const sheets = [];
    sheets.decimals = p.settings.decimals;
    sheets.names = [];
    const unit = p.settings.unit ? ` (${p.settings.unit})` : '';

    // --- Ringkasan (diisi setelah sheet pohon diketahui)
    const sum = [];
    sheets.push({ name: 'Ringkasan', rows: sum, cols: [34, 22, 18, 16, 16, 16, 14] });

    let vars = null;
    if (p.variables.length) { vars = variablesSheet(p); sheets.names.push(...vars.names); }
    const tName = p.mode === 'tree' ? 'Pohon' : 'Pohon setara';
    const T = treeSheet(R, tName, p.mode === 'tree' ? p.tree : c.tree, p.mode === 'tree');

    // --- Tabel payoff & Bayes (mode tabel)
    let tabSheets = [];
    if (p.mode === 'table') tabSheets = tableSheets(R);

    sheets.push(...tabSheets);
    sheets.push(T.sheet);
    if (vars) sheets.push(vars.sheet);

    sum.push([{ v: p.meta.title, s: S.title }]);
    sum.push([{ v: `Dibuat dengan ${TOOL_NAME} — ${TOOL_URL}`, s: S.note }]);
    sum.push([]);
    const metaRows = [['Tanggal', R.dateLabel], ['Model', p.mode === 'tree' ? 'Pohon keputusan' : 'Tabel payoff'], ['Tujuan', mx ? 'Maksimalkan' : 'Minimalkan'], ['Sikap terhadap risiko', U.label], ['Satuan nilai', p.settings.unit || '–']];
    if (p.meta.author) metaRows.unshift(['Disusun oleh', p.meta.author]);
    metaRows.forEach((m) => sum.push([tdb(m[0]), td(m[1])]));
    sum.push([]);
    sum.push([tdb('Rekomendasi'), td(R.verdict)]);
    const rootRow = T.R0;
    sum.push([tdb((U.active ? 'Certainty equivalent' : (mx ? 'Nilai harapan' : 'Biaya harapan')) + ' di simpul akar' + unit), fx(sref(tName, rootRow, U.active ? T.C.ce : T.C.ev), res.root.value, S.numb)]);
    if (res.root.type === 'decision') sum.push([tdb('Pilihan di simpul akar (rumus)'), fx(sref(tName, rootRow, T.C.choice), res.root.branches[res.root.choice].name, S.tdb)]);
    sum.push([]);
    sum.push([{ v: 'Nilai tiap alternatif (mengikuti kebijakan optimal)', s: S.bold }]);
    const hd = ['Alternatif', mx ? 'Nilai harapan' : 'Biaya harapan'];
    if (U.active) hd.push('CE');
    hd.push('Simpangan baku', 'Minimum', 'Maksimum');
    if (mx) hd.push('P(rugi)');
    sum.push(hd.map(th));
    const rootIt = T.list[0];
    R.profiles.forEach((pf, i) => {
      const childK = res.root.type === 'decision' ? rootIt.kids[i] : 0;
      const best = R.rootValues.ties.includes(i);
      const row = [best ? tdb(pf.name) : td(pf.name), fx(sref(tName, T.R0 + childK, T.C.ev), pf.mean, best ? S.numb : S.num)];
      if (U.active) row.push(fx(sref(tName, T.R0 + childK, T.C.ce), R.rootValues.values[i], best ? S.numb : S.num));
      row.push(nm(pf.sd), nm(pf.min), nm(pf.max));
      if (mx) row.push(pc(pf.pLoss));
      sum.push(row);
    });
    sum.push([]);
    sum.push([{ v: 'Kebijakan optimal', s: S.bold }]);
    sum.push([th('Titik keputusan'), th('Konteks'), th('Pilihan'), th('Nilai')]);
    R.policy.filter((x) => x.reachable).forEach((x) => sum.push([td(x.name || 'Keputusan'), td(x.trail.join(' > ') || '(akar)'), td(x.choiceName), nm(x.value)]));

    // --- Jalur
    const jr = [[{ v: 'Semua jalur', s: S.title }], [{ v: 'Peluang jalur = hasil kali peluang cabang kejadian sepanjang jalur (rumus merujuk sheet ' + tName + ').', s: S.note }], [],
      [th('No'), th('Jalur'), th('Peluang jalur'), th('Nilai jalur' + unit), th('Kebijakan optimal')]];
    const termK = T.list.filter((it) => it.r.type === 'terminal');
    termK.slice(0, 20000).forEach((it, i) => {
      const parts = [];
      let cur = it;
      while (cur.parent !== null) { const par = T.list[cur.parent]; if (par.r.type === 'chance') parts.push(sref(tName, T.R0 + cur.k, T.C.p)); cur = par; }
      const path = R.paths[i];
      jr.push([{ v: i + 1, s: S.int }, td(path ? path.labels.join(' > ') : ''), fx(parts.length ? parts.reverse().join('*') : '1', path ? path.prob : undefined, S.pct), fx(sref(tName, T.R0 + it.k, T.C.ev), it.r.payoff), td(path && path.optimal ? 'Ya' : '')]);
    });
    sheets.push({ name: 'Jalur', rows: jr, cols: [6, 60, 14, 16, 16] });

    // --- Profil risiko (nilai)
    const pr = [[{ v: 'Profil risiko', s: S.title }], [{ v: 'Distribusi nilai akhir tiap alternatif bila mengikuti kebijakan optimal.', s: S.note }], []];
    R.profiles.forEach((pf) => {
      pr.push([{ v: pf.name, s: S.bold }, td(`rata-rata ${fmt.v(pf.mean)}; simpangan baku ${fmt.v(pf.sd)}`)]);
      pr.push([th('Nilai' + unit), th('Peluang'), th('Peluang kumulatif')]);
      pf.points.forEach((q) => pr.push([nm(q.x), pc(q.p), pc(q.cum)]));
      pr.push([]);
    });
    sheets.push({ name: 'Profil risiko', rows: pr, cols: [26, 14, 18] });

    // --- Sensitivitas (nilai)
    const sr = [[{ v: 'Analisis sensitivitas', s: S.title }], [{ v: `Tornado: nilai ±${C0(p.settings.sens.pct)}%, peluang ±${C0(p.settings.sens.probDelta)} poin persen (peluang lain di simpul yang sama diskalakan proporsional).`, s: S.note }], [],
      [th('Parameter'), th('Nilai dasar'), th('Rendah'), th('Nilai keputusan (rendah)'), th('Tinggi'), th('Nilai keputusan (tinggi)'), th('Selisih'), th('Keputusan berubah?')]];
    R.tornado.rows.forEach((r) => {
      const pk = r.param.kind === 'prob';
      sr.push([td(r.param.label), pk ? pc(r.param.base) : nm(r.param.base), pk ? pc(r.lo) : nm(r.lo), nm(r.vLo), pk ? pc(r.hi) : nm(r.hi), nm(r.vHi), nm(r.swing), td(r.changes ? 'Ya' : 'Tidak')]);
    });
    if (R.oneWay) {
      const o = R.oneWay;
      sr.push([]);
      sr.push([{ v: 'Sensitivitas satu arah: ' + o.prm.label, s: S.bold }]);
      sr.push([th(o.prm.label)].concat(o.names.map((n) => th(n)), [th('Terbaik')]));
      o.res.xs.forEach((x, i) => sr.push([o.prm.kind === 'prob' ? pc(x) : nm(x)].concat(o.res.series.map((s) => nm(s[i])), [td(o.names[o.res.best[i]] || '')])));
      if (o.res.breaks.length) {
        sr.push([]);
        sr.push([th('Titik impas'), th('Dari'), th('Ke')]);
        o.res.breaks.forEach((b) => sr.push([o.prm.kind === 'prob' ? pc(b.x) : nm(b.x), td(o.names[b.from]), td(o.names[b.to])]));
      }
    }
    sheets.push({ name: 'Sensitivitas', rows: sr, cols: [34, 16, 16, 18, 16, 18, 14, 18] });

    // --- Nilai informasi (pohon)
    if (R.evpi) {
      const vr = [[{ v: 'Nilai informasi sempurna (EVPI)', s: S.title }], [{ v: 'EVPI = nilai keputusan bila hasil ketidakpastian diketahui lebih dulu − nilai keputusan sekarang.', s: S.note }], [],
        [th('Ketidakpastian'), th('Hasil & peluang'), th('Nilai dengan informasi'), th('EVPI'), th('Peluang antar simpul')]];
      R.evpi.groups.forEach(({ g, r }) => {
        if (!r || r.tooMany) return;
        vr.push([td(g.name), td(g.outcomes.map((o, i) => `${o} ${fmt.p(r.q[0][i])}`).join(' · ')), nm(r.withInfo), { v: r.evpi, s: S.numb }, td(r.consistent ? 'Sama' : 'Berbeda (bersyarat)')]);
      });
      if (R.evpi.total && !R.evpi.total.tooMany) vr.push([tdb('Semua ketidakpastian'), td('dianggap saling bebas'), nm(R.evpi.total.withInfo), { v: R.evpi.total.evpi, s: S.numb }, td('')]);
      sheets.push({ name: 'Nilai informasi', rows: vr, cols: [30, 46, 20, 14, 20] });
    }

    sheets.title = p.meta.title;
    return sheets;
  }
  const C0 = (x) => String(+Number(x).toPrecision(10));

  /** Sheet "Tabel payoff" (+ "Bayes & EVSI") dengan rumus kriteria hidup. */
  function tableSheets(R) {
    const p = R.project, c = R.comp, t = p.table, tv = c.table, cr = c.criteria;
    const sep = p.settings.decimalSep, percent = p.settings.probFormat === 'percent';
    const mx = cr.maximize;
    const n = t.alternatives.length, m = t.states.length;
    const BEST = mx ? 'MAX' : 'MIN', WORST = mx ? 'MIN' : 'MAX';
    const name = 'Tabel payoff';
    const rows = [];
    rows[0] = [{ v: 'Tabel payoff dan kriteria keputusan', s: S.title }];
    rows[1] = [{ v: 'Sel kuning = isian (boleh diubah). Kriteria, regret, EVwPI, dan EVPI dihitung dengan rumus.', s: S.note }];
    rows[3] = [td('Koefisien optimisme Hurwicz (α)'), rawCell(t.alpha, tv.alpha, sep, S.inNum)];
    rows[3][1].s = S.inNum;
    const aRef = ref(3, 1, true, true);
    const HR = 5, PR = 6, A0 = 7;
    const c0 = m + 1;
    const K = { opt: c0, pes: c0 + 1, hur: c0 + 2, lap: c0 + 3, ev: c0 + 4, reg: c0 + 5, eol: c0 + 6 };
    rows[HR] = [th(`${t.decisionLabel} \\ ${t.stateLabel}`)].concat(t.states.map((s) => th(s.name)), [th(mx ? 'Maximax' : 'Minimin'), th(mx ? 'Maximin' : 'Minimax'), th('Hurwicz'), th('Laplace'), th(mx ? 'Nilai harapan (EV)' : 'Biaya harapan'), th('Regret maksimum'), th('EOL')]);
    rows[PR] = [tdb('Peluang')].concat(t.states.map((s, j) => { const cell = rawCell(s.prob, tv.prior[j], sep, S.inPct, { percent }); cell.s = S.inPct; return cell; }));
    const probRng = rng(PR, 1, PR, m);
    const BR = A0 + n, CR = A0 + n + 1, WR = A0 + n + 3, PIR = A0 + n + 4, RH = A0 + n + 6, RG0 = RH + 1;
    t.alternatives.forEach((a, i) => {
      const r = A0 + i;
      const rr = rng(r, 1, r, m);
      const row = [td(a.name)].concat(t.states.map((s, j) => rawCell(t.payoffs[a.id][s.id], tv.M[i][j], sep, S.inNum)));
      row.forEach((cell, j) => { if (j > 0) cell.s = S.inNum; });
      const cri = cr.rows[i];
      row[K.opt] = fx(`${BEST}(${rr})`, cri.optimistic);
      row[K.pes] = fx(`${WORST}(${rr})`, cri.pessimistic);
      row[K.hur] = fx(`${aRef}*${ref(r, K.opt)}+(1-${aRef})*${ref(r, K.pes)}`, cri.hurwicz);
      row[K.lap] = fx(`AVERAGE(${rr})`, cri.laplace);
      row[K.ev] = fx(`SUMPRODUCT(${probRng},${rr})`, cri.ev);
      row[K.reg] = fx(`MAX(${rng(RG0 + i, 1, RG0 + i, m)})`, cri.maxRegret);
      row[K.eol] = fx(`SUMPRODUCT(${probRng},${rng(RG0 + i, 1, RG0 + i, m)})`, cri.eol);
      rows[r] = row;
    });
    const altRng = rng(A0, 0, A0 + n - 1, 0);
    rows[BR] = [tdb('Terbaik per kondisi / kriteria')].concat(t.states.map((s, j) => fx(`${BEST}(${rng(A0, 1 + j, A0 + n - 1, 1 + j)})`, cr.colBest[j], S.numb)));
    rows[CR] = [tdb('Alternatif terpilih')];
    const winKey = { opt: 'optimistic', pes: 'pessimistic', hur: 'hurwicz', lap: 'laplace', ev: 'ev', reg: 'regret', eol: 'eol' };
    Object.keys(K).forEach((k) => {
      const colR = rng(A0, K[k], A0 + n - 1, K[k]);
      const fn = k === 'reg' || k === 'eol' ? 'MIN' : BEST;
      const w = cr.winners[winKey[k]];
      const bestVal = w.length ? cr.rows[w[0]][k === 'opt' ? 'optimistic' : k === 'pes' ? 'pessimistic' : k === 'hur' ? 'hurwicz' : k === 'lap' ? 'laplace' : k === 'ev' ? 'ev' : k === 'reg' ? 'maxRegret' : 'eol'] : undefined;
      rows[BR][K[k]] = fx(`${fn}(${colR})`, bestVal, S.numb);
      rows[CR][K[k]] = fx(`INDEX(${altRng},MATCH(${ref(BR, K[k])},${colR},0))`, w.length ? t.alternatives[w[0]].name : '', S.tdb);
    });
    rows[WR] = [tdb('EV dengan informasi sempurna (EVwPI)'), fx(`SUMPRODUCT(${probRng},${rng(BR, 1, BR, m)})`, cr.evwpi, S.numb)];
    rows[PIR] = [tdb('EVPI'), fx(mx ? `${ref(WR, 1)}-${ref(BR, K.ev)}` : `${ref(BR, K.ev)}-${ref(WR, 1)}`, cr.evpi, S.numb), { v: mx ? 'EVwPI − EV terbaik' : 'Biaya harapan terbaik − EVwPI', s: S.note }];
    rows[RH] = [th('Regret (opportunity loss)')].concat(t.states.map((s) => th(s.name)));
    t.alternatives.forEach((a, i) => {
      rows[RG0 + i] = [td(a.name)].concat(t.states.map((s, j) => fx(mx ? `${ref(BR, 1 + j)}-${ref(A0 + i, 1 + j)}` : `${ref(A0 + i, 1 + j)}-${ref(BR, 1 + j)}`, cr.regret[i][j])));
    });
    const out = [{ name, rows, cols: [34].concat(t.states.map(() => 14), [13, 13, 13, 13, 16, 15, 13]) }];

    const smv = c.sample;
    if (smv && tv.sample) {
      const sm = t.sample, L = tv.sample.L, B = smv.bayes;
      const K2 = sm.indicators.length;
      const br = [];
      br[0] = [{ v: 'Revisi Bayes dan nilai informasi sampel (EVSI)', s: S.title }];
      br[1] = [{ v: 'Sel kuning = isian. P(kondisi | indikator) = P(indikator | kondisi) × P(kondisi) / P(indikator).', s: S.note }];
      br[3] = [td('Biaya ' + (sm.name || 'informasi')), rawCell(sm.cost, tv.sample.cost, sep, S.inNum)];
      br[3][1].s = S.inNum;
      const costRef = ref(3, 1, true, true);
      const LH = 5, L0 = 6;
      br[LH] = [th('P(indikator | kondisi)')].concat(sm.indicators.map((k) => th(k.name)), [th('Peluang awal (prior)'), th('Σ baris')]);
      t.states.forEach((s, j) => {
        br[L0 + j] = [td(s.name)].concat(sm.indicators.map((k, q) => { const cell = rawCell((sm.likelihood[s.id] || {})[k.id], L[j][q], sep, S.inPct, { percent }); cell.s = S.inPct; return cell; }),
          [fx(sref(name, PR, 1 + j), tv.prior[j], S.pct), fx(`SUM(${rng(L0 + j, 1, L0 + j, K2)})`, D.sum(L[j]), S.pct)]);
      });
      const JH = L0 + m + 1, J0 = JH + 1, MR = J0 + m;
      br[JH] = [th('P(indikator dan kondisi)')].concat(sm.indicators.map((k) => th(k.name)));
      t.states.forEach((s, j) => { br[J0 + j] = [td(s.name)].concat(sm.indicators.map((k, q) => fx(`${ref(L0 + j, 1 + q)}*${ref(L0 + j, 1 + K2)}`, B.joint[j][q], S.n4))); });
      br[MR] = [tdb('P(indikator)')].concat(sm.indicators.map((k, q) => fx(`SUM(${rng(J0, 1 + q, J0 + m - 1, 1 + q)})`, B.marginal[q], S.pctb)));
      const PH = MR + 2, P0 = PH + 1;
      br[PH] = [th('P(kondisi | indikator)')].concat(sm.indicators.map((k) => th(k.name)));
      t.states.forEach((s, j) => { br[P0 + j] = [td(s.name)].concat(sm.indicators.map((k, q) => fx(`IF(${ref(MR, 1 + q)}=0,0,${ref(J0 + j, 1 + q)}/${ref(MR, 1 + q)})`, isFinite(B.posterior[j][q]) ? B.posterior[j][q] : 0, S.pct))); });
      const TH = P0 + m + 1, T0 = TH + 1;
      br[TH] = [th('Payoff (dari Tabel payoff)')].concat(t.alternatives.map((a) => th(a.name)));
      t.states.forEach((s, j) => { br[T0 + j] = [td(s.name)].concat(t.alternatives.map((a, i) => fx(sref(name, A0 + i, 1 + j), tv.M[i][j]))); });
      const EH = T0 + m + 1, E0 = EH + 1, EB = E0 + n, ED = EB + 1, EM = ED + 1;
      br[EH] = [th((mx ? 'EV' : 'Biaya harapan') + ' bila indikator')].concat(sm.indicators.map((k) => th(k.name)));
      t.alternatives.forEach((a, i) => {
        br[E0 + i] = [td(a.name)].concat(sm.indicators.map((k, q) => fx(`SUMPRODUCT(${rng(P0, 1 + q, P0 + m - 1, 1 + q)},${rng(T0, 1 + i, T0 + m - 1, 1 + i)})`, smv.perIndicator[q].evs[i])));
      });
      const altR2 = rng(E0, 0, E0 + n - 1, 0);
      br[EB] = [tdb('Terbaik')].concat(sm.indicators.map((k, q) => fx(`${BEST}(${rng(E0, 1 + q, E0 + n - 1, 1 + q)})`, smv.perIndicator[q].value, S.numb)));
      br[ED] = [tdb('Keputusan')].concat(sm.indicators.map((k, q) => fx(`INDEX(${altR2},MATCH(${ref(EB, 1 + q)},${rng(E0, 1 + q, E0 + n - 1, 1 + q)},0))`, t.alternatives[smv.perIndicator[q].best[0]].name, S.tdb)));
      br[EM] = [td('P(indikator)')].concat(sm.indicators.map((k, q) => fx(ref(MR, 1 + q), B.marginal[q], S.pct)));
      const V0 = EM + 2;
      br[V0] = [tdb('EV dengan informasi sampel (EVwSI)'), fx(`SUMPRODUCT(${rng(EM, 1, EM, K2)},${rng(EB, 1, EB, K2)})`, smv.evwsi, S.numb)];
      br[V0 + 1] = [td(mx ? 'EV terbaik tanpa informasi' : 'Biaya harapan terbaik tanpa informasi'), fx(sref(name, BR, K.ev), smv.bestEV)];
      br[V0 + 2] = [tdb('EVSI'), fx(mx ? `${ref(V0, 1)}-${ref(V0 + 1, 1)}` : `${ref(V0 + 1, 1)}-${ref(V0, 1)}`, smv.evsi, S.numb)];
      br[V0 + 3] = [td('EVPI'), fx(sref(name, PIR, 1), smv.evpi)];
      br[V0 + 4] = [td('Efisiensi informasi (EVSI / EVPI)'), fx(`IF(${ref(V0 + 3, 1)}>0,${ref(V0 + 2, 1)}/${ref(V0 + 3, 1)},0)`, isFinite(smv.efficiency) ? smv.efficiency : 0, S.pct)];
      br[V0 + 5] = [tdb('Nilai bersih (EVSI − biaya)'), fx(`${ref(V0 + 2, 1)}-${costRef}`, smv.net, S.numb)];
      br[V0 + 6] = [tdb('Kesimpulan'), fx(`IF(${ref(V0 + 5, 1)}>0,${xs('Informasi layak dibeli')},${xs('Informasi tidak layak dibeli')})`, smv.worthIt ? 'Informasi layak dibeli' : 'Informasi tidak layak dibeli', S.tdb)];
      out.push({ name: 'Bayes & EVSI', rows: br, cols: [38].concat(Array(Math.max(K2 + 2, n)).fill(17)) });
    }
    return out;
  }

  function svgToPng(svg, width, height, scale) {
    scale = scale || 2;
    return new Promise((resolve, reject) => {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          const dataUrl = canvas.toDataURL('image/png');
          canvas.toBlob((b) => resolve({ blob: b, dataUrl, width: canvas.width, height: canvas.height }), 'image/png');
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal merender diagram ke PNG.')); };
      img.src = url;
    });
  }

  /* ------------------------------------------------------------------ *
   * Isi laporan (dipakai PDF & Word): daftar blok
   *   {t:'h1'|'h2'|'p'|'formula'|'table'|'img', ...}
   * ------------------------------------------------------------------ */

  function reportBlocks(R) {
    const p = R.project, c = R.comp, res = c.res, U = res.utility, f = R.fmt;
    const mx = res.maximize;
    const B = [];
    const h1 = (text) => B.push({ t: 'h1', text });
    const h2 = (text) => B.push({ t: 'h2', text });
    const para = (text, style) => B.push({ t: 'p', text, style });
    const formula = (text) => B.push({ t: 'formula', text });
    const table = (caption, head, rows, opts) => B.push(Object.assign({ t: 'table', caption, head, rows }, opts || {}));
    const img = (chart, caption, opts) => { if (chart) B.push(Object.assign({ t: 'img', chart, caption }, opts || {})); };
    const vw = U.active ? 'CE' : (mx ? 'Nilai harapan' : 'Biaya harapan');
    const unit = p.settings.unit ? ` (${p.settings.unit})` : '';

    // 1. Rekomendasi
    h1('Rekomendasi dan kebijakan optimal');
    para(R.verdict + ' Nilai ini adalah rata-rata berbobot peluang, bukan hasil yang dijamin.', 'strong');
    const pol = R.policy.filter((x) => x.reachable);
    if (pol.length) table('Kebijakan optimal: pilihan di setiap titik keputusan pada jalur terbaik', ['Titik keputusan', 'Konteks (jalur)', 'Pilihan', 'Nilai' + unit], pol.map((x) => [x.name || 'Keputusan', x.trail.join(' > ') || '(akar)', x.choiceName + (x.ties.length > 1 ? ' (seri)' : ''), f.v(x.value)]));
    const hd = ['Alternatif', mx ? 'Nilai harapan' : 'Biaya harapan'];
    if (U.active) hd.push('CE');
    hd.push('Simpangan baku', 'Minimum', 'Maksimum');
    if (mx) hd.push('P(rugi)');
    const bestRows = [];
    table('Nilai tiap alternatif di simpul akar (mengikuti kebijakan optimal)' + unit, hd, R.profiles.map((pf, i) => {
      if (R.rootValues.ties.includes(i)) bestRows.push(i);
      const row = [pf.name, f.v(pf.mean)];
      if (U.active) row.push(f.v(R.rootValues.values[i]));
      row.push(f.v(pf.sd), f.v(pf.min), f.v(pf.max));
      if (mx) row.push(f.pct(pf.pLoss, 1));
      return row;
    }), { bold: bestRows });
    img(R.charts.values, (U.active ? 'Certainty equivalent' : (mx ? 'Nilai harapan' : 'Biaya harapan')) + ' tiap alternatif; garis = rentang hasil terendah–tertinggi', { maxH: 90 });
    img(R.charts.tree, 'Diagram pohon keputusan. Kotak = keputusan, lingkaran = peluang, segitiga = akhir; garis tebal = kebijakan optimal; tanda ∥ = cabang yang tidak dipilih', { tree: true });

    // 2. Model
    h1('Model keputusan');
    if (p.mode === 'tree') {
      para('Nilai jalur = jumlah arus kas cabang sepanjang jalur + nilai akhir. Simpul peluang dihitung dengan nilai harapan; simpul keputusan memilih cabang ' + (mx ? 'dengan nilai terbesar.' : 'dengan biaya terkecil.'), 'muted');
      const rows = [];
      (function rec(r, depth, parent, b) {
        rows.push([(depth ? '  '.repeat(depth - 1) + '› ' : '') + (b ? b.name || '(cabang)' : '(akar)') + (r.type !== 'terminal' && r.name ? ` — ${r.name}` : ''), TYPE_LABEL[r.type], parent && parent.type === 'chance' ? f.p(b.p) : '', b && b.cash ? f.v(b.cash) : '', r.type === 'terminal' ? f.v(r.terminal) : '', f.v(r.value)]);
        (r.branches || []).forEach((bb) => rec(bb.child, depth + 1, r, bb));
      }(res.root, 0, null, null));
      table('Struktur pohon keputusan', ['Cabang — simpul', 'Jenis', 'Peluang', 'Arus kas', 'Nilai akhir', vw], rows.slice(0, 400), { fontSize: 7.5, widths: [0.37, 0.14, 0.11, 0.12, 0.12, 0.14] });
      if (rows.length > 400) para(`Menampilkan 400 dari ${rows.length} simpul. Struktur lengkap ada di berkas Excel.`, 'muted');
      if (p.variables.length) {
        const scope = D.makeScope(p.variables, p.settings.decimalSep);
        table('Variabel', ['Nama', 'Nilai / rumus', 'Hasil', 'Keterangan'], p.variables.map((v) => { let val = NaN; try { val = scope.get(v.name); } catch (e) { /* - */ } return [v.name, String(v.value), f.v(val), v.note || '']; }));
      }
    } else {
      const t = p.table, tv = c.table, cr = c.criteria;
      const names = t.alternatives.map((a) => a.name);
      const per = 6;
      for (let s0 = 0; s0 < t.states.length; s0 += per) {
        const part = t.states.slice(s0, s0 + per);
        table('Tabel payoff' + unit + (t.states.length > per ? ` (kondisi ${s0 + 1}–${s0 + part.length})` : ''), [`${t.decisionLabel} \\ ${t.stateLabel}`].concat(part.map((s) => s.name)),
          [['Peluang'].concat(part.map((s, jj) => f.p(tv.prior[s0 + jj])))].concat(t.alternatives.map((a, i) => [a.name].concat(part.map((s, jj) => f.v(tv.M[i][s0 + jj]))))), { bold: [0] });
      }
      img(R.charts.payoff, 'Payoff tiap alternatif per kondisi', { maxH: 95 });
      h2('Kriteria keputusan');
      formula(`Hurwicz = α × ${mx ? 'maks' : 'min'} + (1 − α) × ${mx ? 'min' : 'maks'}, α = ${f.v(cr.alpha)};  Laplace = rata-rata payoff;  EV = Σ peluang × payoff;  regret = ${mx ? 'payoff terbaik di kondisi itu − payoff' : 'payoff − payoff terbaik di kondisi itu'};  EOL = Σ peluang × regret`);
      const keys = [['optimistic', mx ? 'Maximax' : 'Minimin', 'optimistic'], ['pessimistic', mx ? 'Maximin' : 'Minimax', 'pessimistic'], ['hurwicz', 'Hurwicz', 'hurwicz'], ['laplace', 'Laplace', 'laplace'], ['ev', mx ? 'EV' : 'Biaya harapan', 'ev'], ['maxRegret', 'Regret maks.', 'regret'], ['eol', 'EOL', 'eol']];
      table('Nilai kriteria keputusan tiap alternatif', ['Alternatif'].concat(keys.map((k) => k[1])), cr.rows.map((r, i) => [names[i]].concat(keys.map((k) => f.v(r[k[0]]) + (cr.winners[k[2]].includes(i) ? ' *' : '')))).concat([['Terpilih'].concat(keys.map((k) => cr.winners[k[2]].map((i) => names[i]).join(', ')))]), { bold: [cr.rows.length], fontSize: 7.5 });
      para('Tanda * = alternatif terpilih menurut kriteria tersebut.', 'muted');
      table('Tabel regret (opportunity loss)', ['Alternatif'].concat(t.states.map((s) => s.name), ['Regret maks.']), cr.regret.map((row, i) => [names[i]].concat(row.map((x) => f.v(x)), [f.v(cr.rows[i].maxRegret)])));
    }

    // 3. Rollback
    h1('Langkah perhitungan mundur (rollback)');
    formula(U.active
      ? `Simpul akhir: U(x) = ${p.settings.risk.mode === 'averse' ? '1 − e^(−x/R)' : 'e^(x/R) − 1'}, R = ${f.v(U.R)};  simpul peluang: EU = Σ pᵢ × U(nilaiᵢ), CE = ${p.settings.risk.mode === 'averse' ? '−R ln(1 − EU)' : 'R ln(1 + EU)'};  simpul keputusan: pilih EU terbesar`
      : `Simpul peluang: EV = Σ pᵢ × nilaiᵢ;  simpul keputusan: nilai = ${mx ? 'maks' : 'min'}(nilai cabang)`);
    table('Perhitungan di setiap simpul, dari ujung pohon ke akar', ['Simpul', 'Perhitungan'], R.rollback.slice(0, 150).map((x) => [x.where, x.text]), { first: 0.34, fontSize: 7.5 });
    if (R.rollback.length > 150) para(`Menampilkan 150 dari ${R.rollback.length} langkah.`, 'muted');

    // 4. Profil risiko
    h1('Profil risiko');
    para('Profil risiko menunjukkan sebaran nilai akhir bila setiap alternatif di simpul akar dipilih lalu kebijakan optimal diikuti. Nilai harapan sama tidak berarti risikonya sama.', 'muted');
    const dom = dominanceNotes(R);
    if (dom.length) para(dom.join('; ') + '.', 'good');
    else if (R.profiles.length > 1) para('Tidak ada alternatif yang mendominasi alternatif lain secara stokastik; pilihan bergantung pada sikap terhadap risiko.', 'muted');
    img(R.charts.pmf, 'Profil risiko: peluang setiap nilai akhir', { maxH: 95 });
    img(R.charts.cdf, 'Profil risiko kumulatif: P(nilai ≤ x)', { maxH: 95 });

    // 5. Sensitivitas
    h1('Analisis sensitivitas');
    const tor = R.tornado;
    if (tor && tor.rows.length) {
      para(`Tornado: setiap nilai diubah ±${C0(p.settings.sens.pct)}% dan setiap peluang ±${C0(p.settings.sens.probDelta)} poin persen (peluang lain di simpul yang sama diskalakan proporsional), satu per satu. ${p.mode === 'table' && p.table.sample.enabled ? 'Mode tabel: dihitung untuk pilihan tanpa informasi sampel.' : ''}`, 'muted');
      table(`Pengaruh parameter terhadap ${vw.toLowerCase()} keputusan terbaik`, ['Parameter', 'Rendah', 'Nilai', 'Tinggi', 'Nilai', 'Selisih', 'Berubah?'], tor.rows.slice(0, 20).map((r) => [r.param.label, f.param(r.param, r.lo), f.v(r.vLo), f.param(r.param, r.hi), f.v(r.vHi), f.v(r.swing), r.changes ? 'Ya' : 'Tidak']), { fontSize: 7.5, first: 0.3 });
      img(R.charts.tornado, 'Diagram tornado; titik merah = keputusan terbaik berubah', { maxH: 120 });
    } else para('Belum ada parameter angka yang bisa diuji.', 'muted');
    if (R.oneWay && R.charts.oneWay) {
      const o = R.oneWay;
      h2('Sensitivitas satu arah: ' + o.prm.label);
      img(R.charts.oneWay, `${vw} tiap alternatif terhadap ${o.prm.label}; latar = alternatif terbaik`, { maxH: 95 });
      if (o.res.breaks.length) para('Titik impas: ' + o.res.breaks.map((b) => `pada ${o.prm.label} = ${f.param(o.prm, b.x)} keputusan berganti dari ${o.names[b.from]} ke ${o.names[b.to]}`).join('; ') + '.');
      else para(`Keputusan terbaik tidak berubah dalam rentang ${f.param(o.prm, o.res.xs[0])} – ${f.param(o.prm, o.res.xs[o.res.xs.length - 1])}.`);
    }
    img(R.charts.spider, 'Diagram spider: perubahan nilai keputusan bila satu parameter digeser −50% sampai +50%', { maxH: 100 });

    // 6. Nilai informasi
    h1('Nilai informasi');
    if (p.mode === 'tree' && R.evpi) {
      para(`EVPI (expected value of perfect information) = nilai keputusan bila hasil suatu ketidakpastian diketahui sebelum memutuskan, dikurangi nilai keputusan sekarang (${f.money(res.root.value)}). Jangan membayar informasi lebih dari EVPI-nya.`, 'muted');
      const rows = [];
      R.evpi.groups.forEach(({ g, r }) => { if (r && !r.tooMany) rows.push([g.name, g.outcomes.map((o, i) => `${o} ${f.p(r.q[0][i])}`).join(' · '), f.v(r.withInfo), f.v(r.evpi), r.consistent ? 'Sama' : 'Bersyarat']); });
      const bold = [];
      if (R.evpi.total && !R.evpi.total.tooMany) { bold.push(rows.length); rows.push(['Semua ketidakpastian', 'dianggap saling bebas', f.v(R.evpi.total.withInfo), f.v(R.evpi.total.evpi), '']); }
      if (rows.length) table('EVPI per ketidakpastian' + unit, ['Ketidakpastian', 'Hasil & peluang', 'Nilai dengan informasi', 'EVPI', 'Peluang antar simpul'], rows, { bold, fontSize: 7.5 });
      img(R.charts.evpi, 'Nilai informasi sempurna per ketidakpastian', { maxH: 90 });
    } else if (p.mode === 'table') {
      const t = p.table, tv = c.table, cr = c.criteria, sm = c.sample;
      const names = t.alternatives.map((a) => a.name);
      formula(`EVwPI = Σ peluang × payoff terbaik tiap kondisi = ${t.states.map((s, j) => `${f.p(tv.prior[j])} × ${f.v(cr.colBest[j])}`).join(' + ')} = ${f.v(cr.evwpi)};  EVPI = ${mx ? 'EVwPI − EV terbaik' : 'biaya terbaik − EVwPI'} = ${f.v(cr.evpi)}`);
      table('Nilai informasi sempurna' + unit, ['Ukuran', 'Nilai'], [[mx ? 'EV terbaik tanpa informasi' : 'Biaya harapan terbaik', f.v(cr.bestEV)], ['EV dengan informasi sempurna (EVwPI)', f.v(cr.evwpi)], ['EVPI', f.v(cr.evpi)]], { bold: [2] });
      if (sm) {
        const Bz = sm.bayes;
        const inds = t.sample.indicators.map((k) => k.name), states = t.states.map((s) => s.name);
        h2('Revisi Bayes: ' + t.sample.name);
        formula('P(kondisi | indikator) = P(indikator | kondisi) × P(kondisi) / P(indikator)');
        table('Keandalan informasi P(indikator | kondisi)', ['Kondisi'].concat(inds), states.map((s, j) => [s].concat(tv.sample.L[j].map((x) => f.p(x)))));
        table('Peluang bersama dan peluang indikator', ['Kondisi'].concat(inds), states.map((s, j) => [s].concat(Bz.joint[j].map((x) => f.p(x)))).concat([['P(indikator)'].concat(Bz.marginal.map((x) => f.p(x)))]), { bold: [states.length] });
        table('Peluang posterior P(kondisi | indikator)', ['Kondisi'].concat(inds), states.map((s, j) => [s].concat(Bz.posterior[j].map((x) => f.p(x)))));
        h2('Nilai informasi sampel (EVSI)');
        table('Keputusan terbaik untuk setiap hasil indikator' + unit, ['Bila indikator', 'Peluang'].concat(names), sm.perIndicator.map((x) => [inds[x.k], f.p(x.marginal)].concat(x.evs.map((v, i) => f.v(v) + (x.best.includes(i) ? ' *' : '')))));
        table('Ringkasan nilai informasi sampel' + unit, ['Ukuran', 'Nilai'], [['EV dengan informasi sampel (EVwSI)', f.v(sm.evwsi)], ['EVSI', f.v(sm.evsi)], ['Efisiensi informasi (EVSI / EVPI)', isFinite(sm.efficiency) ? f.pct(sm.efficiency, 1) : '–'], ['Biaya informasi', f.v(sm.cost)], ['Nilai bersih (EVSI − biaya)', f.v(sm.net)], ['Kesimpulan', sm.worthIt ? 'Informasi layak dibeli' : 'Informasi tidak layak dibeli pada biaya ini']], { bold: [1, 5] });
      }
      img(R.charts.voi, 'Nilai harapan menurut tingkat informasi', { maxH: 85 });
    }

    // 7. Jalur
    h1('Daftar jalur');
    table('Semua jalur dari akar ke simpul akhir' + unit, ['No', 'Jalur', 'Peluang', 'Nilai', 'Optimal'], R.paths.slice(0, 150).map((x, i) => [String(i + 1), x.labels.join(' > '), f.p(x.prob), f.v(x.payoff), x.optimal ? 'Ya' : '']), { fontSize: 7.5, widths: [0.07, 0.55, 0.13, 0.13, 0.12], bold: R.paths.slice(0, 150).map((x, i) => (x.optimal ? i : -1)).filter((i) => i >= 0) });
    if (R.paths.length > 150) para(`Menampilkan 150 dari ${R.paths.length} jalur; daftar lengkap ada di berkas CSV/Excel.`, 'muted');

    h1('Rujukan');
    R.references.forEach((r) => para(r, 'ref'));
    para(`Dihitung dengan ${TOOL_NAME} (${TOOL_URL}). Semua perhitungan berjalan di browser pengguna.`, 'muted');
    return B;
  }

  const isNumText = (t) => /^[-−]?[\d.,]+%?( \*)?$/.test(String(t).trim());
  /** Kolom angka: bukan kolom pertama, minimal satu sel berisi angka, sel lain angka atau kosong. */
  function numCol(rows, i) {
    if (i === 0 || !rows.length) return false;
    const cells = rows.map((r) => String(r[i] === undefined || r[i] === null ? '' : r[i]).trim());
    return cells.some((c) => c && isNumText(c)) && cells.every((c) => !c || c === '–' || isNumText(c));
  }

  function dominanceNotes(R) {
    const prof = R.profiles, out = [];
    if (prof.length < 2 || prof.length > 6) return out;
    for (let a = 0; a < prof.length; a++) for (let b = a + 1; b < prof.length; b++) {
      const d = D.dominance(prof[a], prof[b], R.comp.res.maximize);
      if (d.order) out.push(`${d.winner === 'a' ? prof[a].name : prof[b].name} mendominasi ${d.winner === 'a' ? prof[b].name : prof[a].name} (dominansi stokastik orde ${d.order})`);
    }
    return out;
  }

  function metaRows(R) {
    const p = R.project, c = R.comp, res = c.res;
    const nodes = D.countNodes(c.tree);
    const rows = [
      ['Tanggal', R.dateLabel],
      ['Model', p.mode === 'tree' ? `Pohon keputusan (${nodes} simpul, ${R.paths.length} jalur)` : `Tabel payoff (${p.table.alternatives.length} alternatif × ${p.table.states.length} kondisi${c.sample ? ', dengan informasi sampel' : ''})`],
      ['Tujuan', res.maximize ? 'Maksimalkan nilai' : 'Minimalkan biaya'],
      ['Sikap terhadap risiko', res.utility.label],
      ['Satuan nilai', p.settings.unit || '–']
    ];
    if (p.meta.author) rows.unshift(['Disusun oleh', p.meta.author]);
    return rows;
  }

  /* ------------------------------------------------------------------ *
   * PDF
   * ------------------------------------------------------------------ */

  // Helvetica bawaan PDF hanya mendukung WinAnsi; ganti simbol di luar itu.
  function pdfText(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[₀-₉]+/g, (m) => '_' + Array.from(m).map((ch) => String(ch.charCodeAt(0) - 0x2080)).join(''))
      .replace(/ᵢ/g, '_i').replace(/√/g, 'akar').replace(/Σ/g, 'jumlah ').replace(/σ/g, 'sigma').replace(/α/g, 'alpha').replace(/≤/g, '<=').replace(/≥/g, '>=')
      .replace(/→/g, '->').replace(/←/g, '<-').replace(/[↑↓]/g, '').replace(/−/g, '-').replace(/×/g, 'x').replace(/›/g, '>').replace(/∥/g, '//')
      .replace(/✓/g, 'OK').replace(/✕/g, 'X').replace(/ | /g, ' ')
      .replace(/[^\u0009\u000a\u000d -~ -ÿ–—‘’“”•…]/g, '?');
  }

  const NAVY = [55, 48, 163], INK = [24, 34, 48], MUTED = [100, 116, 139], LINE = [226, 232, 240], BRAND = [79, 70, 229], GOOD = [6, 95, 70];

  async function buildPdf(R, onProgress) {
    if (!(typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF)) throw new Error('Pustaka PDF belum termuat. Muat ulang halaman lalu coba lagi.');
    const { jsPDF } = window.jspdf;
    const autoTable = window.autoTable || (window.jspdf_autotable && window.jspdf_autotable.autoTable) || null;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const p = R.project;
    const PW = 210, PH = 297, MG = 16, CW = PW - 2 * MG, BOTTOM = PH - 16;
    let y = MG;
    const tick = (msg) => { if (onProgress) onProgress(msg); };
    doc.setProperties({ title: p.meta.title, subject: 'Laporan analisis pohon keputusan', creator: TOOL_NAME + ' — ' + TOOL_URL });

    const ensure = (h) => { if (y + h > BOTTOM) { doc.addPage('a4', 'portrait'); y = MG; } };
    const setFont = (size, style, color) => { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, color || INK); };
    let secNo = 0;
    const heading = (t) => {
      ensure(48);
      secNo++;
      y += 2;
      setFont(13, 'bold', NAVY);
      doc.text(pdfText(`${secNo}. ${t}`), MG, y + 4);
      doc.setDrawColor.apply(doc, BRAND);
      doc.setLineWidth(0.6);
      doc.line(MG, y + 6.5, MG + 14, y + 6.5);
      y += 11;
    };
    const sub = (t) => { ensure(40); setFont(10.5, 'bold', INK); doc.text(pdfText(t), MG, y + 3.5); y += 7; };
    const PSTYLE = { muted: [8.5, 'normal', MUTED], strong: [10.5, 'bold', NAVY], good: [9, 'bold', GOOD], ref: [8.5, 'normal', INK] };
    const para = (t, style) => {
      const [size, fstyle, color] = PSTYLE[style] || [9.5, 'normal', INK];
      setFont(size, fstyle, color);
      const lines = doc.splitTextToSize(pdfText(t), CW);
      const lh = size * 0.42;
      for (const l of lines) { ensure(lh + 1); doc.text(l, MG, y + lh * 0.8); y += lh; }
      y += 2;
    };
    const formula = (t) => {
      setFont(9, 'italic', [49, 46, 129]);
      const lines = doc.splitTextToSize(pdfText(t), CW - 8);
      const h = lines.length * 4 + 4;
      ensure(h + 2);
      doc.setFillColor(238, 242, 255);
      doc.roundedRect(MG, y, CW, h, 1.5, 1.5, 'F');
      doc.text(lines, MG + 4, y + 4.6);
      y += h + 3;
    };
    const table = (b) => {
      ensure(Math.min(46, 16 + Math.min(b.rows.length, 3) * 6.5));
      setFont(8.5, 'bold', MUTED);
      const capLines = doc.splitTextToSize(pdfText(b.caption), CW);
      doc.text(capLines, MG, y + 3);
      y += capLines.length * 3.6 + 1.5;
      const colStyles = {};
      b.head.forEach((_, i) => { if (numCol(b.rows, i)) colStyles[i] = { halign: 'right' }; });
      if (b.first) colStyles[0] = Object.assign(colStyles[0] || {}, { cellWidth: CW * b.first });
      if (b.widths) b.widths.forEach((w, i) => { colStyles[i] = Object.assign(colStyles[i] || {}, { cellWidth: CW * w }); });
      const conf = {
        startY: y, head: [b.head.map(pdfText)],
        body: b.rows.map((r, ri) => r.map((cell) => ((b.bold || []).includes(ri) ? { content: pdfText(cell), styles: { fontStyle: 'bold', fillColor: [236, 253, 245] } } : pdfText(cell)))),
        margin: { left: MG, right: MG, bottom: 18 }, theme: 'grid',
        styles: { font: 'helvetica', fontSize: b.fontSize || 8.5, cellPadding: 1.5, lineColor: LINE, lineWidth: 0.15, textColor: INK, overflow: 'linebreak' },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [247, 249, 252] },
        columnStyles: colStyles,
        rowPageBreak: 'avoid'
      };
      if (autoTable) autoTable(doc, conf); else doc.autoTable(conf);
      y = doc.lastAutoTable.finalY + 5;
    };
    const caption = (t, cx, width) => { setFont(8, 'italic', MUTED); const lines = doc.splitTextToSize(pdfText(t), width); doc.text(lines, cx, y + 2.5, { align: 'center' }); y += lines.length * 3.4 + 3; };
    const image = async (b) => {
      const chart = b.chart;
      const png = await svgToPng(chart.svg, chart.width, chart.height, chart.width > 1400 ? 1.5 : 2);
      // Pohon yang lebar ditaruh di halaman lanskap agar label tetap terbaca.
      if (b.tree && chart.width > 980 && chart.width / chart.height > 1.15) {
        doc.addPage('a4', 'landscape');
        const LW = 297, LH = 210;
        let w = LW - 2 * MG, h = w * chart.height / chart.width;
        const lim = LH - 2 * MG - 14;
        if (h > lim) { w = w * lim / h; h = lim; }
        y = MG;
        doc.addImage(png.dataUrl, 'PNG', MG + (LW - 2 * MG - w) / 2, y, w, h, undefined, 'FAST');
        y += h + 2;
        caption(b.caption, LW / 2, LW - 2 * MG);
        doc.addPage('a4', 'portrait');
        y = MG;
        return;
      }
      let w = CW, h = CW * chart.height / chart.width;
      const limit = b.maxH || (BOTTOM - MG - 14);
      if (h > limit) { w = w * limit / h; h = limit; }
      ensure(h + 8);
      doc.addImage(png.dataUrl, 'PNG', MG + (CW - w) / 2, y, w, h, undefined, 'FAST');
      y += h + 2;
      caption(b.caption, PW / 2, CW);
    };

    // --- Sampul ringkas
    doc.setFillColor.apply(doc, NAVY);
    doc.rect(0, 0, PW, 40, 'F');
    setFont(9, 'normal', [199, 210, 254]);
    doc.text('LAPORAN ANALISIS POHON KEPUTUSAN', MG, 13);
    setFont(17, 'bold', [255, 255, 255]);
    doc.text(doc.splitTextToSize(pdfText(p.meta.title), CW).slice(0, 2), MG, 22);
    setFont(9, 'normal', [224, 231, 255]);
    doc.text('Decision tree analysis · rollback nilai harapan, profil risiko, sensitivitas, dan nilai informasi', MG, 34);
    y = 48;
    table({ caption: 'Identitas analisis', head: ['Keterangan', 'Nilai'], rows: metaRows(R), first: 0.3 });
    if (p.meta.description) para(p.meta.description, 'muted');

    for (const b of reportBlocks(R)) {
      if (b.t === 'h1') { tick(b.text); heading(b.text); } else if (b.t === 'h2') sub(b.text);
      else if (b.t === 'p') para(b.text, b.style);
      else if (b.t === 'formula') formula(b.text);
      else if (b.t === 'table') table(b);
      else if (b.t === 'img') await image(b);
    }

    // --- Footer & nomor halaman
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.2);
      doc.line(MG, ph - 12, pw - MG, ph - 12);
      setFont(7.5, 'normal', MUTED);
      doc.text(pdfText(`Dihitung dengan ${TOOL_NAME} — ${TOOL_URL}`), MG, ph - 8);
      doc.text(`${i} / ${pages}`, pw - MG, ph - 8, { align: 'right' });
    }
    return doc.output('blob');
  }

  /* ------------------------------------------------------------------ *
   * Laporan Word (.docx) — dapat disunting untuk Bab IV skripsi
   * ------------------------------------------------------------------ */

  const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  const DOCX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + W_NS + '>' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="312E81"/><w:sz w:val="36"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="312E81"/><w:sz w:val="28"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:rPr><w:i/><w:color w:val="475569"/><w:sz w:val="20"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Rumus"><w:name w:val="Rumus"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="EEF2FF"/><w:spacing w:before="60" w:after="120"/><w:ind w:left="284"/></w:pPr><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:color w:val="1E1B4B"/><w:sz w:val="22"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Catatan"><w:name w:val="Catatan"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:color w:val="475569"/><w:sz w:val="20"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:styleId="TabelData"><w:name w:val="Tabel Data"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '</w:styles>';

  const SECT_PORTRAIT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="2268" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';
  const SECT_LANDSCAPE = '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';

  async function buildDocx(R, onProgress) {
    const p = R.project;
    const tick = (msg) => { if (onProgress) onProgress(msg); };
    const body = [];
    const media = [];
    let figNo = 0, tabNo = 0, secNo = 0;
    const run = (t, o) => {
      o = o || {};
      const pr = (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.color ? `<w:color w:val="${o.color}"/>` : '') + (o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : '');
      return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
    };
    const para = (t, o) => { o = o || {}; body.push(`<w:p>${o.style || o.jc ? `<w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>` : ''}${run(t, o)}</w:p>`); };
    const PSTYLE = { muted: { color: '475569', sz: 22 }, strong: { b: true, color: '312E81' }, good: { b: true, color: '065F46' }, ref: {} };
    const table = (b) => {
      tabNo++;
      para(`Tabel ${tabNo}. ${b.caption}`, { style: 'Caption' });
      const head = b.head, rows = b.rows;
      // Lebar kolom tetap bila kolom pertama diberi porsi khusus (teks panjang); bidang tulis A4 potret = 7937 twip.
      const TOTAL = 7937;
      const widths = b.widths ? b.widths.map((w) => Math.round(TOTAL * w)) : b.first && head.length > 1 ? [Math.round(TOTAL * b.first)].concat(Array(head.length - 1).fill(Math.round(TOTAL * (1 - b.first) / (head.length - 1)))) : null;
      let ci = 0;
      const cell = (t, hdr, right, bold) => `<w:tc><w:tcPr>${widths ? `<w:tcW w:w="${widths[ci++ % widths.length]}" w:type="dxa"/>` : ''}${hdr ? '<w:shd w:val="clear" w:color="auto" w:fill="3730A3"/>' : bold ? '<w:shd w:val="clear" w:color="auto" w:fill="ECFDF5"/>' : ''}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>${right ? '<w:jc w:val="right"/>' : ''}</w:pPr>${run(String(t), hdr ? { b: true, color: 'FFFFFF', sz: 18 } : { sz: 18, b: bold })}</w:p></w:tc>`;
      let x = `<w:tbl><w:tblPr><w:tblStyle w:val="TabelData"/>${widths ? `<w:tblW w:w="${TOTAL}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` : '<w:tblW w:w="5000" w:type="pct"/>'}<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`;
      x += `<w:tblGrid>${head.map((_, i) => (widths ? `<w:gridCol w:w="${widths[i]}"/>` : '<w:gridCol/>')).join('')}</w:tblGrid>`;
      const colRight = head.map((_, i) => numCol(rows, i));
      x += `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${head.map((h, i) => cell(h, true, colRight[i])).join('')}</w:tr>`;
      rows.forEach((r, ri) => { const bold = (b.bold || []).includes(ri); x += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((t, i) => cell(t, false, colRight[i], bold)).join('')}</w:tr>`; });
      x += '</w:tbl>';
      body.push(x);
      body.push('<w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>');
    };
    const image = async (b) => {
      const chart = b.chart;
      const png = await svgToPng(chart.svg, chart.width, chart.height, chart.width > 1400 ? 1.5 : 2);
      const bytes = new Uint8Array(await png.blob.arrayBuffer());
      media.push(bytes);
      const id = media.length;
      const landscape = b.tree && chart.width > 980 && chart.width / chart.height > 1.15;
      const maxW = landscape ? 24.5 : 15, maxH = landscape ? 15 : 20;
      let cx = Math.round(maxW * 360000), cy = Math.round(cx * chart.height / chart.width);
      const maxCy = Math.round(maxH * 360000);
      if (cy > maxCy) { cx = Math.round(cx * maxCy / cy); cy = maxCy; }
      if (landscape) body.push(`<w:p><w:pPr>${SECT_PORTRAIT}</w:pPr></w:p>`);
      body.push(`<w:p><w:pPr><w:keepNext/><w:jc w:val="center"/><w:spacing w:before="120" w:after="40"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Gambar ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="gambar${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
      figNo++;
      if (landscape) body.push(`<w:p><w:pPr><w:pStyle w:val="Caption"/>${SECT_LANDSCAPE}</w:pPr>${run(`Gambar ${figNo}. ${b.caption}`)}</w:p>`);
      else para(`Gambar ${figNo}. ${b.caption}`, { style: 'Caption' });
    };

    // --- Judul & identitas
    para(p.meta.title, { style: 'Title' });
    para('Laporan analisis pohon keputusan (decision tree analysis)', { color: '475569' });
    table({ caption: 'Identitas analisis', head: ['Keterangan', 'Nilai'], rows: metaRows(R) });
    if (p.meta.description) para(p.meta.description);

    for (const b of reportBlocks(R)) {
      if (b.t === 'h1') { tick(b.text); secNo++; para(b.text === 'Rujukan' ? b.text : `${secNo}. ${b.text}`, { style: 'Heading1' }); } else if (b.t === 'h2') para(b.text, { style: 'Heading2' });
      else if (b.t === 'p') para(b.text, PSTYLE[b.style] || {});
      else if (b.t === 'formula') para(b.text, { style: 'Rumus' });
      else if (b.t === 'table') table(b);
      else if (b.t === 'img') await image(b);
    }

    const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + W_NS + '><w:body>' + body.join('') + SECT_PORTRAIT + '</w:body></w:document>';
    const files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { name: 'docProps/core.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + `<dc:title>${xmlEsc(p.meta.title)}</dc:title><dc:creator>${xmlEsc(p.meta.author || TOOL_NAME)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>` },
      { name: 'word/document.xml', data: docXml },
      { name: 'word/styles.xml', data: DOCX_STYLES },
      { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + media.map((_, k) => `<Relationship Id="rIdImg${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/gambar${k + 1}.png"/>`).join('') + '</Relationships>' }
    ];
    media.forEach((bytes, k) => files.push({ name: `word/media/gambar${k + 1}.png`, data: bytes }));
    return zip(files);
  }

  return {
    TOOL_URL, TOOL_NAME, download, safeFileName, csvString, pathRows,
    crc32, zip, buildXlsx, workbookFromReport, reportBlocks, svgToPng, buildPdf, buildDocx, pdfText
  };
}));
