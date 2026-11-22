(function () {
  'use strict';
  var h = Dash.h;
  Dash.nav('compare');

  var MAX = 10;
  var SIZES = { S: 120, M: 190, L: 290 };
  var SEL_KEY = 'cw_compare_sel';
  var qv = new URLSearchParams(location.search).get('view');
  var state = { view: qv === 'full' || qv === 'claim' ? qv : 'pdp', sel: [], zoom: 'M', pick: false, pickQ: '', pickNote: '', pickScroll: 0, setMenu: '', sets: [], slideFilter: 'all', det: { busy: false, done: 0, total: 0, err: '' }, wording: false, mode: 'claims', cm: { sig: '', status: 'idle', data: null, err: '' } };
  var products = [];
  var NOT_READ = 'Not read yet';

  // The chosen products are kept for this browser tab only, so a new visit starts empty.
  // Both tabs (Compare PDP / Compare complete description) are drawn by this same page, so they always share the selection.
  function loadSel() { try { var v = JSON.parse(sessionStorage.getItem(SEL_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function saveSel() { try { sessionStorage.setItem(SEL_KEY, JSON.stringify(state.sel)); } catch (e) { /* ignore */ } }

  function byKey(k) { return products.filter(function (p) { return p.key === k; })[0] || null; }
  function chosen() { return state.sel.map(byKey).filter(Boolean); }
  function ai(r) { return r.ai || null; }
  function none(t) { return h('span', { class: 'none' }, t); }
  function href(p) { return 'detail.html?p=' + encodeURIComponent(p.key); }
  function nameLink(p) { return h('a', { class: 'plink', href: href(p), title: 'Open product detail' }, p.latest.title); }
  function remove(p) { return h('button', { type: 'button', class: 'xbtn', 'aria-label': 'Remove ' + p.latest.title + ' from comparison', onclick: function () { state.sel = state.sel.filter(function (k) { return k !== p.key; }); saveSel(); draw(); } }, '×'); }

  // ---------- "+ Add product": a checklist that stays open while you tick products ----------
  // Type to search, tick products one by one, or "Select all matching" to fill the free places (up to MAX). Done closes it.
  // The button itself stays exactly where it was in the top bar; only this pop-up changed.
  function addWidget(cls) {
    var wrap = h('div', { class: 'pickwrap' });
    wrap.appendChild(h('button', { type: 'button', class: cls || 'btn primary', 'aria-expanded': String(state.pick), onclick: function () { state.pick = !state.pick; state.setMenu = ''; if (state.pick) { state.pickQ = ''; state.pickNote = ''; state.pickScroll = 0; } draw(); } }, '+ Add product'));
    if (!state.pick) return wrap;
    var search = h('input', { class: 'input', type: 'search', placeholder: 'Search brand or product name', 'aria-label': 'Search saved products', style: 'width:100%;margin:2px 0 2px' });
    search.value = state.pickQ || '';
    var head = h('div', { class: 'ph' });
    var allBtn = h('button', { type: 'button', class: 'pkall' });
    var note = h('span', { class: 'pknote', role: 'status' });
    var listBox = h('div', { class: 'plist' });
    function matchOf(p) { var q = search.value.trim().toLowerCase(); return !q || ((p.latest.brand || '') + ' ' + p.latest.title + ' ' + p.category).toLowerCase().indexOf(q) >= 0; }
    function commit(note2) { state.pickNote = note2 || ''; state.pickQ = search.value; saveSel(); draw(); }
    function fill() {
      var q = search.value.trim(), free = MAX - state.sel.length;
      state.pickQ = search.value;
      var m = products.filter(matchOf);
      var todo = m.filter(function (p) { return state.sel.indexOf(p.key) < 0; });
      head.textContent = 'Pick up to ' + MAX + ' products (' + state.sel.length + ' of ' + MAX + ' chosen)';
      // "Select all matching" appears once you typed something that matches products not chosen yet
      var showAll = !!q && todo.length > 0 && free > 0;
      allBtn.hidden = !showAll;
      if (showAll) allBtn.textContent = todo.length <= free ? 'Select all matching (' + todo.length + ')' : 'Select the first ' + free + ' of ' + todo.length + ' matching';
      note.textContent = free <= 0 ? 'Limit of ' + MAX + ' reached. Untick one to choose another.' : (state.pickNote || '');
      allBtn.onclick = function () {
        var add = todo.slice(0, free);
        add.forEach(function (p) { state.sel.push(p.key); });
        commit(todo.length > free ? 'Added ' + add.length + ' of ' + todo.length + ' matching products (limit ' + MAX + ').' : 'Added ' + add.length + ' matching product' + (add.length === 1 ? '' : 's') + '.');
      };
      listBox.textContent = '';
      if (!m.length) { listBox.appendChild(h('div', { class: 'small', style: 'padding:6px 8px' }, q ? 'No saved product matches "' + q + '".' : 'No saved products yet.')); return; }
      m.forEach(function (p) {
        var r = p.latest, on = state.sel.indexOf(p.key) >= 0, off = !on && free <= 0;
        var cb = h('input', { type: 'checkbox', 'aria-label': r.title });
        cb.checked = on; cb.disabled = off;
        cb.addEventListener('change', function () {
          if (cb.checked) { if (state.sel.length < MAX && state.sel.indexOf(p.key) < 0) state.sel.push(p.key); }
          else state.sel = state.sel.filter(function (k) { return k !== p.key; });
          commit('');
        });
        listBox.appendChild(h('label', { class: 'pkrow' + (on ? ' on' : '') + (off ? ' off' : '') }, cb,
          h('span', { class: 'cv', style: r.images && r.images[0] ? 'background-image:' + Dash.cssUrl(r.images[0]) : '' }),
          h('span', { style: 'flex:1;min-width:0' }, h('b', null, r.title), h('span', { class: 'mt' }, (r.brand || 'Brand not found') + ' · ' + p.category))));
      });
    }
    search.addEventListener('input', function () { state.pickNote = ''; fill(); });
    search.addEventListener('keydown', function (e) { if (e.key === 'Escape') { state.pick = false; draw(); } });
    listBox.addEventListener('scroll', function () { state.pickScroll = listBox.scrollTop; });
    fill();
    wrap.appendChild(h('div', { class: 'pop pickpop', role: 'dialog', 'aria-label': 'Choose products' },
      head, search, h('div', { class: 'pkact' }, allBtn, note), listBox,
      h('div', { class: 'pkfoot' }, h('button', { type: 'button', class: 'pkdone', onclick: function () { state.pick = false; draw(); } }, 'Done'))));
    var pop = wrap.lastChild;
    setTimeout(function () {
      search.focus(); try { search.setSelectionRange(search.value.length, search.value.length); } catch (e) { /* ignore */ }
      listBox.scrollTop = state.pickScroll || 0;
      var r = pop.getBoundingClientRect();           // opens left-aligned under the button; only flips if it would be cut off at the right edge
      if (r.right > document.documentElement.clientWidth - 8) { pop.style.left = 'auto'; pop.style.right = '0'; }
    }, 0);
    return wrap;
  }

  // ---------- saved comparison sets (kept by CWStore, so they survive closing the browser) ----------
  var MAX_SETS = 40;
  async function readSets() { var all = await CWStore.getSets(); return all.filter(function (x) { return x && x.name && Array.isArray(x.keys); }); }
  async function writeSets(arr) { await CWStore.putSets(arr); state.sets = arr; }
  async function saveSet(name) {
    name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) return false;
    var sets = await readSets(), keys = state.sel.slice(), now = new Date().toISOString();
    var at = -1; sets.forEach(function (x, i) { if (x.name.toLowerCase() === name.toLowerCase()) at = i; });
    if (at >= 0) { sets[at] = { name: sets[at].name, keys: keys, savedAt: now }; Dash.toast('Set "' + sets[at].name + '" updated with the ' + keys.length + ' chosen products.'); }
    else {
      if (sets.length >= MAX_SETS) { Dash.toast('You can keep up to ' + MAX_SETS + ' sets. Delete one first.'); return false; }
      sets.push({ name: name, keys: keys, savedAt: now }); Dash.toast('Set "' + name + '" saved.');
    }
    await writeSets(sets); return true;
  }
  async function deleteSet(name) { var sets = (await readSets()).filter(function (x) { return x.name !== name; }); await writeSets(sets); }
  function loadSet(set) {
    var have = products.map(function (p) { return p.key; });
    var keys = set.keys.filter(function (k) { return have.indexOf(k) >= 0; }).slice(0, MAX), lost = set.keys.length - keys.length;
    state.sel = keys; saveSel(); state.setMenu = ''; state.pick = false;
    Dash.toast(keys.length ? '"' + set.name + '" loaded (' + keys.length + ' products)' + (lost > 0 ? '. ' + lost + (lost === 1 ? ' product is' : ' products are') + ' no longer saved and was skipped.' : '.') : 'None of the products in "' + set.name + '" are saved any more.');
    draw();
  }
  var confirmDel = '';
  function setsWidgets(list) {
    var out = [];
    if (list.length) {
      var w = h('div', { class: 'pickwrap' });
      w.appendChild(h('button', { type: 'button', class: 'btn', 'aria-expanded': String(state.setMenu === 'save'), onclick: function () { state.setMenu = state.setMenu === 'save' ? '' : 'save'; state.pick = false; draw(); } }, 'Save set'));
      if (state.setMenu === 'save') {
        var inp = h('input', { class: 'input', type: 'text', maxlength: '40', placeholder: 'e.g. Lip Serum Benchmark', 'aria-label': 'Set name', style: 'width:100%' });
        async function go() { if (await saveSet(inp.value)) { state.setMenu = ''; draw(); } else inp.focus(); }
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        w.appendChild(h('div', { class: 'pop pop-s', role: 'dialog', 'aria-label': 'Save this comparison set' },
          h('div', { class: 'ph' }, 'Name this group of ' + list.length + ' products. Saving a name that exists updates that set.'), inp,
          h('div', { class: 'popbtns' }, h('button', { type: 'button', class: 'btn sm', onclick: function () { state.setMenu = ''; draw(); } }, 'Cancel'), h('button', { type: 'button', class: 'btn sm primary', onclick: go }, 'Save'))));
        setTimeout(function () { inp.focus(); }, 0);
      }
      out.push(w);
    }
    var w2 = h('div', { class: 'pickwrap' });
    w2.appendChild(h('button', { type: 'button', class: 'btn', 'aria-expanded': String(state.setMenu === 'sets'), onclick: async function () { if (state.setMenu !== 'sets') state.sets = await readSets(); state.setMenu = state.setMenu === 'sets' ? '' : 'sets'; state.pick = false; confirmDel = ''; draw(); } }, 'Saved sets ▾' + (state.sets.length ? ' (' + state.sets.length + ')' : '')));
    if (state.setMenu === 'sets') {
      w2.appendChild(h('div', { class: 'pop pop-s', role: 'menu', 'aria-label': 'Saved comparison sets' },
        h('div', { class: 'ph' }, state.sets.length ? 'Click a set to load it. This replaces the products now chosen.' : 'No saved sets yet. Choose 2 or more products, then press Save set.'),
        h('div', { class: 'plist' }, state.sets.map(function (set) {
          var n = set.keys.filter(function (k) { return byKey(k); }).length;
          return h('div', { class: 'setrow' },
            h('button', { type: 'button', class: 'setload', role: 'menuitem', onclick: function () { loadSet(set); } }, h('b', null, set.name), h('span', { class: 'mt' }, n + (n === 1 ? ' product' : ' products') + (n < set.keys.length ? ' (' + (set.keys.length - n) + ' no longer saved)' : ''))),
            h('button', { type: 'button', class: 'setdel' + (confirmDel === set.name ? ' sure' : ''), 'aria-label': 'Delete set ' + set.name,
              onclick: async function () { if (confirmDel === set.name) { confirmDel = ''; await deleteSet(set.name); draw(); } else { confirmDel = set.name; draw(); } } }, confirmDel === set.name ? 'Delete?' : '×'));
        }))));
    }
    out.push(w2);
    return out;
  }

  // the lowest price per ml/g, only among products with the same unit
  function lowestSet(list) {
    var byUnit = {};
    list.forEach(function (p) { var pp = Dash.price(p.latest); if (pp.perUnit !== null) (byUnit[pp.unit] = byUnit[pp.unit] || []).push({ k: p.key, v: pp.perUnit }); });
    var low = {};
    Object.keys(byUnit).forEach(function (u) {
      var a = byUnit[u]; if (a.length < 2) return;
      var min = Math.min.apply(null, a.map(function (x) { return x.v; }));
      a.forEach(function (x) { if (x.v === min) low[x.k] = true; });
    });
    return low;
  }

  // ---------- export ----------
  // list fields: one item per line inside the same cell ("• item"); How to use is numbered
  function listText(items, numbered) { return Dash.items(items).map(function (x, i) { return (numbered ? (i + 1) + '. ' : '• ') + x.text; }).join('\n'); }
  function fieldRows(list) {
    var rows = [['Brand', function (r) { return r.brand || ''; }], ['Product name', function (r) { return r.title; }], ['Category', function (r, p) { return p.category; }],
      ['Netto', function (r) { return r.netto ? r.netto.text : ''; }], ['Price', function (r) { return r.price ? PDP.rupiah(r.price) : ''; }],
      ['Price per ml/g', function (r) { var pp = Dash.price(r); return pp.perUnit === null ? '' : pp.ppu; }],
      ['Shades / Variants', function (r) { return listText((r.variants || []).map(function (v) { return { text: v }; })); }], ['Single key message', function (r) { return r.keyMessage || ''; }], ['Product description', function (r) { return r.productDescription || ''; }],
      ['Hero claims', function (r) { return listText(ai(r) && ai(r).heroClaims); }], ['RTB', function (r) { return listText(ai(r) && ai(r).rtb); }],
      ['Key ingredients', function (r) { return listText(ai(r) && ai(r).keyIngredients); }],
      ['Texture', function (r) { return ai(r) ? ai(r).texture || '' : ''; }], ['Finish', function (r) { return ai(r) ? ai(r).finish || '' : ''; }],
      ['Target skin type', function (r) { return ai(r) ? ai(r).targetSkin || '' : ''; }], ['How to use', function (r) { return listText(ai(r) && ai(r).howToUse, true); }],
      ['Banner slides', function (r) { return String((r.images || []).length); }], ['Slide 1 link', function (r) { return (r.images || [])[0] || ''; }]];
    return rows.map(function (f) { return [f[0]].concat(list.map(function (p) { return f[1](p.latest, p); })); });
  }
  function tableRows(list) { return [['Field'].concat(list.map(function (p) { return Dash.label(p); }))].concat(fieldRows(list)); }
  function exportXlsx() {
    Dash.saveBlob('Compare product ' + Dash.today() + '.xlsx', Dash.xlsx(tableRows(chosen()), { sheet: 'Compare product' }));
    Dash.toast('Excel file saved. Columns are sized and text wraps inside each cell.');
  }
  async function copyTable() {
    Dash.toast((await Dash.copyTable(tableRows(chosen()))) ? 'Table copied. Paste it into Google Sheets or Excel; text wraps inside each cell.' : 'Could not copy. Use Download Excel instead.');
  }

  // ---------- Export HD Image (Compare PDP): every slide of every chosen product, left to right, on one canvas ----------
  var HD_H = 500;        // height of every slide in the image (before the sharpness scale below)
  var HD_LEFT = 460;     // width of the name + price column
  var HD_FONT = '"Plus Jakarta Sans", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  async function loadBitmap(url) {
    try {   // extension pages may read Shopee's picture host directly (host permission), so the canvas stays clean
      var res = await fetch(url, { referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await createImageBitmap(await res.blob());
    } catch (e) {
      return new Promise(function (resolve) {
        var im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer';
        im.onload = function () { resolve(im); }; im.onerror = function () { resolve(null); }; im.src = url;
      });
    }
  }
  function wrapLines(ctx, text, maxW, maxLines) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
    return lines;
  }
  async function paintRows(rows, scale) {     // rows: [{p, slides:[{bmp,w}]}]  ->  canvas
    var SEP = 6, W = 0;
    rows.forEach(function (r) { r.w = HD_LEFT + r.slides.reduce(function (s, x) { return s + x.w; }, 0); W = Math.max(W, r.w); });
    var Ht = rows.length * HD_H + (rows.length - 1) * SEP;
    var cv = document.createElement('canvas'); cv.width = Math.round(W * scale); cv.height = Math.round(Ht * scale);
    var ctx = cv.getContext('2d'); ctx.scale(scale, scale);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, Ht);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    rows.forEach(function (r, ri) {
      var y = ri * (HD_H + SEP), rec = r.p.latest, pp = Dash.price(rec);
      ctx.fillStyle = '#EEE9ED'; ctx.fillRect(0, y + HD_H, W, SEP);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, y, HD_LEFT, HD_H);
      ctx.fillStyle = '#EEE9ED'; ctx.fillRect(HD_LEFT - 2, y, 2, HD_H);
      ctx.textBaseline = 'alphabetic';
      ctx.font = '700 32px ' + HD_FONT;
      var lines = wrapLines(ctx, rec.title, HD_LEFT - 64, 6), lh = 42, brand = (rec.brand || '').toUpperCase();
      var blockH = (brand ? 34 : 0) + lines.length * lh + 20 + 50, ty = y + (HD_H - blockH) / 2;
      if (brand) { ctx.font = '700 20px ' + HD_FONT; ctx.fillStyle = '#6B6470'; ty += 22; ctx.fillText(brand, 32, ty); ty += 12; }
      ctx.font = '700 32px ' + HD_FONT; ctx.fillStyle = '#231F24';
      lines.forEach(function (ln) { ty += lh - (ln === lines[0] && !brand ? 0 : 0); ctx.fillText(ln, 32, ty - 8); });
      ty += 20 + 38; ctx.font = '800 40px ' + HD_FONT; ctx.fillStyle = '#8A2E5C'; ctx.fillText(pp.total, 32, ty);
      var x = HD_LEFT;
      r.slides.forEach(function (s) {
        if (s.bmp) ctx.drawImage(s.bmp, x, y, s.w, HD_H);
        else { ctx.fillStyle = '#FBEFF4'; ctx.fillRect(x, y, s.w, HD_H); ctx.fillStyle = '#6B6470'; ctx.font = '600 22px ' + HD_FONT; ctx.fillText('Picture could not be loaded', x + 24, y + HD_H / 2); }
        x += s.w;
      });
    });
    return cv;
  }
  function canvasBlob(cv) { return new Promise(function (resolve) { cv.toBlob(resolve, 'image/png'); }); }
  async function exportHd(btn) {
    var list = chosen(); if (!list.length) return;
    var label = btn.textContent; btn.disabled = true; btn.textContent = 'Building image…';
    try {
      var rows = [], failed = 0;
      for (var pi = 0; pi < list.length; pi++) {
        var slides = visibleSlides(list[pi]), row = { p: list[pi], slides: [] };
        if (!slides.length) continue;
        for (var si = 0; si < slides.length; si += 6) {     // a few pictures at a time
          var part = await Promise.all(slides.slice(si, si + 6).map(function (s) { return loadBitmap(s.url); }));
          part.forEach(function (bmp) {
            if (!bmp) failed++;
            var nw = bmp ? (bmp.width || bmp.naturalWidth) : 0, nh = bmp ? (bmp.height || bmp.naturalHeight) : 0;
            row.slides.push({ bmp: bmp, w: bmp && nh ? Math.round(HD_H * nw / nh) : HD_H });
          });
        }
        rows.push(row);
      }
      // Browsers limit one canvas to about 16000 px wide and 200 million pixels; keep as sharp as possible inside that.
      function fit(rs) {
        var w = 0; rs.forEach(function (r) { w = Math.max(w, HD_LEFT + r.slides.reduce(function (s, x) { return s + x.w; }, 0)); });
        var h = rs.length * (HD_H + 6);
        return Math.min(2, 16000 / w, 30000 / h, Math.sqrt(190e6 / (w * h)));     // width, height and total pixels all stay inside the browser limits (10 rows are ~5,000 px tall)
      }
      if (!rows.length) { Dash.toast(state.slideFilter === 'all' ? 'No banners to export.' : 'No ' + filterLabel() + ' slides to export. Detect slide types first, or choose All slides.'); return; }
      var scale = fit(rows), files = 0, day = Dash.today() + (state.slideFilter === 'all' ? '' : ' (' + filterLabel() + ')');
      if (scale >= 0.75 || rows.length === 1) {
        var blob = await canvasBlob(await paintRows(rows, scale));
        if (!blob) throw new Error('The browser could not build an image this large');
        Dash.saveBlob('Compare PDP ' + day + '.png', blob); files = 1;
      } else {   // too wide for one sharp picture: one PNG per product, each at its own best sharpness
        for (var ri = 0; ri < rows.length; ri++) {
          var b = await canvasBlob(await paintRows([rows[ri]], fit([rows[ri]])));
          if (b) { Dash.saveBlob('Compare PDP ' + day + ' - ' + Dash.label(rows[ri].p).replace(/[\\\/:*?"<>|]+/g, ' ').slice(0, 60) + '.png', b); files++; }
        }
      }
      rows.forEach(function (r) { r.slides.forEach(function (s) { if (s.bmp && s.bmp.close) s.bmp.close(); }); });
      Dash.toast((files > 1 ? files + ' images saved (one per product, because all together would be too wide to stay sharp). ' : 'Image saved. ') +
        (scale < 1 && files === 1 ? 'Scaled to ' + Math.round(scale * 100) + '% to fit the browser limit. ' : '') + (failed ? failed + ' picture(s) could not be loaded.' : ''));
    } catch (e) {
      Dash.toast('Could not build the image: ' + (e && e.message || e));
    } finally { btn.disabled = false; btn.textContent = label; }
  }


  // ---------- slide types (for the "Filter slides" dropdown) ----------
  var SLIDE_FILTERS = [['all', 'All slides'], ['shades', 'Shades'], ['ingredients', 'Ingredients'], ['hero', 'Hero Claim'], ['howto', 'How to Use']];
  function filterLabel() { return SLIDE_FILTERS.filter(function (f) { return f[0] === state.slideFilter; })[0][1]; }
  function hasTypes(r) { return !!(r.slideTypes && Object.keys(r.slideTypes).length); }
  function visibleSlides(p) {
    var r = p.latest, slides = Dash.slides(r);
    if (state.slideFilter === 'all') return slides;
    var t = r.slideTypes || {};
    return slides.filter(function (s) { return t[PDP.imgKey(s.url)] === state.slideFilter; });
  }
  function needDetect(list) { return state.slideFilter === 'all' ? [] : list.filter(function (p) { return !hasTypes(p.latest); }); }
  // one request per product; the answer is saved on the product so it is only read once
  async function detectTypes(list) {
    var d = state.det; d.busy = true; d.err = ''; d.done = 0; d.total = list.length; draw();
    for (var i = 0; i < list.length; i++) {
      var p = list[i], r = p.latest, res;
      try { res = await Dash.ask({ type: 'PDP_SLIDE_TYPES', payload: { images: r.images || [], descImages: r.descImages || [] } }); }
      catch (e) { res = { ok: false, error: String(e && e.message || e) }; }
      if (!res || !res.ok) { d.err = Dash.label(p) + ': ' + ((res && res.error) || 'no answer from the extension. Reload the extension and try again.'); break; }
      var byLabel = res.types, byKey = {};
      Dash.slides(r).forEach(function (s) { if (byLabel[s.label]) byKey[PDP.imgKey(s.url)] = byLabel[s.label]; });
      Dash.slides(r).forEach(function (s) { var k = PDP.imgKey(s.url); if (!byKey[k]) byKey[k] = 'other'; });   // pictures the AI did not place
      await Dash.updateLatest(p.key, function (rec) { rec.slideTypes = byKey; });
      d.done = i + 1; draw();
    }
    d.busy = false; draw();
  }
  function detectBar(list) {
    var need = needDetect(list), d = state.det;
    if (d.busy) return h('div', { class: 'status' }, h('span', { class: 'ai' }, 'AI'), h('span', null, 'Detecting slide types… ' + d.done + ' of ' + d.total + ' products. About 10 to 20 seconds each.'));
    if (d.err) return h('div', { class: 'status err', role: 'alert' }, h('b', null, 'Could not detect slide types.'), h('span', null, d.err),
      need.length ? h('button', { type: 'button', class: 'btn sm', onclick: function () { detectTypes(need); } }, 'Try again') : null);
    if (!need.length) return null;
    return h('div', { class: 'status' }, h('span', { class: 'ai' }, 'AI'),
      h('span', null, 'Slide types are not detected yet for ' + Dash.pluralize(need.length, 'product', 'products') + '. Reads each product\'s pictures once with gemini-3.5-flash-lite and remembers the result.'),
      h('button', { type: 'button', class: 'btn primary sm', onclick: function () { detectTypes(need); } }, '✨ Detect slide types'));
  }

  // ---------- tab 1: Compare PDP (one row per product, slides tightly side by side) ----------
  function pdpView(list) {
    var size = SIZES[state.zoom];
    return h('section', { style: 'display:flex;flex-direction:column;gap:8px' }, list.map(function (p) {
      var r = p.latest, pp = Dash.price(r), slides = visibleSlides(p);
      var emptyMsg = !Dash.slides(r).length ? 'No banners were saved for this product.'
        : !hasTypes(r) && state.slideFilter !== 'all' ? 'Slide types not detected yet.' : 'No ' + filterLabel() + ' slides detected for this product.';
      return h('div', { class: 'card crow' },
        h('div', { class: 'left' }, nameLink(p), h('div', { class: 'pr' }, pp.total)),
        h('div', { class: 'track' }, slides.length
          ? h('div', { class: 'in' }, slides.map(function (s, si) {
              return h('button', { type: 'button', class: 'sl', 'aria-label': 'Zoom ' + s.label + ' of ' + r.title, title: s.label, onclick: function () { Dash.lightbox(slides, si, r.title); } },
                Dash.img(s.url, s.label + ' of ' + r.title, { style: 'width:' + size + 'px;height:' + size + 'px' }));
            }))
          : h('div', { class: 'emptyrow' }, emptyMsg)),
        remove(p));
    }));
  }

  // ---------- tab 2: Compare complete description ----------
  function fullView(list) {
    var n = list.length;
    var cols = '104px repeat(' + n + ', minmax(190px, 1fr))';
    var minW = 104 + n * 190;
    var low = lowestSet(list);
    function row(lab, cell, aiRow) {
      return h('div', { class: 'tr', style: 'grid-template-columns:' + cols + ';min-width:' + minW + 'px' },
        h('div', { class: 'lab' }, lab, aiRow ? [' ', h('span', { class: 'ai' }, 'AI')] : null),
        list.map(function (p) { return h('div', { class: 'c' }, cell(p.latest, p)); }));
    }
    function bullets(items, kind) {
      var it = Dash.items(items);
      if (!it.length) return none('Not found');
      if (kind === 'steps') return h('ol', { class: 'tsteps' }, it.map(function (x) { return h('li', null, h('span', null, x.text)); }));
      return h('ul', { class: 'tight' }, it.map(function (x) {
        if (kind === 'ing') { var g = Dash.ing(x.text); return h('li', null, h('span', null, h('b', null, g.name), g.fn ? h('span', { class: 'fn' }, ' · ' + g.fn) : null)); }
        return h('li', null, h('span', null, x.text));
      }));
    }
    function aiPick(fn) { return function (r) { return ai(r) ? fn(ai(r)) : none(NOT_READ); }; }

    var headRow = h('div', { class: 'tr', style: 'grid-template-columns:' + cols + ';min-width:' + minW + 'px' },
      h('div', { class: 'lab' }),
      list.map(function (p) {
        var r = p.latest;
        return h('div', { class: 'c head' },
          h('div', { class: 'cov', role: 'img', 'aria-label': 'Slide 1 (cover) of ' + r.title, style: r.images && r.images[0] ? 'background-image:' + Dash.cssUrl(r.images[0]) : '' }),
          nameLink(p), remove(p));
      }));

    return h('section', { class: 'card tbl' },
      headRow,
      row('Netto', function (r) { return r.netto ? h('b', null, r.netto.text) : none('Not found'); }),
      row('Price', function (r, p) {
        var pp = Dash.price(r);
        return [h('div', { class: 'pr' }, pp.total), h('div', { style: 'color:var(--ink2);font-size:11.5px;margin-top:2px' }, pp.ppu, low[p.key] ? ' ' : null, low[p.key] ? h('span', { class: 'badge good', style: 'height:16px;font-size:10px;padding:0 6px' }, 'Lowest') : null)];
      }),
      row('Shades / Variants', function (r) { return (r.variants || []).length ? h('ul', { class: 'shades' }, r.variants.map(function (s) { return h('li', { style: 'padding:1px 0;border:0' }, s); })) : none('None listed'); }),
      row('Single key message', function (r) { return r.keyMessage ? h('p', { style: 'margin:0;font-weight:600;line-height:1.45' }, r.keyMessage) : none(ai(r) ? 'Not found' : NOT_READ); }, true),
      row('Product description', function (r) { return r.productDescription ? h('p', { style: 'margin:0;line-height:1.5;white-space:pre-line' }, r.productDescription) : none(ai(r) ? 'Not captured yet' : NOT_READ); }, true),
      row('Hero claims', aiPick(function (a) { return bullets(a.heroClaims); }), true),
      row('RTB', aiPick(function (a) { return bullets(a.rtb); }), true),
      row('Key ingredients', aiPick(function (a) { return bullets(a.keyIngredients, 'ing'); }), true),
      row('Texture, finish & skin', aiPick(function (a) {
        return h('div', { style: 'line-height:1.5' },
          [['Texture', a.texture], ['Finish', a.finish], ['Skin', a.targetSkin]].map(function (x) { return h('div', null, h('span', { class: 'fn' }, x[0] + ': '), x[1] || none('Not found')); }));
      }), true),
      row('How to use', aiPick(function (a) { return bullets(a.howToUse, 'steps'); }), true),
      row('Banner slides', function (r) {
        var slides = Dash.slides(r);
        if (!slides.length) return none('No banners');
        return h('div', { class: 'strip' }, slides.map(function (s, i) {
          return h('button', { type: 'button', 'aria-label': 'Zoom ' + s.label + ' of ' + r.title, onclick: function () { Dash.lightbox(slides, i, r.title); } }, Dash.img(s.url, s.label));
        }));
      }));
  }


  // ---------- tab 3: Claim matrix (AI groups the claims; the cells show the exact PDP wording or a tick) ----------
  var CM_KEY = 'cw_claim_cache3';          // 3: the result now also holds the Competitor Pattern
  var PAT_KEY = 'cw_pattern_open';
  function patOpen() { try { return sessionStorage.getItem(PAT_KEY) !== '0'; } catch (e) { return true; } }
  function patSet(v) { try { sessionStorage.setItem(PAT_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ } }
  function cmCache() { try { return JSON.parse(sessionStorage.getItem(CM_KEY) || '{}'); } catch (e) { return {}; } }
  function cmStore(sig, data) { var c = cmCache(); c[sig] = data; try { sessionStorage.setItem(CM_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } }
  function cmDrop(sig) { var c = cmCache(); delete c[sig]; try { sessionStorage.setItem(CM_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } }
  function hash(str) { var x = 5381; for (var i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0; return String(x >>> 0); }

  // every claim line of a product, each with an ID the AI can point to
  function claimLines(p) {
    var r = p.latest, a = ai(r) || {}, out = [];
    Dash.items(a.heroClaims).forEach(function (x, i) { if (x.text) out.push({ kind: 'hero claim', text: x.text, tag: 'h' + i }); });
    Dash.items(a.rtb).forEach(function (x, i) { if (x.text) out.push({ kind: 'RTB', text: x.text, tag: 'r' + i }); });
    if (r.keyMessage) out.push({ kind: 'key message', text: r.keyMessage, tag: 'k' });
    return out;
  }
  // the facts the AI needs for the pattern: price per unit is worked out here, not by the AI
  function profileOf(p) {
    var r = p.latest, a = ai(r) || {}, pp = Dash.price(r);
    return { category: r.category || '', price: r.price ? Math.round(r.price).toLocaleString('id-ID') : '', netto: r.netto ? r.netto.text : '',
      perUnit: pp.perUnit === null ? '' : Math.round(pp.perUnit).toLocaleString('id-ID'), unit: pp.unit || '',
      texture: a.texture || '', finish: a.finish || '', ingredients: Dash.items(a.keyIngredients).map(function (x) { return x.text; }),
      description: r.productDescription || '' };
  }
  function cmInput() {
    var list = chosen(), withAi = [], without = [];
    list.forEach(function (p, i) {
      var lines = claimLines(p), id = 'P' + (i + 1);
      if (lines.length) withAi.push({ id: id, p: p, name: Dash.label(p), profile: profileOf(p), lines: lines.map(function (l) { return { id: id + '.' + l.tag, kind: l.kind, text: l.text }; }) });
      else without.push(p);
    });
    // the signature changes when the chosen products or their claim texts change, so edited claims are read again
    var sig = hash(JSON.stringify(withAi.map(function (x) { return [x.p.key, x.lines.map(function (l) { return l.text; }), x.profile]; })));
    return { withAi: withAi, without: without, sig: sig };
  }
  // Looks only at the cache. The AI is called by startAnalysis(), which runs when the person clicks the button.
  function ensureMatrix(inp) {
    var cm = state.cm;
    if (inp.withAi.length < 2) { cm.sig = ''; cm.status = 'idle'; return; }
    if (cm.sig === inp.sig && cm.status !== 'idle') return;
    cm.sig = inp.sig; cm.err = '';
    var cached = cmCache()[inp.sig];
    if (cached) { cm.status = 'done'; cm.data = cached; } else cm.status = 'idle';
  }
  function startAnalysis(inp) {
    var cm = state.cm, sig = inp.sig;
    cm.sig = sig; cm.status = 'busy'; cm.err = '';
    draw();
    Dash.ask({ type: 'PDP_CLAIM_MATRIX', payload: { products: inp.withAi.map(function (x) { return { id: x.id, name: x.name, profile: x.profile, lines: x.lines }; }) } }).then(function (res) {
      if (state.cm.sig !== sig) return;           // the products changed while waiting
      if (res && res.ok) { state.cm.status = 'done'; state.cm.data = { claims: res.claims, pattern: res.pattern || null, model: res.model, at: res.at }; cmStore(sig, state.cm.data); }
      else { state.cm.status = 'error'; state.cm.err = (res && res.error) || 'No answer from the extension. Reload the extension and try again.'; }
      draw();
    }, function (e) { if (state.cm.sig !== sig) return; state.cm.status = 'error'; state.cm.err = String(e && e.message || e); draw(); });
  }
  // rows: one per claim, the exact original wording per product, sorted by Total
  function cmRows(inp) {
    var lineText = {};
    inp.withAi.forEach(function (x) { x.lines.forEach(function (l) { lineText[l.id] = l.text; }); });
    var rows = state.cm.data.claims.map(function (c, i) {
      var by = {};   // product id -> { w: the short phrase, full: the whole original line }
      c.items.forEach(function (it) { var pid = it.ref.split('.')[0]; if (!by[pid] && lineText[it.ref]) by[pid] = { w: it.phrase || lineText[it.ref], full: lineText[it.ref] }; });
      return { label: c.label, by: by, total: Object.keys(by).length, i: i };
    }).filter(function (r) { return r.total > 0; });
    rows.sort(function (a, b) { return b.total - a.total || a.i - b.i; });
    return rows.slice(0, 15);
  }
  function cmCell(r, id) { var w = r.by[id]; return w ? (state.wording ? w.w : '✓') : '—'; }
  // Ingredients & Formula mode: one row per key active (same name in different case counts once), read from the saved AI reading
  function cmFormulaRows(inp) {
    var m = {};
    inp.withAi.forEach(function (x) {
      var seen = {};
      Dash.items(ai(x.p.latest) && ai(x.p.latest).keyIngredients).forEach(function (it) {
        var g = Dash.ing(it.text), name = String(g.name || '').replace(/\s+/g, ' ').trim(), k = name.toLowerCase();
        if (!k || seen[k]) return;
        seen[k] = 1;
        (m[k] = m[k] || { label: name, by: {} }).by[x.id] = { fn: g.fn || '' };
      });
    });
    return Object.keys(m).map(function (k) { var r = m[k]; r.total = Object.keys(r.by).length; return r; })
      .sort(function (a, b) { return b.total - a.total || (a.label < b.label ? -1 : 1); }).slice(0, 20);
  }
  function fmCell(r, id) { var w = r.by[id]; return w ? (state.wording ? (w.fn || 'Listed') : '✓') : '—'; }
  function aiText(x, key) { var a = ai(x.p.latest); return a && a[key] ? String(a[key]) : ''; }
  function cmTable(inp) {
    var cols = inp.withAi, formula = state.mode === 'formula';
    var head = [formula ? 'Ingredient / formula' : 'Claim'].concat(cols.map(function (x) { return x.name; }), ['Total']);
    var price = [['Price'].concat(cols.map(function (x) { return Dash.price(x.p.latest).total; }), [''])];
    if (!formula) {
      return [head].concat(price, cmRows(inp).map(function (r) { return [r.label].concat(cols.map(function (x) { return cmCell(r, x.id); }), [r.total]); }));
    }
    return [head].concat(price,
      cmFormulaRows(inp).map(function (r) { return [r.label].concat(cols.map(function (x) { return fmCell(r, x.id); }), [r.total]); }),
      [['Texture'].concat(cols.map(function (x) { return aiText(x, 'texture') || '—'; }), [''])],
      [['Finish'].concat(cols.map(function (x) { return aiText(x, 'finish') || '—'; }), [''])]);
  }
  function cmExport(kind) {
    var t = cmTable(cmInput()), formula = state.mode === 'formula', what = state.wording ? 'wording' : '✓ and —';
    if (kind === 'xlsx') { Dash.saveBlob((formula ? 'Ingredients and formula ' : 'Claim matrix ') + Dash.today() + '.xlsx', Dash.xlsx(t, { sheet: formula ? 'Ingredients & Formula' : 'Claim matrix', colWidth: 34 })); Dash.toast('Excel file saved (' + what + ').'); return; }
    Dash.copyTable(t).then(function (ok) { Dash.toast(ok ? 'Table copied (' + what + '). Paste it into Google Sheets or Excel.' : 'Could not copy. Use Download Excel instead.'); });
  }
  // the matrix controls live directly above the table header: mode, Show wording, Copy table, Download Excel
  function modeSeg() {
    function b(v, label) { return h('button', { type: 'button', 'aria-pressed': String(state.mode === v), onclick: function () { state.mode = v; draw(); } }, label); }
    return h('div', { class: 'seg sm', role: 'group', 'aria-label': 'Matrix mode' }, b('claims', 'Claims'), b('formula', 'Ingredients & Formula'));
  }
  function mxBar() {
    return h('div', { class: 'mxbar' },
      h('div', { class: 'l' }, modeSeg(), h('span', { class: 'vr', 'aria-hidden': 'true' }),
        h('span', { class: 'switchrow' }, h('span', { class: 'lbl', id: 'wl' }, 'Show wording'),
          h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(state.wording), 'aria-labelledby': 'wl', onclick: function () { state.wording = !state.wording; draw(); } }, h('i')))),
      h('div', { class: 'r' },
        h('button', { type: 'button', class: 'btn sm', onclick: function () { cmExport('copy'); } }, 'Copy table'),
        h('button', { type: 'button', class: 'btn sm', onclick: function () { cmExport('xlsx'); } }, 'Download Excel')));
  }
  function mxHead(inp, first) {
    return h('tr', null, h('th', { class: 'claim' }, h('span', { class: 'eyebrow' }, first)),
      inp.withAi.map(function (x) {
        var r = x.p.latest, pp = Dash.price(r);
        return h('th', { class: 'pc' }, h('span', { class: 'eyebrow br' }, r.brand || ''), nameLink(x.p),
          h('div', { class: 'pcprice' }, h('b', null, pp.total)));
      }),
      h('th', { class: 'tot' }, h('span', { class: 'eyebrow' }, 'Total')));
  }
  function mxSection(n, title) { return h('tr', { class: 'sec' }, h('td', { class: 'claim' }, title), h('td', { colspan: String(n + 1) })); }   // the title is in the sticky first column, so it stays visible while scrolling
  function formulaBody(inp) {
    var rows = cmFormulaRows(inp), n = inp.withAi.length, out = [];
    out.push(mxSection(n, 'Key actives'));
    if (!rows.length) out.push(h('tr', null, h('td', { class: 'claim' }, h('span', { class: 'none' }, 'None found')), h('td', { colspan: String(n + 1) }, h('span', { class: 'none' }, 'The AI reading has no key ingredients for these products.'))));
    rows.forEach(function (r) {
      out.push(h('tr', null, h('td', { class: 'claim' }, r.label),
        inp.withAi.map(function (x) {
          var w = r.by[x.id];
          if (!w) return h('td', { class: 'cell no', 'aria-label': 'Not listed' }, '—');
          return state.wording ? h('td', { class: 'cell w', title: w.fn ? '' : 'Listed, no function stated' }, w.fn || h('span', { class: 'none' }, 'Listed')) : h('td', { class: 'cell ck yes', 'aria-label': 'Listed', title: w.fn || 'Listed, no function stated' }, '✓');
        }), h('td', { class: 'tot' }, String(r.total))));
    });
    out.push(mxSection(n, 'Formula'));
    [['Texture', 'texture'], ['Finish', 'finish']].forEach(function (f) {
      out.push(h('tr', null, h('td', { class: 'claim' }, f[0]),
        inp.withAi.map(function (x) { var t = aiText(x, f[1]); return t ? h('td', { class: 'cell w val' }, t) : h('td', { class: 'cell no' }, '—'); }),
        h('td', { class: 'tot' }, '')));
    });
    return out;
  }
  function claimView(list) {
    var inp = cmInput(), cm = state.cm, box = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    if (list.length < 2) {
      box.appendChild(h('section', { class: 'emptybox' }, h('div', { class: 't' }, list.length ? 'Add one more product' : 'Nothing to compare yet'),
        h('div', { class: 'd' }, 'The claim matrix needs 2 to ' + MAX + ' products. It reads their hero claims, RTB and single key message.'), null));
      return box;
    }
    if (inp.without.length) box.appendChild(h('div', { class: 'status' }, h('span', { class: 'badge warn' }, 'Not read yet'),
      h('span', null, inp.without.map(function (p) { return p.latest.title; }).join(', ') + ' has no AI reading, so it is left out. Run "Analyze Banners & Description with AI" in the side panel, save again, then come back.')));
    if (inp.withAi.length < 2) { box.appendChild(h('section', { class: 'emptybox' }, h('div', { class: 't' }, 'Not enough claims to compare'), h('div', { class: 'd' }, 'At least 2 of the chosen products need an AI reading.'))); return box; }
    ensureMatrix(inp);
    var formula = state.mode === 'formula';
    if (!formula && cm.status === 'idle') {
      box.appendChild(h('section', { class: 'card', style: 'padding:20px;display:flex;flex-direction:column;gap:14px;align-items:center;text-align:center' },
        h('div', { style: 'font-size:15px;font-weight:700' }, 'Ready to build the claim matrix'),
        h('div', { class: 'small', style: 'max-width:520px' }, 'The AI will group the claims of these ' + inp.withAi.length + ' products into short labels and pull out only the phrase that proves each claim.'),
        h('div', { class: 'chips', style: 'justify-content:center' }, inp.withAi.map(function (x) { return h('span', { class: 'chipx', style: 'padding:0 10px' }, x.name); })),
        h('button', { type: 'button', class: 'btn primary', style: 'height:36px;padding:0 18px;font-size:13px', onclick: function () { startAnalysis(inp); } }, '✨ Analyze Claims Matrix'),
        h('div', { class: 'small' }, 'Sends the claim text only to gemini-3.5-flash-lite. Nothing is sent until you click. The result is remembered for this exact set of products.')));
      return box;
    }
    if (!formula && cm.status === 'busy') {
      box.appendChild(h('div', { class: 'status' }, h('span', { class: 'ai' }, 'AI'), h('span', null, 'Grouping claims with gemini-3.5-flash-lite… about 5 to 15 seconds.')));
      box.appendChild(h('section', { class: 'card', style: 'padding:14px;display:flex;flex-direction:column;gap:12px' }, [1, 2, 3, 4, 5, 6].map(function () { return h('div', { class: 'skel' }); })));
      return box;
    }
    if (!formula && cm.status === 'error') {
      box.appendChild(h('div', { class: 'status err', role: 'alert' }, h('b', null, 'Could not build the matrix.'), h('span', null, cm.err),
        h('button', { type: 'button', class: 'btn sm', onclick: function () { startAnalysis(inp); } }, 'Try again')));
      return box;
    }
    var rows = formula ? [] : cmRows(inp);
    var pat = cm.status === 'done' && cm.data ? cm.data.pattern : null;
    if (pat) {
      var open = patOpen();
      var pts = [['Market table stakes vs. white space', pat.tableStakes], ['Communication & hook angle', pat.communication], ['Formula & price-to-benefit', pat.formulaPrice]].filter(function (x) { return x[1]; });
      box.appendChild(h('section', { class: 'card pat', 'aria-label': 'Competitor pattern' },
        h('div', { class: 'pathd' },
          h('button', { type: 'button', class: 'patt', 'aria-expanded': String(open), onclick: function () { patSet(!open); draw(); } },
            h('span', { 'aria-hidden': 'true' }, open ? '▾' : '▸'), h('b', null, '✨ Competitor Pattern'), h('span', { class: 'small' }, open ? '' : ' ' + pts.length + ' insights, hidden')),
          h('button', { type: 'button', class: 'btn sm', onclick: function () { cmDrop(inp.sig); startAnalysis(inp); } }, 'Regenerate')),
        open ? h('ul', { class: 'patl' }, pts.map(function (x) { return h('li', null, h('b', null, x[0] + ': '), x[1]); })) : null));
    }
    var body = formula ? formulaBody(inp) : rows.map(function (r) {
      return h('tr', null, h('td', { class: 'claim' }, r.label),
        inp.withAi.map(function (x) {
          var w = r.by[x.id];
          if (!w) return h('td', { class: 'cell no' + (state.wording ? '' : ' ck'), 'aria-label': 'Not mentioned' }, '—');
          return state.wording ? h('td', { class: 'cell w', title: 'Full line on the PDP: ' + w.full }, w.w) : h('td', { class: 'cell ck yes', 'aria-label': 'Mentioned', title: w.full }, '✓');
        }), h('td', { class: 'tot' }, String(r.total)));
    });
    box.appendChild(h('section', { class: 'card mxcard' }, mxBar(),
      h('div', { class: 'tbl' }, h('table', { class: 'cm' }, h('thead', null, mxHead(inp, formula ? 'Ingredient / formula' : 'Claim')), h('tbody', null, body)))));
    if (formula) {
      box.appendChild(h('div', { class: 'msg' }, 'Read from each product\'s saved AI reading (key ingredients, texture and finish). No AI call is made in this mode. With Show wording off, ✓ means the ingredient is listed; switch it on to see the function each brand states for it. Texture and Finish always show their text. Check AI wording against the banner before relying on it. Copy table and Download Excel follow the Show wording switch and include the price.'));
      return box;
    }
    box.appendChild(h('div', { class: 'msg' }, 'Cached for this combination of products (' + cm.data.model + ', ' + Dash.fmtTime(cm.data.at) + '). Switching tabs does not call the AI again. After adding or removing a product, or editing a claim, click Analyze again. Hover a cell to see the full line from the PDP. ',
      h('a', { href: '#', onclick: function (e) { e.preventDefault(); cmDrop(inp.sig); startAnalysis(inp); } }, 'Regenerate'),
      '. Claims and the Competitor Pattern are written by AI from the saved text only; check numbers and wording against the banners before relying on them. Claims are grouped into short labels, top 15 by Total. Each cell shows only the phrase from the PDP that supports the claim; check it against the banner before relying on it. Copy table and Download Excel follow the Show wording switch and include the price.'));
    return box;
  }

  // ---------- page ----------
  function draw() {
    var app = document.getElementById('app');
    app.textContent = '';
    var list = chosen();
    var claim = state.view === 'claim';

    // 0.17.0 layout: title, buttons and tabs sit on the plum band; Add product / Save set / Saved sets are at the top (Claim matrix: in the Chosen products card)
    var tools = [];
    if (!claim && products.length) {
      tools.push(addWidget(), setsWidgets(list));
      if (list.length) {
        tools.push(h('button', { type: 'button', class: 'btn', title: 'Remove all chosen products', onclick: function () { state.sel = []; state.pick = false; state.setMenu = ''; saveSel(); draw(); } }, 'Clear all'));
        tools.push(h('span', { class: 'tsep', 'aria-hidden': 'true' }));
        tools.push(h('button', { type: 'button', class: 'btn', onclick: copyTable }, 'Copy table'));
        tools.push(h('button', { type: 'button', class: 'btn', onclick: exportXlsx }, 'Download Excel'));
        if (state.view === 'pdp') tools.push(h('button', { type: 'button', class: 'btn', onclick: function (e) { exportHd(e.currentTarget); } }, 'Export HD Image'));
      }
    }
    app.appendChild(h('div', { class: 'bar' },
      h('div', null, h('h1', null, 'Compare product'),
        h('div', { class: 'sub' }, claim ? 'Which claims each product makes, grouped by AI. Switch to the exact PDP wording any time.'
          : state.view === 'pdp' ? 'Pick 2 to ' + MAX + ' products. Click any banner to zoom.' : 'Side by side, from the key message down to the formula.')),
      h('div', { class: 'tools' }, tools)));

    function tab(v, label) { return h('button', { type: 'button', 'aria-pressed': String(state.view === v), onclick: function () { state.view = v; state.pick = false; state.setMenu = ''; draw(); } }, label); }
    app.appendChild(h('div', { class: 'row2' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Comparison mode' }, tab('pdp', 'Compare PDP'), tab('full', 'Compare Description'), tab('claim', 'Claim Matrix'))));

    if (!products.length) { app.appendChild(Dash.emptyState()); return; }

    if (claim) {
      // Chosen products card: + Add product first, then the chosen products, Save set / Saved sets on the right
      app.appendChild(h('section', { class: 'card panel pickcard' },
        h('div', { class: 'ph' }, h('h2', null, 'Chosen products'), h('span', { class: 'small' }, 'Pick 2 to ' + MAX + ' products.')),
        h('div', { class: 'pickrow' }, addWidget('btn dashed'),
          list.map(function (p) {
            return h('span', { class: 'chipx' }, Dash.label(p), h('button', { type: 'button', 'aria-label': 'Remove ' + p.latest.title, onclick: function () { state.sel = state.sel.filter(function (k) { return k !== p.key; }); saveSel(); draw(); } }, '×'));
          }),
          h('span', { class: 'pickend' }, setsWidgets(list), list.length ? h('button', { type: 'button', class: 'btn', onclick: function () { state.sel = []; state.pick = false; state.setMenu = ''; saveSel(); draw(); } }, 'Clear all') : null))));
      app.appendChild(claimView(list));
    } else if (!list.length) {
      app.appendChild(h('section', { class: 'emptybox' },
        h('div', { class: 't' }, 'No products chosen yet'),
        h('div', { class: 'd' }, 'Click + Add product at the top and tick 2 to ' + MAX + ' products. Each product appears here as soon as you tick it. You can also tick products in the Product library and click Compare selected.')));
    } else {
      if (state.view === 'pdp') {
        app.appendChild(h('div', { class: 'pdptools' },
          h('label', { class: 'zoomrow' }, h('span', { class: 'eyebrow' }, 'Filter slides'),
            h('select', { class: 'select', 'aria-label': 'Filter slides', onchange: function (e) { state.slideFilter = e.target.value; state.det.err = ''; draw(); } },
              SLIDE_FILTERS.map(function (f) { return h('option', { value: f[0], selected: state.slideFilter === f[0] ? true : null }, f[1]); }))),
          h('div', { class: 'zoomrow' }, h('span', { class: 'eyebrow' }, 'Slide size'),
            h('div', { class: 'seg sm', role: 'group', 'aria-label': 'Slide size' }, ['S', 'M', 'L'].map(function (z) {
              return h('button', { type: 'button', 'aria-pressed': String(state.zoom === z), onclick: function () { state.zoom = z; draw(); } }, z);
            })))));
        var db = detectBar(list); if (db) app.appendChild(db);
      }
      app.appendChild(state.view === 'pdp' ? pdpView(list) : fullView(list));
    }
    app.appendChild(h('div', { class: 'msg' }, 'Your chosen products stay selected when you switch between the tabs. Click a product name to open its detail. "Not read yet" means the AI reading was not run for that product; "Not found" means the AI did not find it. Check the AI wording against the banner before you rely on it. Pictures after the gallery slides are labelled Desc n (from the description).'));
  }

  async function refresh() {
    var data = await Dash.load();
    products = Dash.products(data);
    state.sets = await readSets();
    var keys = products.map(function (p) { return p.key; });
    state.sel = (state.sel.length ? state.sel : loadSel()).filter(function (k) { return keys.indexOf(k) >= 0; }).slice(0, MAX);   // a deleted product leaves the comparison
    saveSel();
    draw();
  }

  // one outside-click / Esc handler for all three pop-ups (Add product, Save set, Saved sets)
  document.addEventListener('click', function (e) {
    if (!state.pick && !state.setMenu) return;
    var path = e.composedPath ? e.composedPath() : [];      // the path is fixed when the click starts, so it still works after a pop-up redraws itself
    if (path.some(function (n) { return n.classList && n.classList.contains('pickwrap'); })) return;
    state.pick = false; state.setMenu = ''; confirmDel = ''; draw();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && (state.pick || state.setMenu)) { state.pick = false; state.setMenu = ''; confirmDel = ''; draw(); }
  });

  refresh();
  Dash.watch(function (changes) { if (changes.snapshots) refresh(); });
})();
