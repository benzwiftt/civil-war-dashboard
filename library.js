(function () {
  'use strict';
  var h = Dash.h;
  Dash.nav('library');

  var state = { main: Dash.getMain(), cat: 'All', q: '', sort: 'latest' };
  var m = location.hash.match(/cat=([^&]+)/);
  if (m) { try { state.cat = decodeURIComponent(m[1]); } catch (e) { /* ignore */ } }
  var mq = location.hash.match(/q=([^&]+)/);
  if (mq) { try { state.q = decodeURIComponent(mq[1]); } catch (e) { /* ignore */ } }

  var products = [];
  var MAX_CMP = 10, SEL_KEY = 'cw_lib_sel';      // the ticked products live for this browser tab only
  function loadSel() { try { var v = JSON.parse(sessionStorage.getItem(SEL_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  var picked = loadSel();
  function saveSel() { try { sessionStorage.setItem(SEL_KEY, JSON.stringify(picked)); } catch (e) { /* ignore */ } }
  function toggle(key) {
    var at = picked.indexOf(key);
    if (at >= 0) picked.splice(at, 1); else if (picked.length < MAX_CMP) picked.push(key);
    saveSel(); draw();
  }
  // floating bar at the bottom of the screen; lives outside #app so a redraw of the list does not flicker it
  function drawBar() {
    var old = document.getElementById('selbar'); if (old) old.remove();
    if (!picked.length) return;
    var n = picked.length, ok = n >= 2;
    document.body.appendChild(h('div', { class: 'selbar', id: 'selbar', role: 'region', 'aria-label': 'Selected products' },
      h('span', null, h('b', null, String(n)), n === 1 ? ' product selected' : ' products selected', ' · ', n >= MAX_CMP ? h('span', { class: 'hint' }, 'maximum ' + MAX_CMP) : (ok ? h('span', { class: 'hint' }, 'max ' + MAX_CMP) : h('span', { class: 'hint' }, 'tick at least 1 more'))),
      h('button', { type: 'button', class: 'go', disabled: ok ? null : true, onclick: function () {
        try { sessionStorage.setItem('cw_compare_sel', JSON.stringify(picked)); } catch (e) { /* ignore */ }
        location.href = 'compare.html';
      } }, 'Compare now →'),
      h('button', { type: 'button', class: 'clr', onclick: function () { picked = []; saveSel(); draw(); } }, 'Clear')));
  }

  function aiTexts(r) {
    var ai = r.ai || {};
    var out = [];
    [['Claim', ai.heroClaims], ['RTB', ai.rtb], ['Ingredient', ai.keyIngredients], ['How to use', ai.howToUse]].forEach(function (g) {
      (g[1] || []).forEach(function (x) { var t = Dash.text(x); if (t) out.push({ kind: g[0], text: t }); });
    });
    if (r.keyMessage) out.push({ kind: 'Key message', text: r.keyMessage });
    return out;
  }

  // search covers brand, product, category, shop, shades, key message, claims, RTB and ingredients
  function match(p) {
    if (!Dash.inMain(p, state.main)) return null;
    if (state.cat === 'New Launch' && !p.isNew) return null;
    if (state.cat !== 'All' && state.cat !== 'New Launch' && p.category !== state.cat) return null;
    if (!state.q) return { hit: '' };
    var q = state.q.toLowerCase(), r = p.latest;
    var basic = [r.title, r.brand, p.category, r.shopName, (r.variants || []).join(' ')].join(' ').toLowerCase();
    if (basic.indexOf(q) >= 0) return { hit: '' };
    var found = aiTexts(r).filter(function (x) { return x.text.toLowerCase().indexOf(q) >= 0; })[0];
    return found ? { hit: found.kind + ': ' + found.text } : null;
  }

  function sorted(list) {
    var l = list.slice();
    if (state.sort === 'price') l.sort(function (a, b) { return (a.latest.price || Infinity) - (b.latest.price || Infinity); });
    else if (state.sort === 'ppu') l.sort(function (a, b) { var x = Dash.price(a.latest).perUnit, y = Dash.price(b.latest).perUnit; return (x === null ? Infinity : x) - (y === null ? Infinity : y); });
    return l;
  }

  function rowFor(p, hit) {
    var r = p.latest, pp = Dash.price(r);
    var on = picked.indexOf(p.key) >= 0, off = !on && picked.length >= MAX_CMP;
    var cb = h('input', { type: 'checkbox', 'aria-label': 'Select ' + (r.brand ? r.brand + ' ' : '') + r.title + ' to compare', checked: on ? true : null, disabled: off ? true : null });
    cb.addEventListener('change', function () { toggle(p.key); });
    var row = h('a', { class: 'lrow', href: 'detail.html?p=' + encodeURIComponent(p.key), title: 'Open ' + r.title },
      h('div', { class: 'th', style: r.images && r.images[0] ? 'background-image:' + Dash.cssUrl(r.images[0]) : '' }),
      h('div', { class: 'mid' },
        h('div', { class: 'top' }, h('span', { class: 'eyebrow' }, r.brand || 'Brand not found'), h('span', { class: 'badge' }, p.category), p.isNew ? Dash.newBadge() : null),
        h('div', { class: 'nm' }, r.title),
        hit ? h('div', { class: 'hit' }, 'Matches ' + hit) : null),
      h('div', null, h('span', { class: 'small' }, r.netto ? r.netto.text : '—')),
      h('div', { class: 'price' }, h('b', null, pp.total), h('span', null, pp.ppu)),
      h('div', { class: 'small' }, (r.variants || []).length ? Dash.pluralize(r.variants.length, 'shade', 'shades') : '—'),
      h('span', { class: 'go' }, 'View details'));
    return h('div', { class: 'lline' + (on ? ' on' : '') }, h('label', { class: 'lck', title: off ? 'Maximum ' + MAX_CMP + ' products to compare' : 'Select to compare' }, cb), row);
  }

  function exportCsv(list) {
    var rows = list.map(function (p) { return PDP.recordToCsvRow(Object.assign({}, p.latest, { category: p.category }), p.notes); });
    Dash.saveFile('Product library ' + Dash.today() + '.csv', PDP.toCsv(PDP.CSV_COLUMNS, rows));
  }

  function draw() {
    var app = document.getElementById('app');
    var typing = document.activeElement && document.activeElement.id === 'q';
    var caret = typing ? document.activeElement.selectionStart : 0;
    app.textContent = '';

    var shown = [];
    products.forEach(function (p) { var mt = match(p); if (mt) shown.push({ p: p, hit: mt.hit }); });
    var byKey = {}; shown.forEach(function (s) { byKey[s.p.key] = s.hit; });
    var ordered = sorted(shown.map(function (s) { return s.p; }));

    var search = h('input', { class: 'input', id: 'q', type: 'search', placeholder: 'Search brand, product, claim or ingredient', 'aria-label': 'Search brand, product, claim or ingredient', value: state.q, style: 'width:340px' });
    search.addEventListener('input', function () { state.q = search.value; draw(); });
    var sort = h('select', { class: 'select', 'aria-label': 'Sort products', onchange: function (e) { state.sort = e.target.value; draw(); } },
      [['latest', 'Latest saved'], ['price', 'Price, low to high'], ['ppu', 'Price per ml/g, low to high']].map(function (o) { return h('option', { value: o[0], selected: state.sort === o[0] ? true : null }, o[1]); }));

    app.appendChild(h('div', { class: 'bar' },
      h('div', null, h('h1', null, 'Product library'), h('div', { class: 'sub' }, Dash.pluralize(ordered.length, 'product', 'products') + ' · saved on this computer. Click a row to open the product.')),
      h('div', { class: 'tools' }, search, sort,
        h('button', { type: 'button', class: 'btn', onclick: function () { exportCsv(ordered); } }, 'Download as Excel (CSV)'))));

    var inMain = products.filter(function (p) { return Dash.inMain(p, state.main); });
    var cats = Dash.categories(inMain);
    var newCount = inMain.filter(function (p) { return p.isNew; }).length;
    var pillData = [{ name: 'All', label: 'All (' + inMain.length + ')' }];
    if (newCount) pillData.push({ name: 'New Launch', label: 'New Launch (' + newCount + ')' });
    cats.forEach(function (c) { pillData.push({ name: c.name, label: c.name + ' (' + c.count + ')' }); });
    app.appendChild(h('div', { class: 'row2' }, Dash.mainTabs(products, state.main, function (t) { state.main = t; Dash.setMain(t); state.cat = 'All'; draw(); })));
    app.appendChild(h('div', { class: 'pills', role: 'group', 'aria-label': 'Filter by category' }, pillData.map(function (c) {
      return h('button', { type: 'button', class: 'pill', 'aria-pressed': String(state.cat === c.name), onclick: function () { state.cat = c.name; draw(); } }, c.label);
    })));

    if (!products.length) app.appendChild(Dash.emptyState());
    else if (!ordered.length) app.appendChild(h('div', { class: 'card empty' }, h('div', { class: 't' }, 'No products match'), h('div', { class: 'd' }, 'Try another category or clear the search.')));
    else app.appendChild(h('div', { class: 'list' }, ordered.map(function (p) { return rowFor(p, byKey[p.key]); })));

    if (picked.length) app.appendChild(h('div', { style: 'height:56px', 'aria-hidden': 'true' }));
    app.appendChild(h('div', { class: 'msg' }, 'The NEW LAUNCH badge shows for 28 days after you tick "Mark as New Product Launch" in the side panel, then it disappears by itself. To compare products, open Compare product from the menu.'));

    drawBar();
    if (typing) { var q = document.getElementById('q'); q.focus(); try { q.setSelectionRange(caret, caret); } catch (e) { /* ignore */ } }
  }

  async function refresh() {
    var data = await Dash.load();
    products = Dash.products(data);
    var have = products.map(function (p) { return p.key; });
    picked = picked.filter(function (k) { return have.indexOf(k) >= 0; }).slice(0, MAX_CMP); saveSel();     // a deleted product leaves the selection
    var pool = products.filter(function (p) { return Dash.inMain(p, state.main); });
    if (state.cat !== 'All' && state.cat !== 'New Launch' && !pool.some(function (p) { return p.category === state.cat; })) state.cat = 'All';
    if (state.cat === 'New Launch' && !pool.some(function (p) { return p.isNew; })) state.cat = 'All';
    draw();
  }

  refresh();
  Dash.watch(function (changes) {
    if (changes.snapshots || changes.settings) refresh();   // notes-only changes don't need a redraw
  });
})();
