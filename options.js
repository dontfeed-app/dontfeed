(() => {
  'use strict';
  const { DEFAULTS, EMPTY_PERSONAL, STARTER_LISTS, defaultCountry, parseList, collect, cleanDomain, cleanEntry, summarize } = globalThis.FRB;
  const { t } = globalThis.I18N;
  const $ = (id) => document.getElementById(id);
  const store = chrome.storage.local;

  let state = {};
  let platformFilter = '';

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  }
  const flash = (id, text) => { $(id).textContent = text; setTimeout(() => { $(id).textContent = ''; }, 2500); };
  const splitComma = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString(I18N.lang, { dateStyle: 'short', timeStyle: 'short' }) : t('never'));
  const fmtNum = (n) => Number(n || 0).toLocaleString(I18N.lang);
  const extIcon = () => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '14'); s.setAttribute('height', '14'); s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('fill', 'none'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<path d="M6 3h7v7M13 3L4 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
    return s;
  };

  async function load() {
    const st = await store.get(['settings', 'personal', 'subscriptions', 'doneAccounts', 'stats']);
    state = {
      settings: { ...DEFAULTS, ...(st.settings || {}) },
      personal: { ...EMPTY_PERSONAL, ...(st.personal || {}) },
      subscriptions: st.subscriptions || [],
      doneAccounts: st.doneAccounts || {},
      stats: st.stats || null,
    };
    if (I18N.setLang(state.settings.lang) !== document.documentElement.lang) I18N.apply();
    render();
  }
  const savePersonal = () => store.set({ personal: state.personal });
  const saveSubs = () => store.set({ subscriptions: state.subscriptions });
  const saveSettings = () => store.set({ settings: state.settings });

  // --- Onglets ---
  const tabs = [...document.querySelectorAll('#tabs button')];
  function showTab(name) {
    for (const x of tabs) x.setAttribute('aria-selected', String(x.dataset.tab === name));
    for (const s of document.querySelectorAll('main > section.tab')) s.hidden = s.id !== name;
    history.replaceState(null, '', '#' + name);
  }
  for (const b of tabs) b.onclick = () => showTab(b.dataset.tab);

  // --- Listes de départ par pays ---
  const countryLabel = (c) => STARTER_LISTS[c].flag + ' ' + STARTER_LISTS[c].label;
  const isSubscribed = (url) => state.subscriptions.some((s) => s.url === url);
  async function subscribe(url) {
    if (isSubscribed(url)) return;
    state.subscriptions.push({ url, title: url, enabled: true, entries: [], domains: [] });
    await saveSubs();
    await chrome.runtime.sendMessage({ type: 'refresh' });
  }
  function fillCountrySelect() {
    const sel = $('choiceCountry');
    if (sel.options.length) return;
    for (const c of Object.keys(STARTER_LISTS)) sel.append(el('option', { value: c }, countryLabel(c)));
    sel.value = defaultCountry(navigator.language);
  }
  async function choose(showSource) {
    $('choiceBlur').disabled = $('choiceSource').disabled = true;
    state.settings.showSource = showSource;
    state.settings.choiceMade = true;
    await saveSettings();
    await subscribe(STARTER_LISTS[$('choiceCountry').value].url);
    showTab(showSource ? 'source' : 'perso');
  }
  $('choiceBlur').onclick = () => choose(false);
  $('choiceSource').onclick = () => choose(true);

  function renderStarter() {
    fillCountrySelect();
    const starterUrls = Object.values(STARTER_LISTS).map((l) => l.url);
    const subs = state.subscriptions.filter((s) => starterUrls.includes(s.url));
    const pending = !state.settings.choiceMade && !subs.length;
    $('choiceRow').hidden = !pending;
    $('starterInfo').hidden = pending;
    const err = subs.find((s) => s.error);
    if (err) $('starterInfo').textContent = t('starter_err', { e: err.error });
    else if (subs.length) {
      const names = subs.map((s) => { const c = Object.keys(STARTER_LISTS).find((k) => STARTER_LISTS[k].url === s.url); return countryLabel(c) + ' (' + (s.entries || []).length + ')'; });
      $('starterInfo').textContent = t('starter_info', { lists: names.join(', ') }) + (state.settings.showSource ? '' : ' ' + t('blur_only'));
    } else $('starterInfo').textContent = state.settings.showSource ? '' : t('blur_only');
    const srcTab = tabs.find((b) => b.dataset.tab === 'source');
    srcTab.hidden = !state.settings.showSource;
    if (!state.settings.showSource && srcTab.getAttribute('aria-selected') === 'true') showTab('perso');
  }

  function renderCountries() {
    const box = $('countryList');
    box.replaceChildren();
    for (const c of Object.keys(STARTER_LISTS)) {
      const L = STARTER_LISTS[c];
      const sub = state.subscriptions.find((s) => s.url === L.url);
      box.append(el('div', { class: 'country' },
        el('div', { class: 'stack', style: 'gap: 2px' }, el('b', {}, countryLabel(c)), sub ? el('span', { class: 'faint' }, (sub.title && sub.title !== sub.url ? sub.title : '')) : null),
        sub
          ? el('span', { class: 'muted' }, t('subscribed'))
          : el('button', { type: 'button', onclick: async (e) => { e.target.disabled = true; await subscribe(L.url); } }, t('subscribe'))));
    }
  }

  // --- Compteur local ---
  function renderStats() {
    const s = summarize(state.stats);
    $('statsBox').hidden = !state.settings.choiceMade && !s.total;
    $('stToday').textContent = fmtNum(s.today);
    $('stWeek').textContent = fmtNum(s.week);
    $('stMonth').textContent = fmtNum(s.month);
    $('stTotal').textContent = fmtNum(s.total);
  }

  // --- Bloquer à la source ---
  const PLATFORMS = { 'twitter.com': 'X', 'x.com': 'X', 'instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'youtube.com': 'YouTube', 'tiktok.com': 'TikTok', 'bsky.app': 'Bluesky', 'threads.net': 'Threads', 'threads.com': 'Threads', 'linkedin.com': 'LinkedIn', 'reddit.com': 'Reddit', 'twitch.tv': 'Twitch', 't.me': 'Telegram' };
  const ORDER = ['X', 'Instagram', 'Facebook', 'TikTok', 'YouTube', 'Bluesky', 'Threads'];
  function platformOf(url) {
    try { const h = new URL(url).hostname.replace(/^(www|m|mobile)\./, ''); return PLATFORMS[h] || h; } catch (e) { return '?'; }
  }
  $('srcHideDone').onchange = () => renderSource();

  function actionsFor(p, accs) {
    const allDone = accs.every((a) => state.doneAccounts[a.url]);
    const todo = accs.filter((a) => !state.doneAccounts[a.url]);
    const toOpen = todo.length ? todo : accs;
    const label = toOpen.length === 1 ? t('open_profile', { p: toOpen[0].platform }) : t('open_profiles', { n: toOpen.length });
    return el('div', { class: 'chips', style: 'align-items: center' },
      el('button', { type: 'button', class: allDone ? '' : 'primary', title: toOpen.map((a) => a.platform).join(', '), onclick: () => {
        toOpen.forEach((a, i) => chrome.tabs.create({ url: a.url, active: i === 0 }));
      } }, label, extIcon()),
      el('label', { class: 'switch' + (allDone ? '' : ' muted'), style: allDone ? 'color: var(--ok-text)' : '' },
        el('input', { type: 'checkbox', checked: allDone, style: 'accent-color: var(--ok)', onchange: async (ev) => {
          for (const a of accs) { if (ev.target.checked) state.doneAccounts[a.url] = Date.now(); else delete state.doneAccounts[a.url]; }
          await store.set({ doneAccounts: state.doneAccounts });
        } }),
        allDone ? t('blocked') : t('done')));
  }

  function renderSource() {
    const { entries } = collect(state);
    const people = [];
    const seen = new Set();
    for (const e of entries) {
      const accs = (e.accounts || []).filter((u) => !seen.has(u) && seen.add(u)).map((url) => ({ url, platform: platformOf(url) }));
      if (accs.length) people.push({ ...e, accs });
    }
    const all = people.flatMap((p) => p.accs);
    const done = all.filter((a) => state.doneAccounts[a.url]).length;
    $('srcStats').textContent = `${done} / ${all.length}`;
    $('srcBar').style.width = all.length ? Math.round((done / all.length) * 100) + '%' : '0';
    const plats = [...new Set(all.map((a) => a.platform))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
    if (platformFilter && !plats.includes(platformFilter)) platformFilter = '';
    $('srcPlatforms').replaceChildren(...['', ...plats].map((p) => el('button', {
      type: 'button', class: 'pill', 'aria-pressed': String(platformFilter === p), onclick: () => { platformFilter = p; renderSource(); },
    }, p || t('all_platforms'))));
    const hideDone = $('srcHideDone').checked;
    const list = $('srcList');
    list.replaceChildren();
    for (const p of people) {
      const accs = p.accs.filter((a) => (!platformFilter || a.platform === platformFilter) && !(hideDone && state.doneAccounts[a.url]));
      if (!accs.length) continue;
      list.append(el('div', { class: 'person' },
        el('div', { class: 'who' },
          el('b', {}, p.name),
          el('span', { class: 'faint' }, p.from === 'perso' ? t('my_list_label') : p.from,
            p.source ? ' · ' : null, p.source ? el('a', { href: p.source, target: '_blank', rel: 'noopener noreferrer' }, t('source_link')) : null,
            p.wikidata ? ' · ' : null, p.wikidata ? el('a', { href: 'https://www.wikidata.org/wiki/' + p.wikidata, target: '_blank', rel: 'noopener noreferrer' }, t('wikidata_link')) : null),
          p.note ? el('span', { class: 'faint' }, p.note) : null,
          el('span', { class: 'faint' }, accs.map((a) => a.platform).join(' · '))),
        actionsFor(p, accs)));
    }
    if (!list.children.length) list.append(el('div', { class: 'empty' }, all.length ? t('src_empty_done') : t('src_empty')));
  }

  // --- Ma liste ---
  $('addForm').onsubmit = async (e) => {
    e.preventDefault();
    const entry = cleanEntry({ name: $('addName').value.replace(/\s+/g, ' '), aliases: splitComma($('addAliases').value), accounts: splitComma($('addAccounts').value) });
    if (!entry || entry.name.length < 3) return;
    const ex = state.personal.entries.find((x) => x.name.toLowerCase() === entry.name.toLowerCase());
    if (ex) {
      ex.aliases = [...new Set([...(ex.aliases || []), ...entry.aliases])];
      if (entry.accounts) ex.accounts = [...new Set([...(ex.accounts || []), ...entry.accounts])];
    } else state.personal.entries.unshift(entry);
    await savePersonal();
    $('addForm').reset();
  };
  $('persoFilter').oninput = () => renderPerso();

  function renderPerso() {
    const q = $('persoFilter').value.toLowerCase();
    const list = $('persoList');
    list.replaceChildren();
    $('persoCount').textContent = state.personal.entries.length;
    state.personal.entries.forEach((e, i) => {
      const hay = [e.name, ...(e.aliases || [])].join(' ').toLowerCase();
      if (q && !hay.includes(q)) return;
      list.append(el('li', {},
        el('input', { type: 'checkbox', checked: e.enabled !== false, 'aria-label': e.name, onchange: async (ev) => { e.enabled = ev.target.checked; await savePersonal(); } }),
        el('div', { class: 'grow' },
          el('b', {}, e.name),
          el('div', {}, (e.aliases || []).map((a) => el('span', { class: 'tag' }, a))),
          (e.accounts || []).length ? el('div', { class: 'faint' }, t('profiles_linked', { n: e.accounts.length })) : null),
        el('button', { class: 'link', type: 'button', onclick: async () => {
          const v = prompt(t('prompt_aliases'), (e.aliases || []).join(', '));
          if (v === null) return;
          e.aliases = splitComma(v);
          const acc = prompt(t('prompt_accounts'), (e.accounts || []).join(', '));
          if (acc !== null) { const c = cleanEntry({ name: e.name, accounts: splitComma(acc) }); e.accounts = c.accounts || []; }
          await savePersonal();
        } }, t('edit')),
        el('button', { class: 'link err', type: 'button', onclick: async () => { state.personal.entries.splice(i, 1); await savePersonal(); } }, t('remove'))));
    });
    if (!list.children.length) list.append(el('li', { class: 'muted' }, q ? t('no_result') : t('list_empty')));
  }

  $('exportBtn').onclick = () => {
    const data = { title: 'Don\'t Feed', updated: new Date().toISOString().slice(0, 10), entries: state.personal.entries.map(({ enabled, ...e }) => e), domains: state.personal.domains };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = el('a', { href: url, download: 'dontfeed-liste.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const parsed = parseList(await f.text());
      let added = 0;
      for (const e of parsed.entries) if (!state.personal.entries.some((x) => x.name.toLowerCase() === e.name.toLowerCase())) { state.personal.entries.push(e); added++; }
      state.personal.domains = [...new Set([...state.personal.domains, ...parsed.domains])];
      await savePersonal();
      flash('importMsg', t('import_ok', { a: added, d: parsed.domains.length }));
    } catch (e) {
      flash('importMsg', t('import_err', { e: e.message }));
    }
    ev.target.value = '';
  };

  // --- Abonnements ---
  $('subForm').onsubmit = async (e) => { e.preventDefault(); await subscribe($('subUrl').value.trim()); $('subForm').reset(); };
  $('refreshBtn').onclick = async () => { $('refreshBtn').disabled = true; await chrome.runtime.sendMessage({ type: 'refresh' }); $('refreshBtn').disabled = false; };
  function renderSubs() {
    const list = $('subList');
    list.replaceChildren();
    state.subscriptions.forEach((s, i) => {
      list.append(el('li', {},
        el('input', { type: 'checkbox', checked: s.enabled !== false, 'aria-label': s.title || s.url, onchange: async (ev) => { s.enabled = ev.target.checked; await saveSubs(); } }),
        el('div', { class: 'grow' },
          el('b', {}, s.title || s.url),
          el('div', { class: 'faint mono' }, s.url),
          el('div', { class: 'muted' }, t('sub_meta', { e: (s.entries || []).length, d: (s.domains || []).length, date: fmtDate(s.lastUpdate) })),
          s.error ? el('div', { class: 'err' }, t('error', { e: s.error })) : null),
        el('button', { class: 'link err', type: 'button', onclick: async () => { state.subscriptions.splice(i, 1); await saveSubs(); } }, t('remove'))));
    });
    if (!state.subscriptions.length) list.append(el('li', { class: 'muted' }, t('no_subs')));
  }
  $('allowSave').onclick = async () => {
    state.personal.allow = $('allow').value.split('\n').map((x) => x.trim()).filter(Boolean);
    await savePersonal();
    flash('allowMsg', t('saved'));
  };

  // --- Sites ---
  $('domainsSave').onclick = async () => {
    const lines = $('domains').value.split('\n').map((x) => x.trim()).filter(Boolean);
    const good = [...new Set(lines.map(cleanDomain).filter(Boolean))];
    state.personal.domains = good;
    await savePersonal();
    flash('domainsMsg', good.length < lines.length ? t('sites_ignored', { n: good.length, i: lines.length - good.length }) : t('sites_saved', { n: good.length }));
  };

  // --- Réglages ---
  $('enabled').onchange = async (e) => { state.settings.enabled = e.target.checked; await saveSettings(); };
  $('showSource').onchange = async (e) => { state.settings.showSource = e.target.checked; state.settings.choiceMade = true; await saveSettings(); };
  for (const r of document.querySelectorAll('input[name="mode"]')) r.onchange = async () => { state.settings.mode = r.value; await saveSettings(); };
  $('langSel').onchange = async (e) => { state.settings.lang = e.target.value || null; await saveSettings(); };
  function renderSettings() {
    $('enabled').checked = state.settings.enabled;
    $('showSource').checked = state.settings.showSource;
    $('statusDot').classList.toggle('off', !state.settings.enabled);
    $('statusText').textContent = state.settings.enabled ? t('status_on') : t('status_off');
    for (const r of document.querySelectorAll('input[name="mode"]')) r.checked = r.value === state.settings.mode;
    const sel = $('langSel');
    sel.replaceChildren(el('option', { value: '' }, t('lang_auto')), ...Object.entries(I18N.LANGS).map(([k, v]) => el('option', { value: k }, v)));
    sel.value = state.settings.lang || '';
    const list = $('pausedList');
    list.replaceChildren();
    state.settings.pausedSites.forEach((h, i) => list.append(el('li', {}, el('div', { class: 'grow mono' }, h),
      el('button', { class: 'link', type: 'button', onclick: async () => { state.settings.pausedSites.splice(i, 1); await saveSettings(); } }, t('reactivate')))));
    if (!state.settings.pausedSites.length) list.append(el('li', { class: 'muted' }, t('no_paused')));
  }

  function render() {
    renderStarter();
    renderStats();
    renderCountries();
    renderSource();
    renderPerso();
    renderSubs();
    renderSettings();
    if (document.activeElement !== $('allow')) $('allow').value = (state.personal.allow || []).join('\n');
    if (document.activeElement !== $('domains')) $('domains').value = (state.personal.domains || []).join('\n');
  }

  I18N.apply();
  const hash = location.hash.slice(1);
  if (tabs.some((b) => b.dataset.tab === hash)) showTab(hash);
  chrome.storage.onChanged.addListener((_ch, area) => { if (area === 'local') load(); });
  load();
})();
