(function () {
  'use strict';
  var h = Dash.h;
  Dash.nav('library');   // a product is opened from the library or the main page

  var key = new URLSearchParams(location.search).get('p');
  var product = null;        // {key, latest, notes, ...}
  var editing = false;
  var draft = null;          // what the inputs hold while editing
  var catCounts = {};        // every category in the library -> number of products, for the Category suggestions
  var armTimer = null;
  var showSrc = false;       // "Show slide sources" switch: Slide n / Desc n tags and the labels under the banners; off by default, remembered in settings

  var NOT_READ = 'Not read yet. Press "Analyze Banners & Description with AI" in the side panel.';

  var NO_PDESC = 'Not captured yet. Run the AI reading again in the side panel, or use Edit to type it.';

  function aiOf(r) { return r.ai || null; }

  // ---------- the working copy used by Edit ----------
  function makeDraft(p) {
    var r = p.latest, ai = aiOf(r) || {};
    return {
      skm: r.keyMessage || '',
      pdesc: r.productDescription || '',
      main: p.main || '',
      cat: p.latest.category || '',
      claims: Dash.items(ai.heroClaims), rtb: Dash.items(ai.rtb), ing: Dash.items(ai.keyIngredients), how: Dash.items(ai.howToUse),
      texture: ai.texture || '', finish: ai.finish || '', skin: ai.targetSkin || '',
      shades: (r.variants || []).slice(),
      notes: p.notes || ''
    };
  }

  async function saveChanges() {
    var btn = document.getElementById('save-changes');
    if (btn) btn.disabled = true;
    function clean(list) {
      return list.map(function (x) { return { text: String(x.text).replace(/\s+/g, ' ').trim(), source: x.source || '' }; }).filter(function (x) { return x.text; });
    }
    var shades = [];
    draft.shades.forEach(function (s) { s = String(s).trim(); if (s && shades.indexOf(s) < 0) shades.push(s); });
    var fields = { heroClaims: clean(draft.claims), rtb: clean(draft.rtb), keyIngredients: clean(draft.ing), howToUse: clean(draft.how),
      texture: draft.texture.trim(), finish: draft.finish.trim(), targetSkin: draft.skin.trim() };
    var anyAi = fields.heroClaims.length || fields.rtb.length || fields.keyIngredients.length || fields.howToUse.length || fields.texture || fields.finish || fields.targetSkin;
    try {
      await Dash.updateLatest(key, function (rec) {
        rec.keyMessage = draft.skm.trim();
        rec.productDescription = draft.pdesc.replace(/[ \t]+/g, ' ').trim();
        rec.variants = shades;
        rec.mainCategory = PDP.cleanMainCategory(draft.main);
        var cat = String(draft.cat || '').replace(/\s+/g, ' ').trim();
        if (cat) { var same = Object.keys(catCounts).filter(function (c) { return c.toLowerCase() === cat.toLowerCase(); })[0]; rec.category = same || cat; }   // an empty box keeps the old category; "lip serum" reuses the existing "Lip Serum"
        if (rec.ai || anyAi) rec.ai = Object.assign({ audit: [] }, rec.ai || {}, fields);
      }, draft.notes);
      editing = false; draft = null;
      Dash.toast('Changes saved.');
      await refresh();
    } catch (e) {
      if (btn) btn.disabled = false;
      Dash.toast('Could not save: ' + (e && e.message || e));
    }
  }

  // ---------- small builders ----------
  function head(title, ai) { return h('div', { class: 'hd' }, h3(title), ai ? h('span', { class: 'ai' }, 'AI') : null); }
  function h3(t) { return h('h3', null, t); }
  function none(t) { return h('span', { class: 'none' }, t); }

  // read-only list: bullets, numbered steps or ingredient + function
  function readList(items, kind, emptyText) {
    if (!items.length) return none(emptyText);
    var lis = items.map(function (x) {
      if (kind === 'ing') {
        var g = Dash.ing(x.text);
        return h('li', null, h('span', null, h('b', null, g.name), g.fn ? h('span', { class: 'fn' }, ' · ' + g.fn) : null, showSrc && x.source ? ' ' : null, showSrc && x.source ? h('span', { class: 'src' }, '· ' + x.source) : null));
      }
      return h('li', null, h('span', null, x.text, showSrc && x.source ? ' ' : null, showSrc && x.source ? h('span', { class: 'src' }, '· ' + x.source) : null));
    });
    return h(kind === 'steps' ? 'ol' : 'ul', { class: kind === 'steps' ? 'steps' : 'dots' }, lis);
  }

  // editable list: inputs with × and + Add. Editing a line drops its source (as in the side panel).
  function editList(list, kind, label) {
    var box = h('div');
    function redraw(focusLast) {
      box.textContent = '';
      list.forEach(function (x, i) {
        var row = h('div', { class: 'ed' });
        if (kind === 'steps') row.appendChild(h('span', { class: 'n' }, String(i + 1)));
        if (kind === 'ing') {
          var g = Dash.ing(x.text);
          var nm = h('input', { class: 'f', type: 'text', value: g.name, 'aria-label': 'Ingredient', style: 'font-weight:700' });
          var fn = h('input', { class: 'f2', type: 'text', value: g.fn, 'aria-label': 'What it does' });
          var upd = function () { var t = nm.value.trim() + (fn.value.trim() ? ' — ' + fn.value.trim() : ''); if (t !== x.text) { x.text = t; x.source = ''; } };
          nm.addEventListener('input', upd); fn.addEventListener('input', upd);
          row.appendChild(nm); row.appendChild(fn);
        } else {
          var inp = h('input', { class: 'f', type: 'text', value: x.text, 'aria-label': label + ' ' + (i + 1) });
          inp.addEventListener('input', function () { if (inp.value !== x.text) { x.text = inp.value; x.source = ''; } });
          row.appendChild(inp);
          if (showSrc && x.source) row.appendChild(h('span', { class: 'chip' }, x.source));
        }
        row.appendChild(h('button', { type: 'button', class: 'x', 'aria-label': 'Remove', onclick: function () { list.splice(i, 1); redraw(); } }, '×'));
        box.appendChild(row);
      });
      box.appendChild(h('button', { type: 'button', class: 'add', onclick: function () { list.push({ text: '', source: '' }); redraw(true); } }, '+ Add'));
      if (focusLast) { var ins = box.querySelectorAll('input'); var t = kind === 'ing' ? ins[ins.length - 2] : ins[ins.length - 1]; if (t) t.focus(); }
    }
    redraw(false);
    return box;
  }

  function textInput(id, val, set) {
    var i = h('input', { class: 'f', id: id, type: 'text', value: val, style: 'height:38px;border:1px solid #E7C3D3;border-radius:10px;padding:0 12px;width:100%' });
    i.addEventListener('input', function () { set(i.value); });
    return i;
  }

  function section(title, ai, readNode, editNode) {
    return h('section', { class: 'card sec' }, head(title, ai), editing ? editNode : readNode);
  }

  // ---------- Category: type a new one or pick an existing one ----------
  var comboClose = null;
  document.addEventListener('mousedown', function (e) { if (comboClose && !(e.target.closest && e.target.closest('.combo'))) comboClose(); });
  function catCombo(d) {
    var input = h('input', { class: 'input', id: 'e-cat', type: 'text', role: 'combobox', 'aria-label': 'Category', 'aria-expanded': 'false', 'aria-controls': 'e-cat-list', 'aria-autocomplete': 'list', autocomplete: 'off', placeholder: 'Type or pick a category', value: d.cat || '' });
    var chev = h('button', { type: 'button', class: 'chev', tabindex: '-1', 'aria-label': 'Show existing categories' }, '▾');
    var list = h('div', { class: 'clist', id: 'e-cat-list', role: 'listbox', hidden: true });
    var wrap = h('div', { class: 'combo' }, input, chev, list);
    var items = [], hi = -1, isOpen = false, filtering = false;
    function close() { isOpen = false; list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); if (comboClose === close) comboClose = null; }
    function choose(v) { d.cat = v; input.value = v; close(); }
    function paint(filter) {
      filtering = filter;
      var q = filter ? input.value.trim().toLowerCase() : '';
      var names = Object.keys(catCounts).sort(function (a, b) { return a < b ? -1 : 1; });
      items = names.filter(function (n) { return !q || n.toLowerCase().indexOf(q) >= 0; }).map(function (n) { return { v: n, n: catCounts[n] }; });
      var typed = input.value.trim();
      if (filter && typed && !names.some(function (n) { return n.toLowerCase() === typed.toLowerCase(); })) items.push({ v: typed, add: true });
      list.textContent = '';
      if (!items.length) list.appendChild(h('div', { class: 'none', style: 'padding:7px 9px' }, 'No saved categories yet. Type one.'));
      items.forEach(function (it, i) {
        list.appendChild(h('div', { role: 'option', id: 'e-cat-o' + i, 'aria-selected': String(i === hi), class: i === hi ? 'on' : null, onmousedown: function (e) { e.preventDefault(); choose(it.v); } },
          it.add ? h('span', { class: 'new' }, '＋ Use “' + it.v + '” as a new category') : h('span', null, it.v),
          it.add ? null : h('span', { class: 'cnt' }, it.n + (it.n === 1 ? ' product' : ' products'))));
      });
      isOpen = true; list.hidden = false; input.setAttribute('aria-expanded', 'true'); comboClose = close;
      if (hi >= 0) input.setAttribute('aria-activedescendant', 'e-cat-o' + hi);
    }
    input.addEventListener('focus', function () { hi = -1; paint(false); });
    input.addEventListener('click', function () { if (!isOpen) { hi = -1; paint(false); } });   // clicking the box again after choosing reopens the list
    input.addEventListener('input', function () { d.cat = input.value; hi = -1; paint(true); });
    chev.addEventListener('mousedown', function (e) { e.preventDefault(); if (isOpen) close(); else { input.focus(); hi = -1; paint(false); } });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) { hi = -1; paint(false); }
        if (!items.length) return;
        hi = e.key === 'ArrowDown' ? Math.min(items.length - 1, hi + 1) : Math.max(0, hi - 1);
        paint(filtering);
      } else if (e.key === 'Enter') { if (isOpen && hi >= 0 && items[hi]) { e.preventDefault(); choose(items[hi].v); } else close(); }
      else if (e.key === 'Escape' && isOpen) { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') close();
    });
    return wrap;
  }

  // ---------- the page ----------
  function draw() {
    var app = document.getElementById('app');
    app.textContent = '';
    if (!product) {
      app.appendChild(h('a', { class: 'back', href: 'library.html' }, '← Back to Product library'));
      app.appendChild(h('div', { class: 'card empty' }, h('div', { class: 't' }, 'Product not found'), h('div', { class: 'd' }, 'It may have been deleted. Go back to the Product library and pick another one.')));
      return;
    }
    var r = product.latest, ai = aiOf(r), pp = Dash.price(r), slides = Dash.slides(r);
    var d = draft;

    app.appendChild(h('a', { class: 'back', href: 'library.html' }, '← Back to Product library'));

    // header
    var delBtn = h('button', { type: 'button', class: 'btn sm danger' }, 'Delete');
    delBtn.addEventListener('click', async function () {
      if (!delBtn.classList.contains('armed')) {
        delBtn.classList.add('armed'); delBtn.textContent = 'Click again to delete';
        armTimer = setTimeout(function () { delBtn.classList.remove('armed'); delBtn.textContent = 'Delete'; }, 4000);
        return;
      }
      clearTimeout(armTimer);
      await Dash.deleteProduct(key);
      location.href = 'library.html';
    });
    var acts = editing
      ? [h('button', { type: 'button', class: 'btn sm primary', id: 'save-changes', onclick: saveChanges }, 'Save changes'),
         h('button', { type: 'button', class: 'btn sm', onclick: function () { editing = false; draft = null; draw(); } }, 'Cancel')]
      : [h('button', { type: 'button', class: 'btn sm primary', onclick: function () { editing = true; draft = makeDraft(product); draw(); } }, '✏️ Edit'),
         h('button', { type: 'button', class: 'btn sm', onclick: function () { Dash.openTab(r.url); } }, 'Open on Shopee ↗'),
         delBtn];

    var fact = function (k, v, small) { return h('div', null, h('div', { class: 'k' }, k), h('b', { class: small ? 's' : null }, v)); };
    // 0.17.0: the header sits on the plum band; the facts are white cards right under it
    app.appendChild(h('section', { class: 'dhead' },
      h('div', { class: 'cov', role: 'img', 'aria-label': 'Slide 1 (cover) of ' + r.title, style: r.images && r.images[0] ? 'background-image:' + Dash.cssUrl(r.images[0]) : '' }),
      h('div', { class: 'body' },
        h('div', { class: 'chips' }, h('span', { class: 'brandname' }, r.brand || 'Brand not found'), product.isNew ? Dash.newBadge() : null,
          product.isNew ? h('span', { class: 'small' }, 'badge ends ' + PDP.fmtDate(new Date(new Date(r.newLaunchMarkedAt).getTime() + Dash.NEW_DAYS * 86400000).toISOString())) : null),
        h('h1', null, r.title),
        // Main category › Sub-category, right under the product name (editable here in Edit mode)
        editing
          ? h('div', { class: 'crumbs edit' },
              h('select', { class: 'select', id: 'e-main', 'aria-label': 'Main category', onchange: function (e) { d.main = e.target.value; } },
                [['', 'Main category not set'], ['Skincare', 'Skincare'], ['Decorative', 'Decorative'], ['Personal Care', 'Personal Care']].map(function (o) { return h('option', { value: o[0], selected: d.main === o[0] ? true : null }, o[1]); })),
              h('span', { class: 'sep', 'aria-hidden': 'true' }, '›'), catCombo(d))
          : h('nav', { class: 'crumbs', 'aria-label': 'Category' },
              h('a', { class: 'crumb', href: 'library.html' }, product.main || 'Main category not set'),
              h('span', { class: 'sep', 'aria-hidden': 'true' }, '›'),
              h('a', { class: 'crumb on', href: 'library.html#cat=' + encodeURIComponent(product.category) }, product.category))),
      h('div', { class: 'dacts' }, acts)));
    var shopUrl = r.shopId ? 'https://shopee.co.id/shop/' + encodeURIComponent(r.shopId) : '';
    app.appendChild(h('div', { class: 'factcards' },
          fact('Netto', r.netto ? r.netto.text : '—'),
          fact('Price', pp.total),
          fact('Per ml/g', pp.ppu),
          h('div', null, h('div', { class: 'k' }, 'Shop'),
            r.shopName && shopUrl ? h('a', { class: 'shoplink', href: shopUrl, target: '_blank', rel: 'noopener', title: 'Open this shop on Shopee' }, r.shopName + ' ↗') : h('b', { class: 's' }, r.shopName || '—'),
            h('div', { class: 'small' }, 'Shopee' + (r.isOfficial ? ' · official store' : ''))),
          fact('Saved', PDP.fmtDate(r.capturedAt) + (r.savedBy ? ' by ' + r.savedBy : ''), true)));

    // banner gallery
    app.appendChild(h('section', { class: 'card gal' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px' },
        h('h2', null, 'Banner slides'), h('span', { class: 'small' }, Dash.pluralize(slides.length, 'image', 'images') + ' · click to zoom')),
      slides.length
        ? h('div', { class: 'tr', style: 'border:0' }, slides.map(function (s, i) {
            return h('button', { type: 'button', 'aria-label': 'Zoom ' + s.label, onclick: function () { Dash.lightbox(slides, i, r.brand || ''); } },
              Dash.img(s.url, s.label + ' of ' + r.title), showSrc ? h('span', { class: 'lab' }, s.label) : null);
          }))
        : none('No banners were saved for this product.')));

    // left and right columns
    var skm = h('section', { class: 'card sec tint' }, head('Single key message', true),
      editing
        ? (function () { var t = h('textarea', { class: 'f', rows: 2, 'aria-label': 'Single key message', style: 'font-weight:600' }); t.value = d.skm; t.addEventListener('input', function () { d.skm = t.value; }); return t; })()
        : (r.keyMessage ? h('p', { class: 'skm' }, r.keyMessage) : none(ai ? 'Not found' : NOT_READ)));

    var pdesc = h('section', { class: 'card sec desc' }, head('Product description', true),
      editing
        ? (function () { var t = h('textarea', { class: 'f', rows: 5, 'aria-label': 'Product description' }); t.value = d.pdesc; t.addEventListener('input', function () { d.pdesc = t.value; }); return t; })()
        : (r.productDescription ? h('p', { style: 'margin:0;line-height:1.6;white-space:pre-line' }, r.productDescription) : none(ai ? NO_PDESC : NOT_READ)));

    var left = h('div', { style: 'flex:1.15 1 560px' }, skm, pdesc,
      section('Hero claims', true, readList(Dash.items(ai && ai.heroClaims), 'bullets', ai ? 'Not found' : NOT_READ), editing ? editList(d.claims, 'bullets', 'Hero claim') : null),
      section('RTB (reason to believe)', true, readList(Dash.items(ai && ai.rtb), 'bullets', ai ? 'Not found' : NOT_READ), editing ? editList(d.rtb, 'bullets', 'Reason to believe') : null),
      section('How to use', true, readList(Dash.items(ai && ai.howToUse), 'steps', ai ? 'Not found' : NOT_READ), editing ? editList(d.how, 'steps', 'Step') : null));

    var kvRead = ai
      ? h('div', { class: 'kv' },
          h('span', { class: 'k' }, 'Texture'), h('span', null, ai.texture || none('Not found')),
          h('span', { class: 'k' }, 'Finish'), h('span', null, ai.finish || none('Not found')),
          h('span', { class: 'k' }, 'Target skin type'), h('span', null, ai.targetSkin || none('Not found')))
      : none(NOT_READ);
    var kvEdit = editing ? h('div', { class: 'kv', style: 'align-items:center' },
      h('label', { class: 'k', for: 'e-tex' }, 'Texture'), textInput('e-tex', d.texture, function (v) { d.texture = v; }),
      h('label', { class: 'k', for: 'e-fin' }, 'Finish'), textInput('e-fin', d.finish, function (v) { d.finish = v; }),
      h('label', { class: 'k', for: 'e-skin' }, 'Target skin type'), textInput('e-skin', d.skin, function (v) { d.skin = v; })) : null;

    var shadeBox;
    if (!editing) {
      shadeBox = (r.variants || []).length ? h('ul', { class: 'shades' }, r.variants.map(function (s) { return h('li', null, s); })) : none('Not captured');
    } else {
      shadeBox = h('div');
      (function redrawShades(focusLast) {
        shadeBox.textContent = '';
        d.shades.forEach(function (sh, i) {
          var inp = h('input', { class: 'f', type: 'text', value: sh, 'aria-label': 'Shade ' + (i + 1) });
          inp.addEventListener('input', function () { d.shades[i] = inp.value; });
          shadeBox.appendChild(h('div', { class: 'ed' }, inp, h('button', { type: 'button', class: 'x', 'aria-label': 'Remove shade ' + sh, onclick: function () { d.shades.splice(i, 1); redrawShades(); } }, '×')));
        });
        shadeBox.appendChild(h('button', { type: 'button', class: 'add', onclick: function () { d.shades.push(''); redrawShades(true); } }, '+ Add shade'));
        if (focusLast) { var ins = shadeBox.querySelectorAll('input'); if (ins.length) ins[ins.length - 1].focus(); }
      })();
    }

    var notes;
    if (editing) { notes = h('textarea', { class: 'f', rows: 3, 'aria-label': 'Team notes', placeholder: 'Social media strategy, review sentiment, weaknesses…' }); notes.value = d.notes; notes.addEventListener('input', function () { d.notes = notes.value; }); }
    else notes = product.notes ? h('p', { style: 'margin:0;line-height:1.6;white-space:pre-wrap' }, product.notes) : none('No notes yet. Press Edit to add some.');

    var right = h('div', { style: 'flex:1 1 440px' },
      section('Key ingredients', true, readList(Dash.items(ai && ai.keyIngredients), 'ing', ai ? 'Not found' : NOT_READ), editing ? editList(d.ing, 'ing', 'Ingredient') : null),
      section('Product details', true, kvRead, kvEdit),
      h('section', { class: 'card sec' }, head('Shades / variants'), shadeBox),
      h('section', { class: 'card sec' }, head('Team notes'), notes, h('div', { class: 'small', style: 'padding-top:8px' }, 'Notes stay on your side. They are never sent to the AI.')));

    var sw = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(showSrc), 'aria-labelledby': 'srclabel', onclick: async function () {
      showSrc = !showSrc;
      try { await Dash.saveSetting({ showSources: showSrc }); } catch (e) { /* the switch still works for this visit */ }
      draw();
    } }, h('i'));
    app.appendChild(h('div', { class: 'srcrow' }, h('span', { class: 'lbl', id: 'srclabel' }, 'Show slide sources'), sw));
    app.appendChild(h('div', { class: 'cols' }, left, right));

    // raw description
    app.appendChild(h('details', { class: 'card raw' }, h('summary', null, 'Raw description (as written by the seller)'),
      r.description ? h('pre', null, r.description) : h('p', { class: 'none' }, 'No description text found.')));
  }

  async function refresh() {
    var data = await Dash.load();
    var list = Dash.products(data);
    showSrc = data.settings.showSources === true;
    catCounts = {};
    list.forEach(function (p) { if (p.category && p.category !== 'Uncategorised') catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
    product = list.filter(function (p) { return p.key === key; })[0] || null;
    if (!product && !key && list.length) { product = list[0]; key = product.key; }
    draw();
  }

  refresh();
  Dash.watch(function (changes) {
    if (editing) return;                    // never redraw over what is being typed
    if (changes.snapshots || changes.notes) refresh();
  });
})();
