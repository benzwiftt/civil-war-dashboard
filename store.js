/* Civil War - storage layer (v0.11.0).
 * Every read and write of the library (snapshots, notes, settings, saved comparison sets) goes through
 * CWStore. Two adapters keep the same data:
 *   "local": chrome.storage.local (this browser only), exactly as before.
 *   "cloud": Supabase (shared by everyone who opens the website). Chosen automatically on the website,
 *            and in the extension only when CW_CONFIG.useCloud is true.
 * In both, "settings" (Saved by name, last category) stay in this browser: they are personal.
 * NOT handled here on purpose (stay per browser): aiSettings (Gemini key), draftState_<url>.
 *
 * Adapter contract (all async except watch):
 *   load()                              -> { snapshots: [], notes: {}, settings: {} }
 *   addSnapshot(rec, settingsPatch)     -> appends one snapshot, merges settingsPatch into settings
 *   updateLatest(key, mutate, notes)    -> mutate(newestSnapshotOfProduct) in place; notes: string to set/clear, undefined = untouched
 *   deleteProduct(key)                  -> removes every snapshot and the note of a product
 *   saveSetting(patch)                  -> merges patch into settings
 *   getSets() / putSets(array)          -> saved comparison sets
 *   watch(fn)                           -> fn() is called when snapshots, notes or settings change elsewhere
 */
