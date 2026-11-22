/* Civil War – Guide page: download the extension, install it, get a Gemini key, update it.
 * The file civil-war-extension-v<REL>.zip and extension-info.json sit next to this page on the website
 * (build_flat.sh writes the info file from the extension's manifest and checks that REL matches it). */
(function () {
  'use strict';
  var h = Dash.h;
  Dash.nav('settings');
  var app = document.getElementById('app');
  var REL = '1.0.0';                                   // keep equal to manifest.json "version" (build_flat.sh checks it)
  var FOLDER = 'civil-war-extension-v' + REL, ZIP = FOLDER + '.zip', ADDRESS = 'chrome://extensions';
  var info = null;                       // {version, size, date} of the zip on this website

  function step(n, title, kids, last) {
    return h('section', { class: 'card step' },
      h('div', { class: 'num' + (last ? ' last' : ''), 'aria-hidden': 'true' }, String(n)),
      h('div', { class: 'body' }, h('h2', null, title), kids));
  }
  function note(text, kind) { return h('div', { class: 'callout' + (kind ? ' ' + kind : '') }, text); }

  // ---------- status bar ----------
  var statusEl = h('section', { class: 'card statusbar', 'aria-label': 'Extension status', 'aria-live': 'polite' });
  function paintStatus(ext) {
    statusEl.textContent = '';
    var pill, text;
    if (!ext) {
      pill = h('span', { class: 'spill' }, h('i'), 'Checking this Chrome…'); text = '';
    } else if (!ext.installed) {
      pill = h('span', { class: 'spill' }, h('i'), 'Not detected in this Chrome yet');
      text = 'This page checks by itself. After you finish the steps below, refresh this page and it will show a green check.';
    } else if (ext.inside) {
      pill = h('span', { class: 'spill ok' }, h('i'), 'You are using the extension' + (ext.version ? ' (version ' + ext.version + ')' : ''));
      text = 'Your teammates can get it from the website: ' + ((self.CW_CONFIG && CW_CONFIG.siteUrl) ? CW_CONFIG.siteUrl + 'extension.html' : 'this page') + '.';
    } else if (info && Dash.versionOlder(ext.version, info.version)) {
      pill = h('span', { class: 'spill warn' }, h('i'), 'Installed' + (ext.version ? ' (version ' + ext.version + ')' : ' (an older version)') + ' – update available');
      text = 'The newest version is ' + info.version + '. See “Already installed? How to update” at the bottom of this page.';
    } else {
      pill = h('span', { class: 'spill ok' }, h('i'), 'Extension detected' + (ext.version ? ' (version ' + ext.version + ')' : ''));
      text = 'You are all set. Save products from shopee.co.id with the Civil War icon.';
    }
    statusEl.appendChild(pill);
    if (text) statusEl.appendChild(h('span', { class: 'muted1' }, text));
  }

  // ---------- step 1: download ----------
  var infoLine = h('div', { class: 'meta' }, 'Loading version…');
  function paintInfo() {
    infoLine.textContent = info
      ? 'Version ' + info.version + (info.size ? ' · ' + info.size : '') + (info.date ? ' · updated ' + info.date : '')
      : '';
  }

  // ---------- step 3: copy the address ----------
  var copyBtn = h('button', { type: 'button', class: 'btn', onclick: async function () {
    var ok = await Dash.copyText(ADDRESS);
    copyBtn.textContent = ok ? '✓ Copied. Now paste it in a new tab' : 'Could not copy. Select the address and copy it yourself';
    copyBtn.classList.toggle('copied', !!ok);
    setTimeout(function () { copyBtn.textContent = 'Copy address'; copyBtn.classList.remove('copied'); }, 4000);
  } }, 'Copy address');

  // ---------- update section ----------
  var updBody = h('div', { class: 'upd', hidden: true },
    h('ol', null,
      h('li', null, 'Download the new zip above and unzip it.'),
      h('li', null, 'Open the new folder (', h('b', null, FOLDER), '), select ', h('b', null, 'everything inside it'), ', and copy it ', h('b', null, 'into the folder you installed from the first time'), ', replacing the old files. That folder keeps its old name and version number; that is fine. Do not load the new folder as a second extension.'),
      h('li', null, 'Open ', h('b', null, ADDRESS), ' and click the round ', h('b', null, 'refresh'), ' arrow on the Civil War card.'),
      h('li', null, 'Refresh this website (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows).')),
    note('Installed it before from a folder called “pdp-capture” (version 0.15 or older)? Do this just once: on the Civil War card on ' + ADDRESS + ' click Remove, then follow steps 2 and 4 above with the new zip. Your library is safe because it lives in the shared database. You will need to paste your Gemini key again.'));
  var updBtn = h('button', { type: 'button', class: 'acc', 'aria-expanded': 'false', onclick: function () {
    var open = updBody.hidden; updBody.hidden = !open;
    updBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); updMark.textContent = open ? 'Hide ▲' : 'Show ▼';
  } }, h('span', null, 'Already installed? How to update'));
  var updMark = h('span', { 'aria-hidden': 'true' }, 'Show ▼');
  updBtn.appendChild(updMark);

  var downloadLink = h('a', { class: 'btn primary big', href: ZIP, download: ZIP }, '⬇ Download extension (.zip)');

  app.appendChild(h('header', null,
    h('h1', null, 'Get the Civil War extension'),
    h('div', { class: 'sub' }, 'The extension saves a Shopee product page into this shared library with one click. Setup takes about 5 minutes, once.')));
  app.appendChild(statusEl);
  app.appendChild(step(1, 'Download the extension', [
    h('p', { class: 'lead' }, 'One file. Save it anywhere you can find it, for example your Downloads folder.'),
    h('div', { class: 'file' },
      h('div', { class: 'fi' }, h('div', { class: 'fn' }, ZIP), infoLine),
      downloadLink)
  ]));
  app.appendChild(step(2, 'Unzip it into a folder that stays in place', [
    h('p', { class: 'lead' }, 'Create a folder such as ', h('b', null, 'Documents › Civil War'), ', put the zip file in it and unzip it there. You will get a folder called ', h('b', null, FOLDER), '.'),
    h('ul', null,
      h('li', null, h('b', null, 'Windows:'), ' right-click the zip file › ', h('b', null, 'Extract All'), '.'),
      h('li', null, h('b', null, 'Mac:'), ' double-click the zip file.')),
    note('Do not move or delete the folder later. Chrome runs the extension from it.', 'plum'),
    note('If you see a second folder called “' + FOLDER + ' 2”, you unzipped twice. Delete the extra one and keep the first.')
  ]));
  app.appendChild(step(3, 'Open Chrome’s extensions page', [
    h('p', { class: 'lead' }, 'Copy the address, open a new tab, paste it in the address bar and press Enter.'),
    h('div', { class: 'row' }, h('code', null, ADDRESS), copyBtn)
  ]));
  app.appendChild(step(4, 'Load the extension', [
    h('ol', null,
      h('li', null, 'Turn on ', h('b', null, 'Developer mode'), ' (switch at the top right of that page).'),
      h('li', null, 'Click ', h('b', null, 'Load unpacked'), '.'),
      h('li', null, 'Choose the folder ', h('b', null, FOLDER), ' (the one with many files inside, not an empty folder).'),
      h('li', null, 'Click the puzzle icon in Chrome’s toolbar and ', h('b', null, 'pin'), ' Civil War, so its icon is always visible.'))
  ]));
  app.appendChild(step(5, 'Get your own Gemini API key (for the AI buttons)', [
    h('p', { class: 'lead' }, 'The AI reads banners and builds the Claim matrix. Each person uses their own free Google key.'),
    h('a', { class: 'btn big', href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener noreferrer' }, 'Open Google AI Studio ↗'),
    h('ol', null,
      h('li', null, 'Sign in with your Google account.'),
      h('li', null, 'Click ', h('b', null, 'Get API key'), ', then ', h('b', null, 'Create API key'), ', and copy the key (button names may differ a little).'),
      h('li', null, 'In Chrome, click the Civil War icon to open the side panel, click the ', h('b', null, '⚙'), ' icon, paste the key and save.')),
    note('Enter it once, in the extension. The website’s AI buttons use it through the extension. Never paste your key on this website, and never share it.')
  ]));
  app.appendChild(step(6, 'Save your first product', [
    h('p', null, 'Open a product page on shopee.co.id, click the Civil War icon, check the fields and click ', h('b', null, 'Save to Library'), '. Keep the side panel open for about a minute so the banners are copied. The product appears in the Product library here within seconds. Also fill in ', h('b', null, 'Your name'), ' on the Main page so “Saved by” shows you.')
  ], true));
  app.appendChild(h('section', { class: 'card accwrap' }, updBtn, updBody));
  app.appendChild(h('footer', { class: 'foot' },
    h('div', null, 'The extension is saved on your own computer and runs in Chrome (or Edge).'),
    h('div', null, 'Stuck? Send a screenshot of the step you are on to the person who shared this link.')));

  // inside the extension itself there is no zip next to this page: hide the download part
  if (Dash.inExtension) {
    downloadLink.hidden = true; infoLine.textContent = 'You already have the extension. Teammates download it from the website.';
  }
  paintStatus(null);
  Dash.extensionInfo().then(function (ext) { window.__ext = ext; paintStatus(ext); });
  fetch('extension-info.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (j && j.version) { info = j; if (!Dash.inExtension) paintInfo(); }
    else if (!Dash.inExtension) infoLine.textContent = '';
    Dash.extensionInfo().then(paintStatus);
  }).catch(function () { if (!Dash.inExtension) infoLine.textContent = ''; });
})();
