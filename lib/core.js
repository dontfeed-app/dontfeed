/* Don’t Feed - logique partagée (listes, normalisation, détection).
   Chargé par le content script, le background et les pages de l'extension. */
(function (root) {
  'use strict';

  const MIN_LEN = 3; // en dessous, trop de faux positifs

  // showSource : afficher l'onglet « Bloquer à la source » ; choiceMade : premier choix fait
  // Messageries et outils de travail : rien d'algorithmique, on n'y floute pas par défaut
  // (l'utilisateur peut les réactiver dans Réglages > Sites en pause).
  const DEFAULT_PAUSED = [
    'mail.google.com', 'docs.google.com', 'drive.google.com', 'calendar.google.com',
    'outlook.live.com', 'outlook.office.com', 'web.whatsapp.com', 'web.telegram.org',
    'messenger.com', 'slack.com', 'discord.com', 'teams.microsoft.com', 'notion.so',
    'claude.ai', 'chatgpt.com',
  ];
  const DEFAULTS = { enabled: true, mode: 'blur', pausedSites: DEFAULT_PAUSED, showSource: true, choiceMade: false };

  // Un site en pause couvre aussi ses sous-domaines (slack.com -> monequipe.slack.com)
  function isPaused(host, list) {
    host = String(host || '').toLowerCase().replace(/^www\./, '');
    return (list || []).some((p) => host === p || host.endsWith('.' + p));
  }
  const EMPTY_PERSONAL = { entries: [], domains: [], allow: [] };

  // Minuscules, sans accents, espaces compactés : "Éric  Dupont" -> "eric dupont"
  function normalize(s) {
    return String(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[’`]/g, "'")
      .replace(/\s+/g, ' ');
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Renvoie une fonction text -> terme trouvé (ou null)
  function buildMatcher(terms) {
    // Garde-fou contre les mots courants : un terme d'un seul mot doit faire au moins
    // 5 caractères (sauf @pseudo). « Le Pen » ou « Jean Exemple » passent, « the » ou « rn » non.
    // Un terme préfixé par « ! » (ex. « !AfD ») est voulu tel quel par l'auteur de la liste.
    const ok = (t) => t.forced ? t.v.length >= 2 : t.v.length >= MIN_LEN && (t.v.startsWith('@') || t.v.includes(' ') || t.v.includes('-') || t.v.length >= 5);
    const list = [...new Set(terms.map((t) => ({ forced: String(t).startsWith('!'), v: normalize(String(t).replace(/^!/, '')).trim() })).filter(ok).map((t) => t.v))]
      .sort((a, b) => b.length - a.length);
    if (!list.length) return null;
    const body = list.map((t) => escapeRe(t).replace(/ /g, '\\s+')).join('|');
    // Mot entier : pas de lettre/chiffre/_ collé avant ou après
    const re = new RegExp('(?<![\\p{L}\\p{N}_])(' + body + ')(?![\\p{L}\\p{N}_])', 'u');
    return (text) => {
      if (!text) return null;
      const m = re.exec(normalize(text));
      return m ? m[1] : null;
    };
  }

  function cleanDomain(d) {
    if (typeof d !== 'string') return null;
    d = d.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
  }

  function cleanUrl(u) {
    if (typeof u !== 'string') return null;
    try {
      const url = new URL(u.trim());
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function cleanEntry(e) {
    if (typeof e === 'string') e = { name: e };
    if (!e || typeof e.name !== 'string' || !e.name.trim()) return null;
    const strs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);
    const out = { name: e.name.trim(), aliases: strs(e.aliases) };
    // matchName: false = le nom affiché n'est pas cherché (ex. un nom qui est aussi un mot courant)
    if (e.matchName === false) out.matchName = false;
    const accounts = strs(e.accounts).map(cleanUrl).filter(Boolean);
    if (accounts.length) out.accounts = accounts;
    if (typeof e.note === 'string' && e.note.trim()) out.note = e.note.trim().slice(0, 300);
    if (typeof e.source === 'string' && cleanUrl(e.source)) out.source = cleanUrl(e.source);
    if (typeof e.wikidata === 'string' && /^Q\d+$/.test(e.wikidata)) out.wikidata = e.wikidata;
    return out;
  }

  /* Deux formats acceptés.
     JSON : { "title": "...", "entries": [{ "name", "aliases", "accounts", "source", "note" }], "domains": [] }
     Texte : une ligne par personne "Nom | variante | @compte", "domain:site.fr",
             "! Title: Ma liste", lignes commençant par # ou ! = commentaires.
             Dans le format texte, une variante qui est une URL va dans "accounts". */
  function parseList(raw) {
    const out = { title: '', entries: [], domains: [] };
    const txt = String(raw || '').replace(/^﻿/, '').trim();
    if (!txt) return out;
    if (txt.startsWith('{')) {
      const j = JSON.parse(txt);
      out.title = typeof j.title === 'string' ? j.title.trim() : '';
      out.entries = (Array.isArray(j.entries) ? j.entries : []).map(cleanEntry).filter(Boolean);
      out.domains = [...new Set((Array.isArray(j.domains) ? j.domains : []).map(cleanDomain).filter(Boolean))];
      return out;
    }
    const domains = new Set();
    for (let line of txt.split(/\r?\n/)) {
      line = line.trim();
      if (!line) continue;
      const t = line.match(/^[!#]\s*title\s*:\s*(.+)$/i);
      if (t) { out.title = t[1].trim(); continue; }
      if (line.startsWith('#') || line.startsWith('!')) continue;
      if (/^domain\s*:/i.test(line)) {
        const d = cleanDomain(line.replace(/^domain\s*:/i, ''));
        if (d) domains.add(d);
        continue;
      }
      const parts = line.split('|').map((s) => s.trim()).filter(Boolean);
      if (!parts.length) continue;
      const [name, ...rest] = parts;
      const accounts = rest.filter((p) => /^https?:\/\//i.test(p));
      const aliases = rest.filter((p) => !/^https?:\/\//i.test(p));
      const e = cleanEntry({ name, aliases, accounts });
      if (e) out.entries.push(e);
    }
    out.domains = [...domains];
    return out;
  }

  // Fusionne liste perso + abonnements actifs, moins les exceptions
  function collect(state) {
    const personal = { ...EMPTY_PERSONAL, ...(state.personal || {}) };
    const allow = new Set((personal.allow || []).map((a) => normalize(a).trim()));
    const terms = [];
    const domains = new Set();
    const entries = [];
    const accounts = new Map(); // clé de compte -> nom de la personne
    const names = new Map(); // terme normalisé -> nom affiché (« bardella » -> « Jordan Bardella »)
    const add = (list, from) => {
      for (const e of list.entries || []) {
        if (e.enabled === false) continue;
        if (allow.has(normalize(e.name).trim())) continue;
        if (e.matchName !== false) terms.push(e.name);
        terms.push(...(e.aliases || []));
        for (const t of [e.name, ...(e.aliases || [])]) { const k = normalize(t.replace(/^!/, '')).trim(); if (!names.has(k)) names.set(k, e.name); }
        for (const a of e.accounts || []) { const k = accountKey(a); if (k) accounts.set(k, e.name); }
        entries.push({ ...e, from });
      }
      for (const d of list.domains || []) domains.add(d);
    };
    add(personal, 'perso');
    for (const s of state.subscriptions || []) if (s.enabled !== false) add(s, s.title || s.url);
    return { terms, domains: [...domains], entries, accounts, names };
  }

  function domainMatches(host, domains) {
    host = String(host || '').toLowerCase().replace(/^www\./, '');
    for (const d of domains) if (host === d || host.endsWith('.' + d)) return d;
    return null;
  }

  /* Clé d'un compte : "x.com|/j_bardella", "youtube.com|/channel/uc3u...".
     Sert à reconnaître un lien vers un compte bloqué, même quand son nom n'est pas écrit. */
  const HOST_ALIAS = { 'twitter.com': 'x.com', 'mobile.twitter.com': 'x.com', 'm.youtube.com': 'youtube.com', 'm.facebook.com': 'facebook.com', 'threads.com': 'threads.net' };
  const RESERVED = new Set(['', 'watch', 'shorts', 'results', 'feed', 'search', 'explore', 'home', 'p', 'reel', 'reels', 'hashtag', 'i', 'intent', 'share', 'video', 'stories', 'tag', 'tags', 'login', 'settings', 'notifications', 'messages', 'groups', 'events', 'pages', 'watch_videos', 'playlist', 'discover', 'live', 'foryou', 'following']);
  function accountKey(href, base) {
    let u;
    try { u = new URL(href, base); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    let host = u.hostname.toLowerCase().replace(/^www\./, '');
    host = HOST_ALIAS[host] || host;
    const seg = u.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s).toLowerCase());
    if (!seg.length) return null;
    let path;
    if ((host === 'youtube.com') && ['channel', 'c', 'user'].includes(seg[0]) && seg[1]) path = '/' + seg[0] + '/' + seg[1];
    else if (host === 'bsky.app' && seg[0] === 'profile' && seg[1]) path = '/profile/' + seg[1];
    else if (host === 'facebook.com' && seg[0] === 'profile.php') path = '/profile.php?id=' + u.searchParams.get('id');
    else if (RESERVED.has(seg[0])) return null;
    else path = '/' + seg[0];
    return host + '|' + path;
  }

  const LISTS_BASE = 'https://raw.githubusercontent.com/dontfeed-app/dontfeed/main/listes/';
  const STARTER_LIST_URL = LISTS_BASE + 'fr-depart.json';
  // Listes de départ par pays (là où l'extrême droite est forte et où des élections approchent)
  const STARTER_LISTS = {
    FR: { url: STARTER_LIST_URL, flag: '🇫🇷', label: 'France', lang: 'fr' },
    ES: { url: LISTS_BASE + 'es.json', flag: '🇪🇸', label: 'España', lang: 'es' },
    IT: { url: LISTS_BASE + 'it.json', flag: '🇮🇹', label: 'Italia', lang: 'it' },
    PL: { url: LISTS_BASE + 'pl.json', flag: '🇵🇱', label: 'Polska', lang: 'pl' },
    DE: { url: LISTS_BASE + 'de.json', flag: '🇩🇪', label: 'Deutschland', lang: 'de' },
    BR: { url: LISTS_BASE + 'br.json', flag: '🇧🇷', label: 'Brasil', lang: 'pt' },
    US: { url: LISTS_BASE + 'us.json', flag: '🇺🇸', label: 'United States', lang: 'en' },
  };
  // Pays proposé par défaut selon la langue du navigateur
  function defaultCountry(lang) {
    lang = String(lang || '').toLowerCase();
    if (lang.startsWith('pt')) return 'BR';
    for (const [c, l] of Object.entries(STARTER_LISTS)) if (lang.startsWith(l.lang)) return c;
    return 'FR';
  }

  // Compteur local : { total, days: { 'AAAA-MM-JJ': n } }, 400 jours gardés au plus
  function dayKey(d) { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
  function addHits(stats, n, d) {
    const s = { total: 0, days: {}, since: dayKey(d), ...(stats || {}) };
    s.days = { ...s.days };
    const k = dayKey(d);
    s.days[k] = (s.days[k] || 0) + n;
    s.total += n;
    const keys = Object.keys(s.days).sort();
    while (keys.length > 400) delete s.days[keys.shift()];
    return s;
  }
  function summarize(stats, d) {
    const s = stats || { total: 0, days: {} };
    const now = d || new Date();
    let week = 0, month = 0;
    for (let i = 0; i < 30; i++) {
      const x = new Date(now); x.setDate(now.getDate() - i);
      const v = s.days[dayKey(x)] || 0;
      if (i < 7) week += v;
      month += v;
    }
    return { today: s.days[dayKey(now)] || 0, week, month, total: s.total || 0, since: s.since };
  }

  const api = { addHits, summarize, dayKey, STARTER_LISTS, defaultCountry, isPaused, DEFAULT_PAUSED, accountKey, STARTER_LIST_URL, MIN_LEN, DEFAULTS, EMPTY_PERSONAL, normalize, buildMatcher, parseList, collect, cleanDomain, cleanEntry, domainMatches };
  root.FRB = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
