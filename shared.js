/* Civil War - shared logic (no browser APIs here, so it can be tested in Node).
 * Loaded by: content script, service worker (importScripts), dashboard pages, side panel, tests.
 */
(function (root) {
  'use strict';

  var IMG_BASE = 'https://down-id.img.susercontent.com/file/';

  // ---------- small helpers ----------
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function str(v) { return typeof v === 'string' ? v.trim() : ''; }
  function num(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
    return null;
  }

  // ---------- URL ids ----------
  // Shopee product links: /Some-Name-i.<shopId>.<itemId>  or  /product/<shopId>/<itemId>
  function parseProductUrl(href) {
    var u;
    try { u = new URL(href); } catch (e) { return null; }
    if (!/(^|\.)shopee\.co\.id$/.test(u.hostname)) return null;
    var m = u.pathname.match(/-i\.(\d+)\.(\d+)/);
    if (!m) m = u.pathname.match(/\/product\/(\d+)\/(\d+)/);
    if (!m) return null;
    return { shopId: m[1], itemId: m[2], url: u.origin + u.pathname };
  }

  // ---------- images ----------
  // Turn a hash or URL into the full-size image URL (no _tn / @resize suffixes).
  function fullImageUrl(h) {
    h = str(h);
    if (!h) return '';
    var url = /^https?:\/\//i.test(h) ? h : IMG_BASE + h.replace(/^\/+/, '');
    url = url.replace(/@resize[^\/?#]*/i, '').replace(/_tn(\.\w+)?(?=$|[?#])/i, '');
    return url;
  }

  // the picture's own id (same picture at different sizes/extensions = same id)
  function imgKey(u) {
    u = str(u);
    var m = u.match(/\/file\/([^\/?#@]+)/);
    return (m ? m[1] : u).replace(/\.(jpe?g|png|webp|gif)$/i, '').replace(/_tn$/i, '').toLowerCase();
  }

  // ---------- netto ----------
  var NETTO_RE = /(\d{1,4}(?:[.,]\d{1,2})?)\s*(ml|milliliter|millilitre|gram|gr|g|kg|liter|litre|l|oz|fl\.?\s?oz)\b/gi;

  function normUnit(u) {
    u = u.toLowerCase().replace(/\s|\./g, '');
    if (u === 'milliliter' || u === 'millilitre') return 'ml';
    if (u === 'gram' || u === 'gr') return 'g';
    if (u === 'liter' || u === 'litre') return 'l';
    if (u === 'floz') return 'fl oz';
    return u;
  }

  // Look through texts in order (title first) and return the first plausible size.
  function guessNetto(texts) {
    for (var i = 0; i < texts.length; i++) {
      var t = str(texts[i]);
      if (!t) continue;
      NETTO_RE.lastIndex = 0;
      var m;
      while ((m = NETTO_RE.exec(t)) !== null) {
        var value = parseFloat(m[1].replace(',', '.'));
        var unit = normUnit(m[2]);
        if (!isFinite(value) || value <= 0) continue;
        // ignore things like "SPF 35 g"? unlikely; ignore absurd sizes
        if ((unit === 'ml' || unit === 'g') && value > 5000) continue;
        return { value: value, unit: unit, text: trimNum(value) + ' ' + unit };
      }
    }
    return null;
  }
  function trimNum(n) { return String(Math.round(n * 100) / 100); }

  // Price per ml or g (only when the unit is known and comparable). Returns number or null.
  function pricePerUnit(price, netto) {
    if (!netto || !price || !(price > 0) || !isFinite(netto.value) || !(netto.value > 0)) return null;
    var v = netto.value, u = netto.unit;
    if (u === 'kg' || u === 'l') { v = v * 1000; u = u === 'kg' ? 'g' : 'ml'; }
    if (u !== 'ml' && u !== 'g') return null; // oz is ambiguous (weight or fluid), skip
    return { perUnit: price / v, unit: u };
  }

  // ---------- parsing Shopee's own data ----------
  function toRupiah(v) {
    var n = num(v);
    if (n === null || n <= 0) return null;
    // Shopee sends money as rupiah x 100000
    return n >= 100000 ? Math.round(n / 100000) : n;
  }

  var VARIANT_KEYS = ['tier_variations', 'tier_variation', 'models', 'model', 'variations', 'options', 'option_list', 'variants', 'sku_list', 'skus'];

  // Find the "item" object: has a title/name and a list of images. Breadth-first so the
  // shallowest (main product) object wins.
  function findItem(root_) {
    var queue = [root_], seen = 0;
    var best = null;
    while (queue.length && seen < 5000) {
      var cur = queue.shift(); seen++;
      if (Array.isArray(cur)) { for (var a = 0; a < cur.length; a++) if (cur[a] && typeof cur[a] === 'object') queue.push(cur[a]); continue; }
      if (!isObj(cur)) continue;
      var title = str(cur.title) || str(cur.name);
      var imgs = cur.images || cur.image_list || cur.imageList;
      if (title && Array.isArray(imgs) && imgs.length) {
        // prefer objects that look like a product (have an item id or price)
        var score = (cur.item_id || cur.itemid ? 2 : 0) + (cur.price !== undefined || cur.price_min !== undefined ? 1 : 0);
        if (!best || score > best.score) best = { obj: cur, score: score };
        if (score >= 3) break;
      }
      for (var k in cur) {
        if (VARIANT_KEYS.indexOf(k) >= 0) continue; // shade / size options have a name and images too: skip them
        if (Object.prototype.hasOwnProperty.call(cur, k) && cur[k] && typeof cur[k] === 'object') queue.push(cur[k]);
      }
    }
    return best ? best.obj : null;
  }

  // first value found for a key anywhere in the tree (shallow first)
  function deepFind(root_, keys, test) {
    var queue = [root_], seen = 0;
    while (queue.length && seen < 5000) {
      var cur = queue.shift(); seen++;
      if (Array.isArray(cur)) { for (var a = 0; a < cur.length; a++) if (cur[a] && typeof cur[a] === 'object') queue.push(cur[a]); continue; }
      if (!isObj(cur)) continue;
      for (var i = 0; i < keys.length; i++) {
        if (cur[keys[i]] !== undefined && cur[keys[i]] !== null && (!test || test(cur[keys[i]]))) return cur[keys[i]];
      }
      for (var k in cur) {
        if (Object.prototype.hasOwnProperty.call(cur, k) && cur[k] && typeof cur[k] === 'object') queue.push(cur[k]);
      }
    }
    return undefined;
  }

  function attrValue(attrs, names) {
    if (!Array.isArray(attrs)) return '';
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i];
      if (!isObj(a)) continue;
      var n = str(a.name).toLowerCase();
      if (names.indexOf(n) >= 0) return str(a.value) || (Array.isArray(a.values) ? a.values.map(str).join(', ') : '');
    }
    return '';
  }

  // Returns a record (without category/dates) or null when title + images can't be found.
  function parseShopeeResponse(json) {
    if (!isObj(json) && !Array.isArray(json)) return null;
    var item = findItem(json);
    if (!item) return null;

    var itemId = String(item.item_id || item.itemid || deepFind(json, ['item_id', 'itemid']) || '');
    var shopId = String(item.shop_id || item.shopid || deepFind(json, ['shop_id', 'shopid']) || '');

    var images = [];
    (item.images || item.image_list || item.imageList || []).forEach(function (h) {
      var u = fullImageUrl(isObj(h) ? (h.image || h.url || h.hash) : h);
      if (u && images.indexOf(u) < 0) images.push(u);
    });
    if (!images.length && item.image) images.push(fullImageUrl(item.image));

    var title = str(item.title) || str(item.name);
    var attrs = item.attributes || deepFind(json, ['attributes'], Array.isArray);

    var brand = str(item.brand);
    if (!brand || /^(no ?brand|tanpa merek|0)$/i.test(brand)) {
      brand = attrValue(attrs, ['brand', 'merek']) || brand;
    }
    if (/^(no ?brand|tanpa merek|0)$/i.test(brand)) brand = '';

    // price: try the item, then the "product_price" block
    var price = toRupiah(item.price_min) || toRupiah(item.price);
    if (!price) {
      var pp = deepFind(json, ['product_price'], isObj);
      if (pp) price = toRupiah(deepFind(pp, ['single_value', 'price_min', 'price'], function (v) { return num(v) !== null; }));
    }
    var priceBefore = toRupiah(item.price_min_before_discount) || toRupiah(item.price_before_discount);
    if (!priceBefore) {
      var pp2 = deepFind(json, ['product_price'], isObj);
      if (pp2) priceBefore = toRupiah(deepFind(pp2, ['strikethrough_price', 'price_before_discount'], function (v) { return num(v) !== null; }));
    }
    if (priceBefore && price && priceBefore <= price) priceBefore = null;

    // shop
    var shopObj = deepFind(json, ['shop_detailed', 'shop_info', 'shop'], isObj) || {};
    var shopName = str(shopObj.name) || str(shopObj.shop_name) || str(item.shop_name) || str(deepFind(json, ['shop_name']));
    var isOfficial = !!(shopObj.is_official_shop || item.is_official_shop || item.shopee_verified || shopObj.shopee_verified);

    // rating + sold
    var rating = null, ratingCount = null;
    var ir = item.item_rating;
    if (isObj(ir)) {
      rating = num(ir.rating_star);
      ratingCount = Array.isArray(ir.rating_count) ? num(ir.rating_count[0]) : num(ir.rating_count);
    }
    if (rating === null) rating = num(deepFind(json, ['rating_star'], function (v) { return num(v) !== null; }));
    if (ratingCount === null) ratingCount = num(item.cmt_count);
    if (rating !== null) rating = Math.round(rating * 10) / 10;

    var sold = num(item.historical_sold);
    if (sold === null) sold = num(item.sold);
    if (sold === null) sold = num(deepFind(json, ['historical_sold'], function (v) { return num(v) !== null; }));

    // description (can be in item or elsewhere in the response)
    var description = str(item.description);
    if (!description) description = str(deepFind(json, ['description'], function (v) { return typeof v === 'string' && v.trim().length > 0; }));

    // netto: title first, then attributes, then variant names
    var texts = [title, attrValue(attrs, ['volume', 'berat bersih', 'isi', 'ukuran', 'netto', 'berat', 'net weight', 'volume bersih'])];
    if (Array.isArray(item.models)) item.models.forEach(function (m) { if (isObj(m)) texts.push(str(m.name)); });
    if (Array.isArray(item.tier_variations)) item.tier_variations.forEach(function (t) { if (isObj(t) && Array.isArray(t.options)) texts.push(t.options.map(str).join(' | ')); });
    var netto = guessNetto(texts);

    // shade / variant names: first the variant group that lists names (e.g. "00 Milkshake"), else model names
    var variants = [];
    function addV(v) { v = str(v); if (v && variants.indexOf(v) < 0) variants.push(v); }
    if (Array.isArray(item.tier_variations)) item.tier_variations.forEach(function (t) { if (isObj(t) && Array.isArray(t.options)) t.options.forEach(addV); });
    if (!variants.length && Array.isArray(item.models)) item.models.forEach(function (m) { if (isObj(m)) addV(m.name); });

    return {
      itemId: itemId,
      shopId: shopId,
      title: title,
      brand: brand,
      netto: netto,
      price: price,
      priceBefore: priceBefore,
      shopName: shopName,
      isOfficial: isOfficial,
      rating: rating,
      ratingCount: ratingCount,
      sold: sold,
      description: description,
      images: images,
      descImages: [],
      variants: variants
    };
  }


  // ---------- inferring brand / category / netto from the title ----------
  var PROMO_RE = /(new|launch|promo|diskon|sale|ready|stock|bpom|gratis|free|hot|best|termurah|ori\b|original|official|cod\b|bundle|hadiah|flash|paket|murah|grosir|%|special|spesial|limited|viral|terlaris|cashback|voucher|hemat|bonus|terbaru|exclusive|eksklusif|garansi|pre.?order|\bpo\b)/i;
  var PRODUCT_WORDS = /^(bedak|setting|fixing|cushion|lipstik|lipstick|lip|serum|sunscreen|sunblock|foundation|concealer|primer|blush|blush-on|bronzer|powder|loose|pressed|mascara|eyeliner|eyeshadow|toner|moisturizer|pelembab|cleanser|masker|mask|sabun|facial|face|micellar|makeup|make-up|kuas|sponge|spons|paket|set|original|promo|new|hot|free|gratis|\d+)$/i;

  function squash(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function shopBase(shop) {
    return String(shop || '').replace(/\b(official\s*(shop|store)?|flagship\s*(store)?|store|shop|indonesia|resmi|mall|id)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  }

  function stripLeadingTags(t) {
    var tags = [], m, re = /^\s*[\[\(【]([^\]\)】]*)[\]\)】]\s*/;
    t = String(t || '');
    while ((m = t.match(re)) !== null) { tags.push(m[1].trim()); t = t.slice(m[0].length); }
    return { rest: t.trim(), tags: tags };
  }

  // "[New Launch!]Glad2Glow Perfect Blur & Cover Loose Powder 20g | Bedak ..." + shop "Glad2Glow Official Shop" -> "Glad2Glow"
  function inferBrand(title, shopName) {
    if (!str(title)) return '';
    var s = stripLeadingTags(title);
    var main = s.rest.split('|')[0].trim();
    var tokens = main.split(/\s+/).filter(Boolean);
    var base = squash(shopBase(shopName));
    if (base.length >= 3) {
      for (var i = 0; i < tokens.length && i < 8; i++) {
        for (var n = 1; n <= 3 && i + n <= tokens.length; n++) {
          if (squash(tokens.slice(i, i + n).join(' ')) === base) return tokens.slice(i, i + n).join(' ');
        }
      }
    }
    var tagBrand = s.tags.filter(function (t) { return t && t.length <= 30 && !PROMO_RE.test(t); })[0];
    if (tagBrand) return tagBrand;
    var first = (tokens[0] || '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (first && /[A-Za-z]/.test(first) && !PRODUCT_WORDS.test(first)) return first;
    return '';
  }

  // most specific first
  var CATEGORY_RULES = [
    ['Body Lotion', /body\s*(lotion|butter|cream|serum)|hand\s*(and|&)?\s*body|handbody|hand\s*cream/],
    ['Body Wash', /body\s*wash|shower\s*(gel|cream)|sabun\s*mandi|body\s*scrub|\bscrub\b.*body/],
    ['Shampoo', /shampoo|sampo\b/],
    ['Conditioner', /conditioner|kondisioner|hair\s*mask|hair\s*serum|hair\s*(oil|tonic|vitamin)/],
    ['Deodorant', /deodorant|deodoran|roll\s*on|antiperspirant/],
    ['Perfume', /perfume|parfum|eau\s*de|body\s*mist|cologne/],
    ['Loose Powder', /loose\s*powder|bedak\s*tabur|powder\s*tabur/],
    ['Pressed Powder', /pressed\s*powder|compact\s*powder|bedak\s*padat|two\s*way\s*cake|\btwc\b/],
    ['Setting Spray', /setting\s*(spray|mist)|fixing\s*(spray|mist)|make\s?-?up\s*(setting|fixing)\s*spray|face\s*mist\s*setting/],
    ['Cushion', /cushion/],
    ['BB Cream', /\bbb\s*cream\b/],
    ['CC Cream', /\bcc\s*cream\b/],
    ['Foundation', /foundation|skin\s*tint/],
    ['Concealer', /concealer|korektor/],
    ['Primer', /\bprimer\b|make\s?-?up\s*base/],
    ['Sunscreen', /sunscreen|sun\s*screen|sunblock|sun\s*block|tabir\s*surya|\bspf\s*\d+.*(gel|cream|serum|lotion)/],
    ['Lip Tint', /lip\s*tint/],
    ['Lip Cream', /lip\s*cream|lip\s*velvet|lip\s*mousse|lip\s*cloud/],
    ['Lip Serum', /lip\s*serum|lip\s*oil/],
    ['Lip Gloss', /lip\s*gloss/],
    ['Lip Liner', /lip\s*liner|lip\s*pencil/],
    ['Lip Balm', /lip\s*balm|lip\s*care|lip\s*mask/],
    ['Lipstick', /lipstick|lipstik/],
    ['Blush', /blush|perona\s*pipi|cheek\s*tint/],
    ['Bronzer', /bronzer/],
    ['Highlighter', /highlighter|highlight\b/],
    ['Contour', /contour/],
    ['Eyeshadow', /eye\s*shadow|eyeshadow/],
    ['Eyeliner', /eye\s*liner|eyeliner/],
    ['Mascara', /mascara/],
    ['Eyebrow', /eyebrow|eye\s*brow|pensil\s*alis|brow\s*(pencil|gel)/],
    ['Makeup Remover', /make\s?-?up\s*remover|cleansing\s*(oil|balm)|micellar/],
    ['Cleanser', /cleanser|face\s*wash|facial\s*wash|sabun\s*(muka|wajah)|facial\s*foam/],
    ['Toner', /\btoner\b|essence\s*water/],
    ['Serum', /\bserum\b|ampoule/],
    ['Moisturizer', /moisturi[sz]er|pelembab|gel\s*cream|face\s*cream|night\s*cream|day\s*cream/],
    ['Mask', /sheet\s*mask|face\s*mask|masker/],
    ['Makeup Tools', /sponge|spons|brush|kuas|puff/],
    ['Powder', /\bpowder\b|bedak/]
  ];
  // Parent group of a product category: Skincare, Decorative (makeup) or Personal Care. '' when unknown.
  var MAIN_CATEGORIES = ['Skincare', 'Decorative', 'Personal Care'];
  var MAIN_OF = {
    'Skincare': ['Sunscreen', 'Cleanser', 'Toner', 'Serum', 'Moisturizer', 'Mask', 'Makeup Remover', 'Lip Balm'],
    'Decorative': ['Loose Powder', 'Pressed Powder', 'Powder', 'Setting Spray', 'Cushion', 'BB Cream', 'CC Cream', 'Foundation', 'Concealer', 'Primer', 'Lip Tint', 'Lip Cream',
      'Lip Serum', 'Lip Gloss', 'Lip Liner', 'Lipstick', 'Blush', 'Bronzer', 'Highlighter', 'Contour', 'Eyeshadow', 'Eyeliner', 'Mascara', 'Eyebrow', 'Makeup Tools'],
    'Personal Care': ['Body Lotion', 'Body Wash', 'Shampoo', 'Conditioner', 'Deodorant', 'Perfume']
  };
  function mainCategoryFor(category) {
    var c = str(category).toLowerCase().trim();
    if (!c) return '';
    for (var k = 0; k < MAIN_CATEGORIES.length; k++) {
      var list = MAIN_OF[MAIN_CATEGORIES[k]];
      for (var i = 0; i < list.length; i++) if (list[i].toLowerCase() === c) return MAIN_CATEGORIES[k];
    }
    if (/hair|body|shampoo|deodor|parfum|perfume/.test(c)) return 'Personal Care';
    if (/lip|eye|brow|cheek|blush|powder|cushion|foundation|concealer|makeup|make-up|primer|spray/.test(c)) return 'Decorative';
    if (/skin|serum|toner|cream|lotion|mask|sun|cleans|moistur|essence|ampoule|face/.test(c)) return 'Skincare';
    return '';
  }
  function cleanMainCategory(v) {
    var t = str(v).toLowerCase().replace(/[^a-z]/g, '');
    for (var k = 0; k < MAIN_CATEGORIES.length; k++) if (MAIN_CATEGORIES[k].toLowerCase().replace(/[^a-z]/g, '') === t) return MAIN_CATEGORIES[k];
    return '';
  }
  function detectCategory(title, description) {
    var texts = [str(title).toLowerCase(), str(description).toLowerCase().slice(0, 400)];
    for (var t = 0; t < texts.length; t++) {
      if (!texts[t]) continue;
      for (var i = 0; i < CATEGORY_RULES.length; i++) if (CATEGORY_RULES[i][1].test(texts[t])) return CATEGORY_RULES[i][0];
    }
    return '';
  }

  // one call for the scanner: fills only what is missing
  function inferFields(rec) {
    var out = {};
    out.brand = rec.brand || inferBrand(rec.title, rec.shopName);
    out.netto = rec.netto || guessNetto([rec.title, rec.description]);
    out.suggestedCategory = detectCategory(rec.title, rec.description);
    out.suggestedMainCategory = mainCategoryFor(out.suggestedCategory);
    out.inferred = { brand: !rec.brand && !!out.brand, netto: !rec.netto && !!out.netto, category: !!out.suggestedCategory };
    return out;
  }


  // ---------- clean product name: core name only (no promo tags, brand, volume, SEO tagline) ----------
  // "[New Launch!] Glad2Glow Perfect Blur & Cover Loose Powder 20g | Bedak Tabur..." -> "Perfect Blur & Cover Loose Powder"
  // "The Originote Hyaluberry Lip Serum SPF 50 PA+++ Glossy & Plumpy Lips 7 ml - Melembabkan..." -> "Hyaluberry Lip Serum"
  var NAME_PROMO_WORD = /^(new|launch|promo|hot|sale|bpom|original|ori|official|terbaru|viral|best\s*seller|bestseller|ready|stock|free|gratis|flash|murah|termurah|cod)$/i;
  var NAME_TAGS = /^\s*(?:[\[\(\{【][^\]\)\}】]{1,30}[\]\)\}】]\s*)+/;
  var NAME_CUT = [
    /\s*[|‖~•·]/,                              // "...Powder 20g | Bedak Tabur"
    /\s+[-–—]\s+/,                             // "...Lips 7 ml - Melembabkan"
    /\s*[–—]\s*\S/,                           // long dashes glued to words
    /\s+\/\s+/,
    /\bSPF\s*\d+/i, /\bPA\s*\+{1,4}/i,           // sun-protection claims come after the name
    /\b\d+(?:[.,]\d+)?\s*(?:ml|g|gr|gram|oz|l|kg|mg|fl\.?\s*oz)\b/i,   // volume / netto
    /\b\d+\s*(?:pcs|pc|pack|pak|buah|sachet)\b/i,
    /\bisi\s*\d/i, /\bnetto\b/i
  ];
  function escRe(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function cleanProductName(title, brand) {
    var t = String(title || '').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    var prev;
    do { prev = t; t = t.replace(NAME_TAGS, ''); } while (t !== prev);                 // [HOT SALE!] [New Launch!] [BPOM]
    t = t.replace(/\(([^)]*)\)/g, function (m, inner) { return (PROMO_RE.test(inner) || /\d\s*(ml|g|gr)\b/i.test(inner)) ? ' ' : m; }).replace(/\s+/g, ' ').trim();
    var original = t;
    var b = String(brand || '').trim();
    if (b.length >= 2) {                                                                // brand has its own field
      t = t.replace(new RegExp('^\\s*' + escRe(b).replace(/\\ /g, '\\s*') + '\\b[\\s:\\-–]*', 'i'), '');
      t = t.replace(/^(?:official\s*(?:store|shop)?|by)\s+/i, '');
    }
    var cut = t.length;
    NAME_CUT.forEach(function (re) { var m = re.exec(t); if (m && m.index > 0 && m.index < cut) cut = m.index; });
    t = t.slice(0, cut);
    var words = t.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    while (words.length && NAME_PROMO_WORD.test(words[0].replace(/[^A-Za-z!]/g, ''))) words.shift();
    while (words.length && (NAME_PROMO_WORD.test(words[words.length - 1].replace(/[^A-Za-z]/g, '')) || /^[&+,\-–:;.\/]+$|^(dan|with|untuk|and|by)$/i.test(words[words.length - 1]))) words.pop();
    t = words.join(' ').replace(/[\s,;:&+\-–]+$/, '').replace(/^[\s,;:\-–]+/, '').trim();
    if (t.length < 3) t = original.split(/\s*[|‖]/)[0].trim();                          // never return an empty name
    return t;
  }

  // ---------- shades vs bundles ----------
  // "[TOP1] 01 Lychee" -> shade "01 Lychee";  multi-piece / promo options ("2 Pcs", "+ Tissue", "BUY 1 GET 1", "FS") are dropped, not kept
  var PROMO_TAG = /^\s*(?:[\[\(\{【][^\]\)\}】]{1,25}[\]\)\}】]\s*)+/;
  var BUNDLE_RE = /(\d+\s*(?:pcs|pc|pcs\.|buah|pack|pak|set|botol|tube|box|pasang)\b|\b(?:buy|beli)\s*\d|\bget\s*\d|\b(?:gratis|free)\b|save\s*more|\bhemat\b|\bpaket\b|\bbundl\w*|\bcombo\b|\bb\d+g\d+\b|\bbogo\b|\d\s*\+\s*\d|\bpromo\b|\bduo\b|\btrio\b|\+\s*[a-z]|\bfs\b|\bfree\s*ongkir\b|\bgratis\s*ongkir\b)/i;
  function cleanVariantName(n) {
    n = str(n).replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, '');   // emoji
    var prev;
    do { prev = n; n = n.replace(PROMO_TAG, ''); } while (n !== prev);       // [TOP1] [HOT!] [SALE] in front
    return n.replace(/\s+/g, ' ').trim();
  }
  function isBundle(raw, cleaned) { return BUNDLE_RE.test(raw) || BUNDLE_RE.test(cleaned); }
  function shadeKey(n) {
    var m = n.match(/^#?\s*(\d{1,3})\b/);
    return m ? 'n' + parseInt(m[1], 10) : 'w' + n.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  // shade lines inside the description text, e.g. "01 Lychee", "02 - Peach: for fair skin" (numbered steps like "1." are not shades)
  var DESC_SHADE = /^\s*[-•*▪✔✅>]*\s*#?(\d{2,3})\s*[-–:]?\s+([A-Za-z][A-Za-z'&\/ ]{1,28}?)\s*(?:[:\-–(].*)?$/;
  function shadesFromDescription(text) {
    var out = [];
    String(text || '').split(/\n+/).forEach(function (line) {
      line = line.replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, '').trim();
      if (line.length > 45 || /[.!?]$/.test(line)) return;
      var m = line.match(DESC_SHADE);
      if (m && !/^(ml|gr|g|kg|pcs|hari|jam|menit|detik|x)\b/i.test(m[2])) out.push(m[1] + ' ' + m[2].trim());
    });
    return out.length >= 2 ? out : [];       // one lonely "01 something" is more likely a step or a size
  }
  function splitVariants(names, description) {
    var shades = [], keys = {}, fromDesc = 0;
    (names || []).forEach(function (raw) {
      var n = cleanVariantName(raw);
      if (!n) return;
      if (isBundle(raw, n)) return;
      var k = shadeKey(n);
      if (!keys[k]) { keys[k] = 1; shades.push(n); }
    });
    shadesFromDescription(description).forEach(function (n) {
      if (isBundle(n, n)) return;
      var k = shadeKey(n);
      if (!keys[k]) { keys[k] = 1; shades.push(n); fromDesc++; }
    });
    return { shades: shades, fromDescription: fromDesc };
  }

  // ---------- record ids, names ----------
  function recordKey(rec) {
    return (rec.shopId || '0') + '-' + (rec.itemId || '0');
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  // safe for Windows/macOS folder and file names
  function safeName(s, max) {
    s = String(s || '').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/[. ]+$/, '');
    if (max && s.length > max) s = s.slice(0, max).trim();
    return s;
  }

  // short name = title without the brand at the start, cut to a few words
  function shortName(rec) {
    var t = String(rec.title || '');
    if (rec.brand) {
      var re = new RegExp('^\\s*[\\[\\(]?' + rec.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\]\\)]?\\s*[-–:]?\\s*', 'i');
      t = t.replace(re, '');
    }
    return safeName(t, 40) || 'product';
  }

  // folder: PDP Library/<category>/<Brand – short name (date)>
  function folderPath(rec) {
    var cat = safeName(rec.category, 60) || 'Uncategorised';
    var brand = safeName(rec.brand, 30) || 'Unknown brand';
    var name = brand + ' – ' + shortName(rec) + ' (' + fmtDate(rec.capturedAt) + ')';
    return 'PDP Library/' + cat + '/' + safeName(name, 100);
  }

  // Plain-ASCII version of a relative path, used only if Chrome refuses the original name.
  function asciiPath(p) {
    return String(p).split('/').map(function (part) {
      var a = part.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[^\x20-\x7e]/g, '');
      a = a.replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim();
      return a || 'item';
    }).join('/');
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function rupiah(n) {
    if (n === null || n === undefined || n === '') return '';
    return 'Rp ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // readable text file
  function buildInfoTxt(rec) {
    var ppu = pricePerUnit(rec.price, rec.netto);
    var lines = [
      'PRODUCT: ' + rec.title,
      'BRAND: ' + (rec.brand || '-'),
      'NETTO: ' + (rec.netto ? rec.netto.text + ' (guessed from the name)' : '-'),
      'PRICE: ' + (rec.price ? rupiah(rec.price) : '-') + (ppu ? '  (' + rupiah(ppu.perUnit) + ' per ' + ppu.unit + ')' : ''),
      'VARIANTS / SHADES: ' + ((rec.variants && rec.variants.length) ? rec.variants.join(', ') : '-'),
      'SHOP: ' + (rec.shopName || '-') + (rec.isOfficial ? ' (official)' : ''),
      'KEY MESSAGE: ' + (rec.keyMessage || '-'),
      'MAIN CATEGORY: ' + (rec.mainCategory || mainCategoryFor(rec.category) || '-'),
      'CATEGORY / PROJECT: ' + (rec.category || '-'),
      'LINK: ' + rec.url,
      'SAVED: ' + fmtDate(rec.capturedAt) + (rec.savedBy ? ' by ' + rec.savedBy : ''),
      rec.isNewLaunch ? 'NEW PRODUCT LAUNCH: marked ' + fmtDate(rec.newLaunchMarkedAt) : null,
      'BANNERS: ' + rec.images.length + (rec.descImages && rec.descImages.length ? '  (+ ' + rec.descImages.length + ' images from the description, files desc-01...)' : ''),
      'DATA QUALITY: ' + (rec.completeness === 'complete' ? 'complete' : 'some details missing (read from the visible page)'),
      ''
    ].filter(function (l) { return l !== null; });
    var ai = rec.ai;
    if (ai) {
      var list = function (items) { return (items || []).map(function (x) { return '- ' + (typeof x === 'string' ? x : (x && x.text) || '') + (x && x.source ? ' (' + x.source + ')' : ''); }); };
      lines = lines.concat(['----- AI READING -----', 'HERO CLAIMS:'], list(ai.heroClaims), ['RTB:'], list(ai.rtb), ['KEY INGREDIENTS:'], list(ai.keyIngredients),
        ['TEXTURE: ' + (ai.texture || '-'), 'FINISH: ' + (ai.finish || '-'), 'TARGET SKIN TYPE: ' + (ai.targetSkin || '-'), 'HOW TO USE:'], list(ai.howToUse), ['']);
    }
    lines = lines.concat([
      '----- DESCRIPTION (as written by the seller) -----',
      rec.description || '(no description found)',
      ''
    ]);
    return lines.join('\r\n');
  }

  // ---------- CSV ----------
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function toCsv(headers, rows) {
    var out = [headers.map(csvCell).join(',')];
    rows.forEach(function (r) { out.push(r.map(csvCell).join(',')); });
    return '﻿' + out.join('\r\n') + '\r\n'; // BOM so Excel reads Indonesian text correctly
  }

  // Columns kept close to what a Microsoft List would hold, so moving later is an import.
  var CSV_COLUMNS = ['ProductKey', 'Category', 'Brand', 'ProductName', 'KeyMessage', 'Netto', 'Variants', 'Price', 'PriceBeforeDiscount', 'PricePerUnit', 'Unit',
    'Shop', 'OfficialShop', 'Rating', 'RatingCount', 'Sold', 'BannerCount', 'DescriptionImageCount', 'ShopeeLink', 'SavedBy', 'SavedAt', 'DataQuality', 'Notes', 'Description'];
  function recordToCsvRow(rec, notes) {
    var ppu = pricePerUnit(rec.price, rec.netto);
    return [recordKey(rec), rec.category, rec.brand, rec.title, rec.keyMessage || '', rec.netto ? rec.netto.text : '', (rec.variants || []).join(', '), rec.price, rec.priceBefore,
      ppu ? Math.round(ppu.perUnit) : '', ppu ? ppu.unit : '', rec.shopName, rec.isOfficial ? 'yes' : 'no', rec.rating, rec.ratingCount, rec.sold,
      rec.images.length, (rec.descImages || []).length, rec.url, rec.savedBy || '', rec.capturedAt, rec.completeness, notes || '', rec.description];
  }

  var api = {
    IMG_BASE: IMG_BASE,
    splitVariants: splitVariants,
    cleanVariantName: cleanVariantName,
    imgKey: imgKey,
    parseProductUrl: parseProductUrl,
    fullImageUrl: fullImageUrl,
    guessNetto: guessNetto,
    inferBrand: inferBrand,
    detectCategory: detectCategory,
    MAIN_CATEGORIES: MAIN_CATEGORIES,
    mainCategoryFor: mainCategoryFor,
    cleanMainCategory: cleanMainCategory,
    inferFields: inferFields,
    cleanProductName: cleanProductName,
    shopBase: shopBase,
    pricePerUnit: pricePerUnit,
    parseShopeeResponse: parseShopeeResponse,
    recordKey: recordKey,
    fmtDate: fmtDate,
    safeName: safeName,
    shortName: shortName,
    folderPath: folderPath,
    asciiPath: asciiPath,
    pad2: pad2,
    rupiah: rupiah,
    buildInfoTxt: buildInfoTxt,
    toCsv: toCsv,
    CSV_COLUMNS: CSV_COLUMNS,
    recordToCsvRow: recordToCsvRow
  };

  root.PDP = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
