/* Civil War dashboard - shared helpers. Everything is drawn with textContent (never innerHTML)
 * because product names and descriptions come from Shopee sellers. */
(function () {
  'use strict';
  var D = window.Dash = {};

  // h('div', {class:'x', onclick:fn}, child, 'text', [more children])
  D.h = function (tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    function add(c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { c.forEach(add); return; }
      el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
    for (var i = 2; i < arguments.length; i++) add(arguments[i]);
    return el;
  };
  var h = D.h;

  // all saved data goes through CWStore (src/store.js); these names stay so the pages do not change
  D.load = function () { return CWStore.load(); };

  // One entry per product (newest snapshot is "latest").
  // Skincare / Decorative / Personal Care. Older saves have no main category: it is worked out from the category name.
  D.MAIN_TABS = ['All', 'Skincare', 'Decorative', 'Personal Care'];
  D.mainOf = function (r) { return PDP.cleanMainCategory(r.mainCategory) || PDP.mainCategoryFor(r.category) || ''; };
  D.getMain = function () { try { var v = sessionStorage.getItem('cw_main'); return D.MAIN_TABS.indexOf(v) >= 0 ? v : 'All'; } catch (e) { return 'All'; } };
  D.setMain = function (v) { try { sessionStorage.setItem('cw_main', v); } catch (e) { /* ignore */ } };
  D.inMain = function (p, main) { return main === 'All' || p.main === main; };
  // compact All | Skincare | Decorative | Personal Care tabs with product counts
  D.mainTabs = function (products, current, onPick) {
    return h('div', { class: 'seg', role: 'group', 'aria-label': 'Main category' }, D.MAIN_TABS.map(function (t) {
      var n = products.filter(function (p) { return D.inMain(p, t); }).length;
      return h('button', { type: 'button', 'aria-pressed': String(current === t), onclick: function () { onPick(t); } }, t, h('b', null, String(n)));
    }));
  };

  D.products = function (data) {
    var map = {};
    data.snapshots.forEach(function (s) {
      var k = PDP.recordKey(s);
      (map[k] || (map[k] = { key: k, snaps: [] })).snaps.push(s);
    });
    return Object.keys(map).map(function (k) {
      var p = map[k];
      p.snaps.sort(function (a, b) { return a.capturedAt < b.capturedAt ? 1 : -1; });
      p.latest = p.snaps[0];
      p.count = p.snaps.length;
      p.category = p.latest.category || 'Uncategorised';
      p.main = D.mainOf(p.latest);
      p.notes = data.notes[k] || '';
      p.isNew = D.isNew(p.latest);
      return p;
    }).sort(function (a, b) { return a.latest.capturedAt < b.latest.capturedAt ? 1 : -1; });
  };

  D.categories = function (products) {
    var c = {};
    products.forEach(function (p) { c[p.category] = (c[p.category] || 0) + 1; });
    return Object.keys(c).sort().map(function (n) { return { name: n, count: c[n] }; });
  };

  D.label = function (p) {
    var r = p.latest;
    return (r.brand ? r.brand + ' – ' : '') + PDP.shortName(r);
  };

  D.nav = function (active) {
    var items = [['home.html', 'Main page', 'home'], ['library.html', 'Product library', 'library'], ['compare.html', 'Compare product', 'compare']];
    var el = document.getElementById('nav');
    el.className = 'top';
    el.setAttribute('aria-label', 'Main menu');
    el.appendChild(h('div', { class: 'in' },
      h('div', { class: 'brand' }, h('i'), 'Civil War'),
      h('div', { class: 'links' }, items.map(function (it) { return h('a', { href: it[0], 'aria-current': it[2] === active ? 'page' : null }, it[1]); }))));
  };

  D.pluralize = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };

  D.toast = function (text) {
    var t = h('div', { class: 'toast', role: 'status' }, text);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  };

  D.saveFile = function (name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  };

  D.today = function () { var d = new Date(); return d.getFullYear() + '-' + PDP.pad2(d.getMonth() + 1) + '-' + PDP.pad2(d.getDate()); };

  D.emptyState = function () {
    return h('div', { class: 'card empty' },
      h('div', { class: 't' }, 'Your library is empty'),
      h('div', { class: 'd' }, 'Open a competitor\'s product page on shopee.co.id, click the Civil War icon in Chrome, then press Save to Library. It will appear here.'));
  };


  // ---------- text of AI items: a string, or an object {text, source} (older {t, s}) ----------
  D.text = function (x) { return typeof x === 'string' ? x : ((x && (x.text || x.t)) || ''); };
  D.source = function (x) { return typeof x === 'string' ? '' : ((x && (x.source || x.s)) || ''); };
  // [{text, source}] copy of a list, never throws on a missing list
  D.items = function (list) { return (Array.isArray(list) ? list : []).map(function (x) { return { text: D.text(x), source: D.source(x) }; }).filter(function (x) { return x.text; }); };
  D.ing = function (text) {   // "Name — function" -> {name, fn}
    var m = String(text).split(/\s+[—–-]\s+/);
    return { name: m[0], fn: m.slice(1).join(' — ') };
  };

  // ---------- New Product Launch: shown for 28 days after newLaunchMarkedAt, then it expires by itself ----------
  D.NEW_DAYS = 28;
  D.isNew = function (r) {
    if (!r || !r.isNewLaunch || !r.newLaunchMarkedAt) return false;
    var t = new Date(r.newLaunchMarkedAt).getTime();
    return !isNaN(t) && (Date.now() - t) < D.NEW_DAYS * 86400000;
  };
  D.newBadge = function () { return h('span', { class: 'newbadge' }, 'NEW LAUNCH'); };

  // ---------- price, pictures ----------
  D.price = function (r) {
    var ppu = PDP.pricePerUnit(r.price, r.netto);
    return { total: r.price ? PDP.rupiah(r.price) : '—', ppu: ppu ? PDP.rupiah(ppu.perUnit) + ' / ' + ppu.unit : '—', perUnit: ppu ? ppu.perUnit : null, unit: ppu ? ppu.unit : '' };
  };
  // gallery slides first (Slide n), then the pictures found in the description (Desc n)
  D.slides = function (r) {
    var out = (r.images || []).map(function (u, i) { return { url: u, label: 'Slide ' + (i + 1) }; });
    (r.descImages || []).forEach(function (u, i) { out.push({ url: u, label: 'Desc ' + (i + 1) }); });
    return out;
  };
  D.cssUrl = function (u) { return 'url("' + String(u).replace(/"/g, '%22') + '")'; };
  D.img = function (u, alt, attrs) { return h('img', Object.assign({ src: u, alt: alt || '', loading: 'lazy', referrerpolicy: 'no-referrer' }, attrs || {})); };

  // ---------- full-size viewer (click a picture; arrows or Esc on the keyboard) ----------
  D.lightbox = function (list, start, who) {
    var i = start, root;
    function close() { document.removeEventListener('keydown', onKey); root.remove(); }
    function step(d) { i = (i + d + list.length) % list.length; paint(); }
    function onKey(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); }
    var img = h('img', { referrerpolicy: 'no-referrer' }), cap = h('div', { class: 'cap' });
    function paint() { img.src = list[i].url; img.alt = (who || '') + ' ' + list[i].label; cap.textContent = (who ? who + ' · ' : '') + list[i].label + ' of ' + list.length; }
    root = h('div', { class: 'lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Banner preview', onclick: function (e) { if (e.target === root) close(); } },
      img,
      h('button', { type: 'button', class: 'cl', 'aria-label': 'Close', onclick: close }, '×'),
      list.length > 1 ? h('button', { type: 'button', class: 'pv', 'aria-label': 'Previous', onclick: function () { step(-1); } }, '‹') : null,
      list.length > 1 ? h('button', { type: 'button', class: 'nx', 'aria-label': 'Next', onclick: function () { step(1); } }, '›') : null,
      cap);
    paint();
    document.addEventListener('keydown', onKey);
    document.body.appendChild(root);
    root.querySelector('.cl').focus();
  };

  // ---------- change one product's newest snapshot (used by Edit > Save changes) ----------
  D.updateLatest = function (key, mutate, notes) { return CWStore.updateLatest(key, mutate, notes); };

  D.deleteProduct = function (key) { return CWStore.deleteProduct(key); };

  D.copyText = async function (text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ } t.remove(); return ok;
    }
  };

  // ---------- table export: wrapped cells for Copy table (plain text + HTML) and a real .xlsx file ----------
  D.saveBlob = function (name, blob) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  };
  function cellStr(v) { return v === null || v === undefined ? '' : String(v).replace(/\r\n?/g, '\n'); }
  function escHtml(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // tab-separated text; a cell with line breaks, tabs or quotes is wrapped in quotes so Sheets and Excel keep it in one cell
  D.toTsv = function (rows) {
    return rows.map(function (r) {
      return r.map(function (v) { var t = cellStr(v); return /[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join('\t');
    }).join('\n');
  };
  D.toHtmlTable = function (rows) {
    var td = 'vertical-align:top;white-space:pre-wrap;width:240px;border:1px solid #D9CFD6;padding:4px 6px;font-family:Arial,sans-serif;font-size:11pt;';
    var out = '<table style="border-collapse:collapse"><tbody>';
    rows.forEach(function (r, ri) {
      out += '<tr>';
      r.forEach(function (v, ci) {
        var st = td + (ri === 0 ? 'font-weight:bold;background:#FBEFF4;' : ci === 0 ? 'font-weight:bold;' : '');
        out += '<' + (ri === 0 ? 'th' : 'td') + ' style="' + st + '">' + escHtml(cellStr(v)).replace(/\n/g, '<br>') + '</' + (ri === 0 ? 'th' : 'td') + '>';
      });
      out += '</tr>';
    });
    return out + '</tbody></table>';
  };
  // puts the table on the clipboard twice: plain text (quoted tab-separated) and a styled HTML table
  D.copyTable = async function (rows) {
    var tsv = D.toTsv(rows);
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([tsv], { type: 'text/plain' }), 'text/html': new Blob([D.toHtmlTable(rows)], { type: 'text/html' }) })]);
        return true;
      }
    } catch (e) { /* fall back to plain text below */ }
    return D.copyText(tsv);
  };

  // A small .xlsx writer (no library): bold tinted header, first column bold, wrap text and top alignment on every cell, set column widths.
  var CRC = null;
  function crc32(bytes) {
    if (!CRC) { CRC = []; for (var n = 0; n < 256; n++) { var k = n; for (var j = 0; j < 8; j++) k = k & 1 ? 0xEDB88320 ^ (k >>> 1) : k >>> 1; CRC[n] = k >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files) {                       // files: [{name, text}] -> Uint8Array of a ZIP (stored, no compression)
    var enc = new TextEncoder(), chunks = [], central = [], offset = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      var local = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      chunks.push(new Uint8Array(local), name, data);
      central.push({ name: name, crc: crc, size: data.length, offset: offset });
      offset += local.length + name.length + data.length;
    });
    var cdStart = offset, cdSize = 0;
    central.forEach(function (e) {
      var rec = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(e.crc), u32(e.size), u32(e.size), u16(e.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.offset));
      chunks.push(new Uint8Array(rec), e.name); cdSize += rec.length + e.name.length;
    });
    chunks.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(cdStart), u16(0))));
    var total = chunks.reduce(function (s, c) { return s + c.length; }, 0), out = new Uint8Array(total), p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }
  function colName(i) { var s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; }
  function xmlText(t) { return t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  D.xlsx = function (rows, opts) {
    opts = opts || {};
    var ncol = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
    var widths = [], i;
    for (i = 0; i < ncol; i++) widths.push(i === 0 ? (opts.firstWidth || 22) : (opts.colWidth || 38));
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>' +
      '<cols>' + widths.map(function (w, k) { return '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols><sheetData>';
    rows.forEach(function (r, ri) {
      var lines = 1;
      r.forEach(function (v, ci) {
        var chars = Math.max(8, widths[ci] * 1.05), n = 0;
        cellStr(v).split('\n').forEach(function (ln) { n += Math.max(1, Math.ceil(ln.length / chars)); });
        lines = Math.max(lines, n);
      });
      sheet += '<row r="' + (ri + 1) + '" ht="' + Math.min(409, lines * 15 + 4) + '" customHeight="1">';
      r.forEach(function (v, ci) {
        var ref = colName(ci) + (ri + 1), s = ri === 0 ? 1 : ci === 0 ? 2 : 3;
        if (typeof v === 'number' && isFinite(v)) sheet += '<c r="' + ref + '" s="' + s + '"><v>' + v + '</v></c>';
        else sheet += '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + xmlText(cellStr(v)) + '</t></is></c>';
      });
      sheet += '</row>';
    });
    sheet += '</sheetData></worksheet>';
    var A = '<alignment vertical="top" wrapText="1"/>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFBEFF4"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9CFD6"/></left><right style="thin"><color rgb="FFD9CFD6"/></right><top style="thin"><color rgb="FFD9CFD6"/></top><bottom style="thin"><color rgb="FFD9CFD6"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' + A + '</xf>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + A + '</xf>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">' + A + '</xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' + A + '</xf></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    var name = xmlText(String(opts.sheet || 'Compare').replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31));
    var bytes = zipStore([
      { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + name + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', text: styles },
      { name: 'xl/worksheets/sheet1.xml', text: sheet }
    ]);
    return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  // "Nov 2026" from an ISO date
  D.monthYear = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getFullYear();
  };

  D.fmtTime = function (iso) { var d = new Date(iso); return isNaN(d.getTime()) ? '' : PDP.pad2(d.getHours()) + ':' + PDP.pad2(d.getMinutes()); };

  // small switches kept in settings (e.g. showSources)
  D.saveSetting = function (patch) { return CWStore.saveSetting(patch); };

  // How many saved products mention each key ingredient (the name before " — "), most frequent first
  D.topIngredients = function (products, limit) {
    var count = {}, shown = {};
    products.forEach(function (p) {
      var seen = {};
      D.items(p.latest.ai && p.latest.ai.keyIngredients).forEach(function (x) {
        var name = D.ing(x.text).name.replace(/\s+/g, ' ').trim(), k = name.toLowerCase();
        if (!k || seen[k]) return;
        seen[k] = 1; count[k] = (count[k] || 0) + 1; if (!shown[k]) shown[k] = name;
      });
    });
    return Object.keys(count).map(function (k) { return { name: shown[k], n: count[k] }; })
      .sort(function (a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1); }).slice(0, limit || 10);
  };

  // Per category: number of products and the average price per ml or g (only products with the same unit as the most common one)
  D.categoryStats = function (products) {
    var map = {};
    products.forEach(function (p) { (map[p.category] = map[p.category] || []).push(p); });
    return Object.keys(map).map(function (name) {
      var list = map[name], units = {}, best = '';
      list.forEach(function (p) { var pp = D.price(p.latest); if (pp.perUnit !== null) units[pp.unit] = (units[pp.unit] || 0) + 1; });
      Object.keys(units).forEach(function (u) { if (!best || units[u] > units[best]) best = u; });
      var vals = list.map(function (p) { return D.price(p.latest); }).filter(function (pp) { return pp.perUnit !== null && pp.unit === best; });
      var avg = vals.length ? vals.reduce(function (s, pp) { return s + pp.perUnit; }, 0) / vals.length : null;
      return { name: name, count: list.length, avg: avg === null ? '—' : PDP.rupiah(avg) + ' / ' + best };
    }).sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });
  };

  // re-render whenever the saved data changes (for example a save while this page is open)
  D.watch = function (fn) { CWStore.watch(fn); };

  // things that only exist inside the extension: AI calls (run by the extension) and opening a tab
  var inExt = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.sendMessage);
  D.inExtension = inExt;
  // On the website the request goes through the Civil War extension installed in the same browser (src/bridge.js),
  // which uses the Gemini key saved in the extension. No key is ever typed or stored on the website.
  var bridgeSeen = false, bridgeSeq = 0;
  var NO_EXT = 'To use this AI button on the website, the Civil War extension (version 0.14 or newer) must be installed in this same Chrome, with your Gemini key saved in it. Install or update it, refresh this page and try again. Everything already analysed stays visible without it.';
  function bridgeCall(payload, waitMs) {
    return new Promise(function (resolve) {
      var id = 'cw' + Date.now() + '_' + (++bridgeSeq), timer;
      function onMsg(e) {
        var d = e.data;
        if (e.source !== window || e.origin !== location.origin || !d || d.cwBridge !== 'res' || d.id !== id) return;
        clearTimeout(timer); window.removeEventListener('message', onMsg); resolve(d);
      }
      window.addEventListener('message', onMsg);
      timer = setTimeout(function () { window.removeEventListener('message', onMsg); resolve(null); }, waitMs);
      payload.cwBridge = 'req'; payload.id = id; window.postMessage(payload, location.origin);
    });
  }
  D.ask = async function (msg) {
    if (inExt) return chrome.runtime.sendMessage(msg);
    if (!bridgeSeen) {
      var pong = await bridgeCall({ kind: 'ping' }, 1500);
      if (!pong || !pong.pong) return { ok: false, error: NO_EXT };
      bridgeSeen = true;
    }
    var d = await bridgeCall({ msg: msg }, 240000);      // the AI can take a while
    return d ? d.res : { ok: false, error: 'The extension did not answer in time. Try again.' };
  };
  D.openTab = function (url) {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: url });
    else window.open(url, '_blank', 'noopener');
  };
})();
