/* Don’t Feed - arrière-plan : menus clic droit, abonnements, blocage de domaines, badge. */
if (typeof importScripts === 'function') importScripts('lib/core.js', 'lib/i18n.js');
const { DEFAULTS, EMPTY_PERSONAL, parseList, collect, cleanDomain } = globalThis.FRB;

const REFRESH_EVERY_H = 12;

async function getState() {
  return chrome.storage.local.get(['settings', 'personal', 'subscriptions']);
}

async function init() {
  const st = await getState();
  const settings = { ...DEFAULTS, ...(st.settings || {}) };
  // Une seule fois : ajouter les messageries en pause pour ceux qui avaient installé avant
  if (!settings.pausedDefaultsApplied) {
    settings.pausedSites = [...new Set([...(settings.pausedSites || []), ...FRB.DEFAULT_PAUSED])];
    settings.pausedDefaultsApplied = true;
  }
  await chrome.storage.local.set({
    settings,
    personal: { ...EMPTY_PERSONAL, ...(st.personal || {}) },
    subscriptions: st.subscriptions || [],
  });
}

async function createMenus() {
  if (!chrome.contextMenus) return; // Firefox Android : pas de clic droit
  const { settings } = await chrome.storage.local.get('settings');
  I18N.setLang(settings && settings.lang);
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'frb-text', title: I18N.t('menu_text'), contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'frb-link', title: I18N.t('menu_link'), contexts: ['link'] });
    chrome.contextMenus.create({ id: 'frb-page', title: I18N.t('menu_page'), contexts: ['page'] });
  });
}

// Compteur local : les onglets envoient leurs contenus masqués par paquets, écrits un par un
let statsChain = Promise.resolve();
function addStats(n) {
  statsChain = statsChain.then(async () => {
    const { stats } = await chrome.storage.local.get('stats');
    await chrome.storage.local.set({ stats: FRB.addHits(stats, n) });
  }).catch(() => {});
}

// Chrome n'injecte pas les scripts dans les onglets déjà ouverts à l'installation ou à la mise à jour :
// sans ça, il faudrait recharger chaque onglet. Firefox le fait tout seul, on ne double pas.
const IS_FIREFOX = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
async function injectIntoOpenTabs() {
  if (IS_FIREFOX || !chrome.scripting) return;
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }); } catch (e) { return; }
  for (const t of tabs) {
    if (t.discarded) continue;
    const target = { tabId: t.id };
    try {
      await chrome.scripting.insertCSS({ target, files: ['content.css'] });
      await chrome.scripting.executeScript({ target, files: ['lib/core.js', 'lib/i18n.js', 'content.js'] });
      if (/^https?:\/\/([^/]+\.)?youtube\.com\//.test(t.url || '')) {
        await chrome.scripting.executeScript({ target, files: ['yt-main.js'], world: 'MAIN' });
      }
    } catch (e) { /* page protégée (Chrome Web Store, etc.) */ }
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await init();
  createMenus();
  if (details.reason === 'install' || details.reason === 'update') injectIntoOpenTabs();
  chrome.alarms.create('frb-refresh', { periodInMinutes: 60 });
  await refreshSubscriptions(false);
  await updateDomainRules();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(async () => {
  createMenus();
  chrome.alarms.create('frb-refresh', { periodInMinutes: 60 });
  await refreshSubscriptions(false);
  await updateDomainRules();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'frb-refresh') refreshSubscriptions(false);
});

async function addToPersonal(fn) {
  const { personal } = await chrome.storage.local.get('personal');
  const p = { ...EMPTY_PERSONAL, ...(personal || {}) };
  fn(p);
  await chrome.storage.local.set({ personal: p });
}

if (chrome.contextMenus) chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'frb-text') {
    const name = (info.selectionText || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (name.length < 3) return;
    await addToPersonal((p) => {
      if (!p.entries.some((e) => e.name.toLowerCase() === name.toLowerCase())) p.entries.push({ name, aliases: [] });
    });
  } else if (info.menuItemId === 'frb-link' || info.menuItemId === 'frb-page') {
    const url = info.menuItemId === 'frb-link' ? info.linkUrl : (info.pageUrl || (tab && tab.url));
    let d = null;
    try { d = cleanDomain(new URL(url).hostname); } catch (e) { /* ignore */ }
    if (!d) return;
    await addToPersonal((p) => { if (!p.domains.includes(d)) p.domains.push(d); });
  }
});

// Télécharge les listes auxquelles on est abonné
async function refreshSubscriptions(force) {
  const { subscriptions = [] } = await chrome.storage.local.get('subscriptions');
  const now = Date.now();
  const updates = {};
  for (const s of subscriptions) {
    if (!force && s.lastUpdate && now - s.lastUpdate < REFRESH_EVERY_H * 3600e3) continue;
    try {
      const res = await fetch(s.url, { cache: 'no-cache', credentials: 'omit' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const parsed = parseList(await res.text());
      updates[s.url] = { title: parsed.title || s.title || s.url, entries: parsed.entries, domains: parsed.domains, lastUpdate: now, error: null };
    } catch (e) {
      updates[s.url] = { error: String((e && e.message) || e), lastAttempt: now };
    }
  }
  if (!Object.keys(updates).length) return;
  // Relire avant d'écrire : l'utilisateur a pu modifier ses abonnements pendant le téléchargement
  const fresh = (await chrome.storage.local.get('subscriptions')).subscriptions || [];
  for (const s of fresh) if (updates[s.url]) Object.assign(s, updates[s.url]);
  await chrome.storage.local.set({ subscriptions: fresh });
}

// Sites entiers bloqués : redirection vers blocked.html
async function updateDomainRules() {
  const st = await getState();
  const settings = { ...DEFAULTS, ...(st.settings || {}) };
  const { domains } = collect(st);
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = [];
  if (settings.enabled && domains.length) {
    addRules.push({
      id: 1,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: chrome.runtime.getURL('blocked.html') + '?d=\\1' },
      },
      condition: {
        regexFilter: '^https?://(?:www\\.)?([^/?#:]+)',
        requestDomains: domains,
        resourceTypes: ['main_frame'],
      },
    });
  }
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map((r) => r.id), addRules });
}

let rulesTimer = null;
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local' || !(ch.personal || ch.subscriptions || ch.settings)) return;
  if (ch.settings && (ch.settings.oldValue || {}).lang !== (ch.settings.newValue || {}).lang) createMenus();
  clearTimeout(rulesTimer);
  rulesTimer = setTimeout(() => updateDomainRules().catch(console.error), 300);
});

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (!msg) return;
  if (msg.type === 'count' && sender.tab) {
    const tabId = sender.tab.id;
    chrome.action.setBadgeText({ tabId, text: msg.n ? String(msg.n) : '' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#3a3a3a' });
  } else if (msg.type === 'hits' && sender.tab && msg.n > 0 && msg.n < 1000) {
    addStats(msg.n);
  } else if (msg.type === 'refresh') {
    refreshSubscriptions(true).then(() => send({ ok: true }), (e) => send({ ok: false, error: String(e) }));
    return true;
  }
});
