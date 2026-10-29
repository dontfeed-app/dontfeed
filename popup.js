(async () => {
  'use strict';
  const { DEFAULTS, EMPTY_PERSONAL, collect, summarize, isPaused } = globalThis.FRB;
  const { t } = globalThis.I18N;
  const $ = (id) => document.getElementById(id);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { if (/^https?:/.test(tab.url || '')) host = new URL(tab.url).hostname; } catch (e) { /* page interne */ }
  $('paused').disabled = !host;

  async function getSettings() {
    return { ...DEFAULTS, ...((await chrome.storage.local.get('settings')).settings || {}) };
  }
  async function saveSettings(patch) {
    await chrome.storage.local.set({ settings: { ...(await getSettings()), ...patch } });
    render();
  }

  async function render() {
    const st = await chrome.storage.local.get(['settings', 'personal', 'subscriptions', 'doneAccounts', 'stats']);
    const settings = { ...DEFAULTS, ...(st.settings || {}) };
    I18N.setLang(settings.lang);
    I18N.apply();
    $('host').textContent = host || t('this_site');
    $('version').textContent = t('version', { v: chrome.runtime.getManifest().version });
    $('enabled').checked = settings.enabled;
    $('paused').checked = !!host && isPaused(host, settings.pausedSites);
    for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode));
    $('source').hidden = !settings.showSource;
    const s = summarize(st.stats);
    $('avoided').textContent = s.total ? t('avoided_line', { t: s.today.toLocaleString(I18N.lang), w: s.week.toLocaleString(I18N.lang), a: s.total.toLocaleString(I18N.lang) }) : '';
    const done = st.doneAccounts || {};
    const accs = new Set(collect(st).entries.flatMap((e) => e.accounts || []));
    const left = [...accs].filter((u) => !done[u]).length;
    $('sourceInfo').textContent = accs.size ? (left ? t('src_left', { n: left }) : t('src_all_done')) : t('src_start');
  }

  $('enabled').onchange = (e) => saveSettings({ enabled: e.target.checked });
  for (const b of document.querySelectorAll('.seg button')) b.onclick = () => saveSettings({ mode: b.dataset.mode });
  $('paused').onchange = async (e) => {
    const list = (await getSettings()).pausedSites;
    const bare = host.replace(/^www\./, '');
    const next = e.target.checked ? [...new Set([...list, bare])] : list.filter((p) => !isPaused(bare, [p]));
    await saveSettings({ pausedSites: next });
  };
  $('options').onclick = () => chrome.runtime.openOptionsPage();
  $('source').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('options.html#source') });

  $('add').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('name').value.trim().replace(/\s+/g, ' ');
    const parts = $('aliases').value.split(',').map((x) => x.trim()).filter(Boolean);
    if (name.length < 3) return;
    const p = { ...EMPTY_PERSONAL, ...((await chrome.storage.local.get('personal')).personal || {}) };
    const accounts = parts.filter((a) => /^https?:\/\//i.test(a));
    const plain = parts.filter((a) => !/^https?:\/\//i.test(a));
    const existing = p.entries.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.aliases = [...new Set([...(existing.aliases || []), ...plain])];
      if (accounts.length) existing.accounts = [...new Set([...(existing.accounts || []), ...accounts])];
    } else {
      p.entries.push(accounts.length ? { name, aliases: plain, accounts } : { name, aliases: plain });
    }
    await chrome.storage.local.set({ personal: p });
    $('name').value = '';
    $('aliases').value = '';
    $('msg').textContent = t('added', { n: name });
    setTimeout(refreshCount, 400);
  };

  async function refreshCount() {
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: 'getCount' });
      $('count').textContent = r.n;
      $('terms').replaceChildren(...r.terms.slice(0, 10).map((x) => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = x; return s; }));
    } catch (e) {
      $('count').textContent = '0';
    }
  }
  await render();
  refreshCount();
})();
