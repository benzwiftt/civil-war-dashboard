(function () {
  'use strict';
  var h = Dash.h;
  Dash.nav('home');

  var state = { main: Dash.getMain(), ing: '', q: '', sug: false };
  var all = [], pool = [], stats = [];

  function plural(name) { return /s$/i.test(name) ? name : name + 's'; }

  // one entry per key ingredient (case-insensitive), with every product that lists it and the function stated for it
  function ingredientStats(list) {
    var m = {};
    list.forEach(function (p) {
      var seen = {};
      Dash.items(p.latest.ai && p.latest.ai.keyIngredients).forEach(function (x) {
        var g = Dash.ing(x.text), name = g.name.replace(/\s+/g, ' ').trim(), k = name.toLowerCase();
        if (!k || seen[k]) return;
        seen[k] = 1;
        (m[k] = m[k] || { name: name, items: [] }).items.push({ p: p, fn: g.fn });
      });
    });
    return Object.keys(m).map(function (k) { return m[k]; })
      .sort(function (a, b) { return b.items.length - a.items.length || (a.name < b.name ? -1 : 1); });
  }
  function findIng(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return null;
    return stats.filter(function (x) { return x.name.toLowerCase() === q; })[0] || stats.filter(function (x) { return x.name.toLowerCase().indexOf(q) >= 0; })[0] || null;
  }

  function landscape(x) {
    var total = pool.length;
    var cats = Dash.categories(pool).map(function (c) {
      return { name: c.name, tot: c.count, n: x.items.filter(function (i) { return i.p.category === c.name; }).length };
    });
    var summary = cats.filter(function (c) { return c.n; }).sort(function (a, b) { return b.n - a.n || (a.name < b.name ? -1 : 1); })
      .map(function (c) { return c.n + ' of ' + c.tot + ' ' + (c.tot === 1 ? c.name : plural(c.name)); }).join(' · ');
    var rows = x.items.slice().sort(function (a, b) {
      return a.p.category < b.p.category ? -1 : a.p.category > b.p.category ? 1 : (a.p.latest.brand || '') < (b.p.latest.brand || '') ? -1 : 1;
    });
    return h('section', { class: 'land', 'aria-live': 'polite' },
      h('div', { class: 'landhead' }, h('h2', null, x.name + ' · Ingredient landscape'),
        h('span', { class: 'small' }, x.items.length + ' of ' + total + ' saved products (' + Math.round(100 * x.items.length / total) + '%)')),
      h('div', null, h('div', { class: 'eyebrow', style: 'margin-bottom:5px' }, 'Adoption'),
        h('div', { style: 'font-weight:700;margin-bottom:8px' }, summary),
        h('div', { class: 'adopt' }, cats.map(function (c) {
          return h('div', { class: 'ad' + (c.n ? '' : ' zero') }, h('div', { class: 'cn' }, c.name), h('div', { class: 'small' }, c.n + ' of ' + c.tot + (c.tot === 1 ? ' product' : ' products')),
            h('div', { class: 'bar2' }, h('i', { style: 'width:' + (c.tot ? Math.round(100 * c.n / c.tot) : 0) + '%' })));
        }))),
      h('div', null, h('div', { class: 'eyebrow', style: 'margin-bottom:2px' }, 'How brands position this active'),
        h('div', { class: 'pos' },
          h('div', { class: 'prow head' }, ['Product', 'Category', 'Claim attributed to ' + x.name].map(function (t) { return h('span', { class: 'eyebrow' }, t); })),
          rows.map(function (i) {
            var r = i.p.latest;
            return h('div', { class: 'prow' },
              h('div', null, h('div', { class: 'eyebrow' }, r.brand || 'Brand not found'),
                h('a', { class: 'plink', href: 'detail.html?p=' + encodeURIComponent(i.p.key) }, r.title)),
              h('div', null, h('span', { class: 'badge' }, i.p.category)),
              h('div', { class: 'fn' }, i.fn ? '“' + x.name + ' ' + i.fn + '”' : h('span', { class: 'none' }, 'No function stated')));
          }))));
  }

  async function render() {
    var data = await Dash.load();
    all = Dash.products(data);
    pool = all.filter(function (p) { return Dash.inMain(p, state.main); });
    stats = ingredientStats(pool);
    var app = document.getElementById('app');
    app.textContent = '';

    app.appendChild(h('div', { class: 'bar' },
      h('div', null, h('h1', null, 'Market radar'), h('div', { class: 'sub' }, 'What competitors launched lately, and what the saved products are made of.')),
      h('a', { class: 'btn primary', href: 'library.html' }, 'Open Product library →')));

    if (!all.length) { app.appendChild(Dash.emptyState()); appendSettings(app, data); return; }

    app.appendChild(h('div', { class: 'row2' }, Dash.mainTabs(all, state.main, function (t) { state.main = t; Dash.setMain(t); state.ing = ''; state.q = ''; render(); })));

    if (!pool.length) {
      app.appendChild(h('div', { class: 'card empty' }, h('div', { class: 't' }, 'No ' + state.main + ' products saved yet'), h('div', { class: 'd' }, 'Pick another main category above, or choose All.')));
      appendSettings(app, data); return;
    }

    var cats = Dash.categoryStats(pool);
    var brands = {};
    pool.forEach(function (p) { if (p.latest.brand) brands[p.latest.brand.toLowerCase()] = 1; });
    var kpi = function (label, value) { return h('div', { class: 'k' }, h('span', { class: 'eyebrow' }, label), h('span', { class: 'n' }, value)); };

    // 1. key numbers, one thin row
    app.appendChild(h('section', { class: 'card kpis', 'aria-label': 'Key numbers' },
      kpi('Products saved', String(pool.length)), kpi('Brands', String(Object.keys(brands).length)),
      kpi('Categories', String(cats.length)), kpi('Last saved', PDP.fmtDate(pool[0].latest.capturedAt))));

    // 2. New Launch radar: marked within the last 28 days, newest first. Older ones leave by themselves.
    var fresh = pool.filter(function (p) { return p.isNew; })
      .sort(function (a, b) { return a.latest.newLaunchMarkedAt < b.latest.newLaunchMarkedAt ? 1 : -1; });
    app.appendChild(h('section', { class: 'card panel' },
      h('div', { class: 'ph' }, h('h2', null, 'New Launch radar'),
        h('span', { class: 'small' }, 'Marked as a new launch in the last 28 days. A product leaves this row by itself after that.')),
      fresh.length
        ? h('div', { class: 'radar' }, fresh.map(function (p) {
            var r = p.latest, pp = Dash.price(r);
            return h('a', { class: 'rcard', href: 'detail.html?p=' + encodeURIComponent(p.key), title: 'Open ' + r.title },
              h('div', { class: 'cv', style: r.images && r.images[0] ? 'background-image:' + Dash.cssUrl(r.images[0]) : '' }),
              h('span', { class: 'tx' },
                h('span', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:1px' }, Dash.newBadge(), h('span', { class: 'eyebrow' }, r.brand || 'Brand not found')),
                h('span', { class: 'nm' }, r.title),
                h('span', { class: 'mt' }, pp.total + ' · ' + Dash.monthYear(r.capturedAt))));
          }))
        : h('div', { class: 'small', style: 'padding:6px 0' }, 'No new launches in the last 28 days. Tick "Mark as New Product Launch" in the side panel when you save one.')));

    // 3. categories
    app.appendChild(h('section', { class: 'card panel' }, h('div', { class: 'ph' }, h('h2', null, 'Categories')),
      h('div', { class: 'catgrid' }, cats.map(function (c) {
        return h('a', { class: 'cat', href: 'library.html#cat=' + encodeURIComponent(c.name) },
          h('div', { class: 'cn' }, c.name), h('div', { class: 'cc' }, Dash.pluralize(c.count, 'product', 'products')),
          h('div', { class: 'eyebrow', style: 'margin-top:6px' }, 'Average price'), h('div', { class: 'ca' }, c.avg));
      }))));

    // 4. top key ingredients + landscape
    app.appendChild(ingredientPanel());
    appendSettings(app, data);
  }

  function ingredientPanel() {
    var top = stats.slice(0, 10);
    var input = h('input', { class: 'input', id: 'ing-q', type: 'text', placeholder: 'Search ingredient / active…', 'aria-label': 'Search ingredient or active', autocomplete: 'off', value: state.q });
    var sugBox = h('div', { class: 'sug', role: 'listbox', hidden: true });
    var clr = h('button', { type: 'button', class: 'clr', 'aria-label': 'Clear search', hidden: !state.q, onclick: function () { state.q = ''; state.ing = ''; input.value = ''; clr.hidden = true; paint(); input.focus(); } }, '×');
    var pills = h('div', { class: 'ingbars' });
    var host = h('div');

    function choose(name) { state.ing = name; state.q = name; input.value = name; clr.hidden = !name; sugBox.hidden = true; paint(); }
    function fillSug() {
      var q = input.value.trim().toLowerCase();
      var m = stats.filter(function (x) { return !q || x.name.toLowerCase().indexOf(q) >= 0; }).slice(0, 6);
      sugBox.textContent = '';
      sugBox.hidden = !state.sug || !m.length;
      m.forEach(function (x) {
        sugBox.appendChild(h('button', { type: 'button', role: 'option', onmousedown: function (e) { e.preventDefault(); choose(x.name); } }, x.name, h('span', { class: 'small' }, x.items.length + (x.items.length === 1 ? ' product' : ' products'))));
      });
    }
    function paint() {
      pills.textContent = '';
      var max = top.length ? top[0].items.length : 1;
      top.forEach(function (x) {
        var on = state.ing && state.ing.toLowerCase() === x.name.toLowerCase(), n = x.items.length;
        pills.appendChild(h('button', { type: 'button', class: 'brow', 'aria-pressed': String(!!on), 'aria-label': x.name + ', ' + n + (n === 1 ? ' product' : ' products'), onclick: function () { choose(on ? '' : x.name); } },
          h('span', { class: 'nm' }, x.name),
          h('span', { class: 'tr' }, h('span', { class: 'fl', style: 'width:' + Math.max(6, Math.round(100 * n / max)) + '%' })),
          h('span', { class: 'ct' }, String(n))));
      });
      host.textContent = '';
      var f = state.ing === '__none__' ? null : findIng(state.ing);
      if (f) host.appendChild(landscape(f));
      else if (state.ing === '__none__') host.appendChild(h('div', { class: 'land' }, h('div', { style: 'font-weight:700' }, 'No saved product lists “' + input.value.trim() + '”.'), h('div', { class: 'small' }, 'Try one of the bars above, or a shorter name.')));
      else if (!stats.length) host.appendChild(h('div', { class: 'land' }, h('div', { class: 'small' }, 'No ingredients yet. Run "Analyze Banners & Description with AI" in the side panel before saving.')));
      else host.appendChild(h('div', { class: 'land' }, h('div', { class: 'small' }, 'Pick a bar above, or type an ingredient, to see how many saved products use it and how each brand positions it.')));
    }
    input.addEventListener('input', function () {
      state.q = input.value; state.sug = true; clr.hidden = !input.value; fillSug();
      var f = findIng(input.value);
      if (input.value.trim().length >= 3 && f) { if (state.ing.toLowerCase() !== f.name.toLowerCase()) { state.ing = f.name; paint(); } }
      else if (!input.value.trim()) { state.ing = ''; paint(); }
    });
    input.addEventListener('focus', function () { state.sug = true; fillSug(); });
    input.addEventListener('blur', function () { setTimeout(function () { state.sug = false; sugBox.hidden = true; }, 120); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var f = findIng(input.value); if (f) choose(f.name); else if (input.value.trim()) { state.ing = '__none__'; sugBox.hidden = true; paint(); } }
      if (e.key === 'Escape') { state.sug = false; sugBox.hidden = true; }
    });
    paint();
    return h('section', { class: 'card panel' },
      h('div', { class: 'ph' }, h('h2', null, 'Top key ingredients')),
      h('div', { class: 'ingtools' }, h('div', { class: 'search' }, h('span', { class: 'ico', 'aria-hidden': 'true' }, '⌕'), input, clr, sugBox)),
      pills, host);
  }

  // the name that appears as "Saved by"
  function appendSettings(app, data) {
    var input = h('input', { class: 'input', id: 'who', type: 'text', value: data.settings.userName || '', placeholder: 'e.g. Bening', style: 'width:220px' });
    input.addEventListener('change', async function () {
      await Dash.saveSetting({ userName: input.value.trim() });
      Dash.toast('Name saved. It is added to products you save from now on.');
    });
    app.appendChild(h('div', { class: 'card settings' },
      h('label', { for: 'who' }, 'Your name (shown as "Saved by")'), input,
      h('span', { class: 'small' }, 'Used on new saves only.'),
      (Dash.inExtension && window.CWStoreCloud) ? h('a', { class: 'small', href: 'migrate.html', style: 'margin-left:auto' }, 'Shared database tools') : null));
  }

  render();
  Dash.watch(function () {
    var a = document.activeElement;
    if (a && (a.id === 'who' || a.id === 'ing-q')) return;   // don't redraw while something is being typed
    render();
  });
})();