(function (root) {
  'use strict';

  var local = {
    name: 'local',

    load: function () {
      return chrome.storage.local.get({ snapshots: [], notes: {}, settings: {} });
    },

    addSnapshot: async function (rec, settingsPatch) {
      var d = await local.load();
      d.snapshots.push(rec);
      var settings = Object.assign({}, d.settings, settingsPatch || {});
      await chrome.storage.local.set({ snapshots: d.snapshots, settings: settings });
      return rec;
    },

    updateLatest: async function (key, mutate, notes) {
      var d = await local.load();
      var best = null;
      d.snapshots.forEach(function (s) { if (root.PDP.recordKey(s) === key && (!best || s.capturedAt > best.capturedAt)) best = s; });
      if (!best) throw new Error('Product not found in your library');
      mutate(best);
      var out = { snapshots: d.snapshots };
      if (notes !== undefined) { if (String(notes).trim()) d.notes[key] = notes; else delete d.notes[key]; out.notes = d.notes; }
      await chrome.storage.local.set(out);
    },

    deleteProduct: async function (key) {
      var d = await local.load();
      d.snapshots = d.snapshots.filter(function (s) { return root.PDP.recordKey(s) !== key; });
      delete d.notes[key];
      await chrome.storage.local.set({ snapshots: d.snapshots, notes: d.notes });
    },

    saveSetting: async function (patch) {
      var d = await local.load();
      await chrome.storage.local.set({ settings: Object.assign({}, d.settings, patch) });
    },

    // light read for the side panel: category names, when this product was last saved, and personal settings
    hints: async function (key) {
      var d = await local.load(), cats = [], last = '';
      d.snapshots.forEach(function (s) {
        if (s.category) { var i = cats.indexOf(s.category); if (i >= 0) cats.splice(i, 1); cats.push(s.category); }
        if (key && root.PDP.recordKey(s) === key && s.capturedAt && s.capturedAt > last) last = s.capturedAt;
      });
      return { categories: cats, lastCapturedAt: last, settings: d.settings };
    },

    getSets: async function () {
      var g = await chrome.storage.local.get({ compareSets: [] });
      return Array.isArray(g.compareSets) ? g.compareSets : [];
    },

    putSets: async function (arr) {
      await chrome.storage.local.set({ compareSets: arr });
    },

    watch: function (fn) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && (changes.snapshots || changes.notes || changes.settings)) fn(changes);
      });
    }
  };

  // ======================= cloud adapter (Supabase REST, no library needed) =======================
  var hasChrome = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);
  function cfg() { return root.CW_CONFIG || {}; }

  function banner(msg) {                 // a small red-ish bar at the top of the page; only on pages
    try {
      if (typeof document === 'undefined' || !document.body) return;
      var b = document.getElementById('cw-net-banner');
      if (!b) {
        b = document.createElement('div'); b.id = 'cw-net-banner'; b.setAttribute('role', 'alert');
        b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99;background:#8A2E5C;color:#fff;padding:8px 14px;font:600 13px system-ui,sans-serif;text-align:center';
        document.body.appendChild(b);
      }
      b.textContent = msg;
      clearTimeout(banner.t); banner.t = setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 9000);
    } catch (e) { /* ignore */ }
  }

  async function sb(method, path, opts) {
    opts = opts || {};
    var c = cfg(), headers = { apikey: c.supabaseKey }, res;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.prefer) headers.Prefer = opts.prefer;
    try {
      res = await fetch(c.supabaseUrl + '/rest/v1/' + path, { method: method, headers: headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
    } catch (e) {
      banner('Cannot reach the shared database. Check your internet connection and refresh the page.');
      throw new Error('Cannot reach the shared database. Check your internet connection.');
    }
    if (!res.ok) {
      var t = ''; try { t = await res.text(); } catch (e2) { /* ignore */ }
      var msg = 'Shared database error ' + res.status + (t ? ': ' + t.slice(0, 200) : '');
      banner(msg); throw new Error(msg);
    }
    if (opts.raw) return res;
    var txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }
  function enc(v) { return encodeURIComponent(v); }

  async function fetchAll(table, select, order) {         // pages of 1000 rows (the most Supabase returns at once)
    var out = [], size = 1000, off = 0;
    for (;;) {
      var page = await sb('GET', table + '?select=' + enc(select) + (order ? '&order=' + order : '') + '&limit=' + size + '&offset=' + off);
      page = page || []; out = out.concat(page);
      if (page.length < size) break;
      off += size;
    }
    return out;
  }

  // personal settings: chrome.storage.local in the extension (same key as before), localStorage on the website
  async function getLocalSettings() {
    if (hasChrome) { var g = await chrome.storage.local.get({ settings: {} }); return g.settings || {}; }
    try { return JSON.parse(localStorage.getItem('cw_settings') || '{}') || {}; } catch (e) { return {}; }
  }
  async function saveLocalSettings(patch) {
    var next = Object.assign({}, await getLocalSettings(), patch || {});
    if (hasChrome) await chrome.storage.local.set({ settings: next });
    else { try { localStorage.setItem('cw_settings', JSON.stringify(next)); } catch (e) { /* ignore */ } }
  }

  var watchers = [], pollTimer = null, lastSig = null;
  function emit(changes) { watchers.forEach(function (f) { try { f(changes); } catch (e) { /* ignore */ } }); }
  async function signature() {          // newest row id + number of rows: changes when someone saves or deletes
    var res = await sb('GET', 'snapshots?select=id&order=id.desc&limit=1', { raw: true, prefer: 'count=exact' });
    var rows = await res.json(), range = res.headers.get('content-range') || '';
    return (rows && rows[0] ? rows[0].id : 0) + '/' + (range.split('/')[1] || '?');
  }
  async function poll() {
    try {
      if (typeof document !== 'undefined' && document.hidden) return;
      var sig = await signature();
      if (lastSig !== null && sig !== lastSig) { lastSig = sig; emit({ snapshots: {} }); } else lastSig = sig;
    } catch (e) { /* the banner already told the person */ }
  }

  // Banner pictures copied into Supabase Storage: the record keeps the original Shopee addresses (so nothing else changes)
  // plus imageCopy = { pictureId: 1 }. Pages get the copy's address instead, in memory only.
  var PIC_BASE = function () { return cfg().supabaseUrl + '/storage/v1/object/public/banners/file/'; };
  function picUrl(id) { return PIC_BASE() + encodeURIComponent(id); }
  function withCopies(s) {
    var c = s && s.imageCopy;
    if (!c) return s;
    function m(u) { var id = root.PDP.imgKey(u); return c[id] ? picUrl(id) : u; }
    s.images = (s.images || []).map(m); s.descImages = (s.descImages || []).map(m);
    return s;
  }
  function isoOf(x) { var d = new Date(x); return isNaN(d.getTime()) ? String(x || '') : d.toISOString(); }

  var cloud = {
    name: 'cloud',

    load: async function () {
      var r = await Promise.all([fetchAll('snapshots', 'data', 'captured_at.asc,id.asc'), fetchAll('notes', 'product_key,text', ''), getLocalSettings()]);
      var notes = {}; r[1].forEach(function (x) { if (x.text) notes[x.product_key] = x.text; });
      return { snapshots: r[0].map(function (x) { return withCopies(x.data); }), notes: notes, settings: r[2] };
    },

    // light read for the side panel: category names, when this product was last saved, and personal settings
    hints: async function (key) {
      var jobs = [fetchAll('snapshots', 'category:data->>category', 'captured_at.asc,id.asc'), getLocalSettings()];
      if (key) jobs.push(sb('GET', 'snapshots?select=captured_at&product_key=eq.' + enc(key) + '&order=captured_at.desc,id.desc&limit=1'));
      var r = await Promise.all(jobs), cats = [];
      r[0].forEach(function (x) { var c = x.category; if (c) { var i = cats.indexOf(c); if (i >= 0) cats.splice(i, 1); cats.push(c); } });
      return { categories: cats, lastCapturedAt: r[2] && r[2][0] ? isoOf(r[2][0].captured_at) : '', settings: r[1] };
    },

    pictureUrl: picUrl,

    addSnapshot: async function (rec, settingsPatch) {
      await sb('POST', 'snapshots', { body: { product_key: root.PDP.recordKey(rec), captured_at: rec.capturedAt, data: rec }, prefer: 'return=minimal' });
      if (settingsPatch) await saveLocalSettings(settingsPatch);
      lastSig = null; emit({ snapshots: {} });
      return rec;
    },

    updateLatest: async function (key, mutate, notes) {
      var rows = await sb('GET', 'snapshots?select=id,data&product_key=eq.' + enc(key) + '&order=captured_at.desc,id.desc&limit=1');
      if (!rows || !rows.length) throw new Error('Product not found in your library');
      var rec = rows[0].data; mutate(rec);
      await sb('PATCH', 'snapshots?id=eq.' + rows[0].id, { body: { data: rec }, prefer: 'return=minimal' });
      var changes = { snapshots: {} };
      if (notes !== undefined) {
        if (String(notes).trim()) await sb('POST', 'notes?on_conflict=product_key', { body: { product_key: key, text: notes, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
        else await sb('DELETE', 'notes?product_key=eq.' + enc(key));
        changes.notes = {};
      }
      emit(changes);
    },

    deleteProduct: async function (key) {
      await sb('DELETE', 'snapshots?product_key=eq.' + enc(key));
      await sb('DELETE', 'notes?product_key=eq.' + enc(key));
      lastSig = null; emit({ snapshots: {}, notes: {} });
    },

    saveSetting: async function (patch) {
      await saveLocalSettings(patch); emit({ settings: {} });
    },

    getSets: async function () {
      var rows = await fetchAll('compare_sets', 'name,keys,saved_at', 'saved_at.asc');
      return rows.map(function (x) { return { name: x.name, keys: Array.isArray(x.keys) ? x.keys : [], savedAt: x.saved_at }; });
    },

    putSets: async function (arr) {
      var keep = {}; arr.forEach(function (x) { keep[x.name] = 1; });
      var cur = await sb('GET', 'compare_sets?select=name');
      for (var i = 0; i < (cur || []).length; i++) if (!keep[cur[i].name]) await sb('DELETE', 'compare_sets?name=eq.' + enc(cur[i].name));
      if (arr.length) await sb('POST', 'compare_sets?on_conflict=name', { body: arr.map(function (x) { return { name: x.name, keys: x.keys, saved_at: x.savedAt || new Date().toISOString() }; }), prefer: 'resolution=merge-duplicates,return=minimal' });
    },

    watch: function (fn) {            // own changes call fn at once; changes by other people are noticed every 20 seconds
      watchers.push(fn);
      if (!pollTimer && typeof setInterval !== 'undefined') {
        poll(); pollTimer = setInterval(poll, 20000);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
      }
    },

    // used by dashboard/migrate.html only
    raw: { sb: sb, fetchAll: fetchAll, enc: enc }
  };

  var cloudReady = !!(cfg().supabaseUrl && cfg().supabaseKey);
  var useCloud = cloudReady && (!hasChrome || cfg().useCloud === true);
  root.CWStoreLocal = hasChrome ? local : null;
  root.CWStoreCloud = cloudReady ? cloud : null;
  root.CWStore = useCloud ? cloud : local;
})(typeof self !== 'undefined' ? self : this);
