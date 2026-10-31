/* Don't Feed - content script : repère et masque les blocs qui citent un nom ou un site bloqué. */
(() => {
  'use strict';
  // Déjà actif dans cet onglet (injection manuelle + automatique) : ne pas tourner deux fois
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  if (globalThis.__frbInstance && globalThis.__frbInstance.alive()) return;
  globalThis.__frbInstance = { alive };
  const { DEFAULTS, buildMatcher, collect, domainMatches, accountKey, isPaused } = globalThis.FRB;

  // Blocs "unité de contenu" par site (une vidéo, un post, un commentaire...).
  // Le premier motif d'hôte qui correspond gagne.
  const SITES = [
    [/(^|\.)youtube\.com$/, [
      'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-grid-video-renderer',
      'ytd-reel-item-renderer', 'ytd-channel-renderer', 'ytd-playlist-renderer', 'ytd-comment-thread-renderer',
      'yt-lockup-view-model', 'ytm-shorts-lockup-view-model-v2', 'ytm-shorts-lockup-view-model', 'ytm-video-with-context-renderer',
      'ytd-reel-video-renderer', // lecteur Shorts plein écran
      'ytm-compact-video-renderer', 'ytm-rich-item-renderer',
      'grid-shelf-view-model', 'ytd-shelf-renderer', 'ytd-reel-shelf-renderer', // étagères : testées sur leur seul titre
      'yt-page-header-renderer', 'ytd-c4-tabbed-header-renderer', 'ytd-channel-video-player-renderer', 'yt-image-banner-view-model', // page d'une chaîne
    ]],
    [/(^|\.)(x|twitter)\.com$/, ['article[data-testid="tweet"]', '[data-testid="UserCell"]', '[data-testid="trend"]']],
    [/(^|\.)facebook\.com$/, ['div[role="article"]']],
    [/(^|\.)instagram\.com$/, ['article', 'ul > div[role="button"]']],
    [/(^|\.)reddit\.com$/, ['shreddit-post', 'shreddit-comment', 'article']],
    [/(^|\.)tiktok\.com$/, ['[data-e2e="recommend-list-item-container"]', '[data-e2e="search_top-item"]', '[data-e2e="comment-level-1"]', '[data-e2e="search-user-container"]']],
    [/(^|\.)linkedin\.com$/, ['.feed-shared-update-v2', '.comments-comment-item', '.comments-comment-entity']],
    [/(^|\.)bsky\.app$/, ['[data-testid^="feedItem"]', '[data-testid^="postThreadItem"]', '[data-testid^="profileCard"]']],
    [/(^|\.)threads\.(net|com)$/, ['div[data-pressable-container="true"]']],
    [/(^|\.)news\.google\.[a-z.]+$/, ['article']],
    [/^(www\.)?google\.[a-z.]+$/, ['#rso .MjjYud', '#rso div.g', '#rso > div', 'g-inner-card', 'div[data-news-doc-id]',
      '.kp-wholepage-osrp', '.kp-wholepage', '#rhs', // panneau de connaissances (photo, âge, parti...)
      'div[data-lpage]', 'div[data-docid]', 'div.isv-r']], // vignettes de Google Images (le texte alternatif porte le nom)
  ];

  // Mode générique (tous les autres sites, ex. médias) : on remonte à la "carte" la plus proche.
  const CARD_SEL = 'article, [role="article"], li, figure';
  const BLOCK_SEL = 'p, h1, h2, h3, h4, h5, h6, a, blockquote, td, dd, dt, figcaption, label';
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'TEMPLATE', 'SVG']);
  const MAX_CARD_TEXT = 1500;

  const host = location.hostname;
  const site = SITES.find(([re]) => re.test(host));
  const SITE_SEL = site ? site[1].join(', ') : null;

  let matcher = null;
  let domains = [];
  let accounts = new Map(); // clé de compte -> nom
  let names = new Map();    // terme trouvé -> nom affiché
  let mode = 'blur';
  let active = false;

  let seen = new WeakMap();      // élément testé -> empreinte au moment du test
  let targetOf = new WeakMap();  // élément testé -> élément masqué
  const revealed = new WeakMap(); // révélés à la main -> empreinte au moment du clic
  const hits = new Set();
  const CLASSES = ['frb-hide', 'frb-blur', 'frb-veil', 'frb-rel'];

  function isRevealed(el) {
    for (let a = el; a && a !== document.body; a = a.parentElement) if (revealed.has(a)) return true;
    return false;
  }

  function mark(el, term) {
    if (!el || el === document.body || el === document.documentElement) return;
    term = names.get(term) || term;
    if (isRevealed(el)) return;
    // Déjà couvert par un bloc parent masqué : rien à faire (évite le double flou)
    if (el.parentElement && el.parentElement.closest('[data-frb]')) return;
    for (const inner of el.querySelectorAll('[data-frb]')) unmark(inner);
    el.classList.remove(...CLASSES);
    if (mode === 'hide') {
      el.classList.add('frb-hide');
    } else {
      const cs = getComputedStyle(el);
      const big = cs.display !== 'inline' && cs.display !== 'contents' && el.offsetHeight >= 48 && el.children.length > 0;
      if (big) {
        el.classList.add('frb-veil');
        if (cs.position === 'static') el.classList.add('frb-rel');
        el.setAttribute('data-frb-label', term);
      } else {
        el.classList.add('frb-blur');
      }
    }
    el.setAttribute('data-frb', term);
    if (!hits.has(el)) countHit();
    hits.add(el);
    pauseInside(el);
  }

  // Compteur local : chaque nouveau contenu masqué compte une fois, envoyé par paquets
  let newHits = 0, hitTimer = null;
  function countHit() {
    newHits++;
    if (!hitTimer) hitTimer = setTimeout(() => {
      hitTimer = null;
      const n = newHits; newHits = 0;
      try { chrome.runtime.sendMessage({ type: 'hits', n }).catch(() => {}); } catch (e) { /* contexte invalidé */ }
    }, 2000);
  }

  function unmark(el) {
    if (!el) return;
    el.classList.remove(...CLASSES);
    el.removeAttribute('data-frb');
    el.removeAttribute('data-frb-label');
    hits.delete(el);
  }

  // Liens vers un site bloqué ou vers le profil d'un compte bloqué,
  // plus la chaîne YouTube repérée par yt-main.js (attribut data-frb-ch)
  function linkHit(el) {
    if (!domains.length && !accounts.size) return null;
    if (accounts.size) {
      const tagged = el.matches('[data-frb-ch]') ? [el] : [];
      for (const t of tagged.concat([...el.querySelectorAll('[data-frb-ch]')])) {
        const n = accounts.get('youtube.com|/channel/' + t.getAttribute('data-frb-ch').toLowerCase());
        if (n) return n;
      }
    }
    const links = el.matches('a[href]') ? [el] : [];
    for (const a of links.concat([...el.querySelectorAll('a[href]')])) {
      if (domains.length) {
        const d = domainMatches(a.hostname, domains);
        if (d) return d;
      }
      if (accounts.size) {
        const k = accountKey(a.getAttribute('href'), location.href);
        const n = k && accounts.get(k);
        if (n) return n;
      }
    }
    return null;
  }

  // Texte visible + textes « cachés » utiles (alt d'image, aria-label, title)
  // textContent colle les éléments voisins (« Résultats webBardella ») et casse la détection
  // en mot entier : on joint les nœuds texte avec un espace.
  function joinedText(el) {
    const parts = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, len = 0;
    while ((n = w.nextNode())) {
      const p = n.parentElement;
      if (p && SKIP_TAGS.has(p.tagName)) continue;
      parts.push(n.data);
      len += n.data.length;
      if (len > 60000) break;
    }
    return parts.join(' ');
  }

  function textOf(el) {
    let s = joinedText(el);
    if (s.length < 4000) {
      let n = 0;
      for (const x of el.querySelectorAll('img[alt], [aria-label], a[title]')) {
        const v = x.getAttribute('alt') || x.getAttribute('aria-label') || x.getAttribute('title');
        if (v) s += ' \n ' + v;
        if (++n > 40) break;
      }
    }
    return s;
  }

  function fingerprint(el) {
    let s = el.textContent || '';
    if (s.length < 4000) for (const x of el.querySelectorAll('img[alt], [aria-label], a[title]')) s += '|' + (x.getAttribute('alt') || x.getAttribute('aria-label') || x.getAttribute('title') || '');
    if (accounts.size) for (const t of el.querySelectorAll('[data-frb-ch]')) s += '|' + t.getAttribute('data-frb-ch');
    for (const a of el.querySelectorAll('a[href]')) { s += '|' + a.getAttribute('href'); if (s.length > 20000) break; }
    return s;
  }

  // Texte propre à un élément (ses nœuds texte directs), pour les conteneurs génériques
  function ownText(el) {
    let s = '';
    for (const c of el.childNodes) if (c.nodeType === 3) s += c.data;
    return s;
  }

  function expand(el) {
    const card = el.closest(CARD_SEL);
    if (card && card !== document.body && (card.textContent || '').length <= MAX_CARD_TEXT) return card;
    return el;
  }

  // Une étagère (« Derniers Shorts de X ») n'est jugée que sur son titre,
  // sinon une seule vidéo citant un nom masquerait toute la rangée.
  // Même logique pour le panneau Google sur une personne : jugé sur son titre et sa description.
  const SHELF_SEL = 'grid-shelf-view-model, ytd-shelf-renderer, ytd-reel-shelf-renderer, .kp-wholepage-osrp, .kp-wholepage, #rhs';
  const SHELF_TITLE_SEL = 'yt-section-header-view-model, .grid-subheader, #title-container, #title, [data-attrid="title"], [data-attrid="description"], [data-attrid="subtitle"]';

  // Page d'une chaîne YouTube bloquée : toute la page est floutée (bannière, vidéo mise en avant, onglets),
  // même les vidéos dont le titre ne cite personne. Repérée par l'adresse canonique de la chaîne,
  // ou par l'en-tête de la page quand il cite un nom de la liste.
  const IS_YT = /(^|\.)youtube\.com$/.test(host);
  const YT_HEADER = 'yt-page-header-renderer, ytd-c4-tabbed-header-renderer';
  function channelTerm() {
    if (!IS_YT || !/^\/(@|channel\/|c\/|user\/)/.test(location.pathname)) return null;
    const h = document.querySelector('ytd-browse:not([hidden]) ' + YT_HEADER.split(', ').join(', ytd-browse:not([hidden]) '));
    const ht = h && matcher && matcher(joinedText(h).slice(0, 300));
    if (ht) return names.get(ht) || ht;
    if (location.pathname.startsWith('/channel/')) return accounts.get(accountKey(location.href, location.href)) || null;
    return null;
  }

  // Teste un élément ; generic = remonter à la carte englobante
  function check(el, generic) {
    if (IS_YT && !generic && el.closest('ytd-browse')) {
      const ct = channelTerm();
      if (ct && !isRevealed(el)) { seen.set(el, 'ch|' + ct); targetOf.set(el, el); mark(el, ct); return; }
    }
    if (revealed.has(el)) {
      // YouTube recycle ses éléments : une révélation ne vaut que pour le contenu révélé
      if (revealed.get(el) === fingerprint(el)) return;
      revealed.delete(el);
    }
    if (SITE_SEL && el.matches(SHELF_SEL)) {
      const t = [...el.querySelectorAll(SHELF_TITLE_SEL)].slice(0, 4).map(joinedText).join(' \n ');
      if (seen.get(el) === t) return;
      seen.set(el, t);
      const term = matcher && matcher(t);
      if (term) mark(el, term); else if (hits.has(el)) unmark(el);
      return;
    }
    const fp = fingerprint(el);
    if (seen.get(el) === fp) return;
    seen.set(el, fp);
    // Conteneur générique qui n'est pas un bloc de texte (ex. un grand <div>) :
    // on ne juge que son propre texte, sinon toute la page pourrait être masquée.
    const own = generic && !el.matches(BLOCK_SEL) && (el.textContent || '').length > 300;
    const text = own ? ownText(el) : textOf(el);
    const term = (matcher && matcher(text)) || (own ? null : linkHit(el));
    const prev = targetOf.get(el);
    if (term) {
      const t = generic ? expand(el) : el;
      if (prev && prev !== t) unmark(prev);
      targetOf.set(el, t);
      mark(t, term);
    } else if (prev) {
      unmark(prev);
      targetOf.delete(el);
    }
  }

  function inEditable(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !el || el.isContentEditable || (el.closest && el.closest('textarea, input, [contenteditable="true"]'));
  }

  function scan(root) {
    if (!active || !root) return;
    if (root.nodeType === 3) root = root.parentElement;
    if (!root || root.nodeType !== 1 || SKIP_TAGS.has(root.tagName)) return;

    if (SITE_SEL) {
      const up = root.closest(SITE_SEL);
      if (up) checkItem(up);
      for (const el of root.querySelectorAll(SITE_SEL)) checkItem(el);
      return;
    }
    genericScan(root);
  }

  // Un « bloc » de site trop gros (carrousel Google, fil de commentaires entier...) n'est pas
  // flouté d'un coup : on descend au niveau des éléments qu'il contient.
  const MAX_ITEM_TEXT = 4000;
  function checkItem(el) {
    if (!el.matches(SHELF_SEL) && (el.textContent || '').length > MAX_ITEM_TEXT) genericScan(el);
    else check(el, false);
  }

  // Générique : chaque bloc de texte, puis les liens (y compris liens image)
  function genericScan(root) {
    const blocks = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const p = n.parentElement;
      if (!p || SKIP_TAGS.has(p.tagName) || n.data.trim().length < 3) continue;
      if (inEditable(p)) continue;
      blocks.add(p.closest(BLOCK_SEL) || p);
    }
    if (root.matches('a[href]')) blocks.add(root);
    if (domains.length || accounts.size) for (const a of root.querySelectorAll('a[href]')) blocks.add(a);
    for (const b of blocks) if (b !== document.body && b !== document.documentElement) check(b, true);
  }

  // --- Observation des changements (scroll infini, SPA) ---
  const pending = new Set();
  let timer = null;
  function queue(node) {
    pending.add(node);
    if (!timer) timer = setTimeout(flush, 120);
  }
  function flush() {
    timer = null;
    const nodes = [...pending];
    pending.clear();
    for (const node of nodes) if (node.isConnected) scan(node);
    report();
  }
  // Après une mise à jour de l'extension, l'ancienne copie du script reste dans les onglets
  // ouverts sans accès à l'extension : elle s'arrête d'elle-même.
  function orphaned() {
    try { return !chrome.runtime || !chrome.runtime.id; } catch (e) { return true; }
  }
  const observer = new MutationObserver((muts) => {
    if (!active) return;
    if (orphaned()) { observer.disconnect(); active = false; return; }
    for (const m of muts) {
      if (m.type === 'characterData' || m.type === 'attributes') queue(m.target);
      else {
        if (m.target.nodeType === 1 && m.target.closest && SITE_SEL && m.target.closest(SITE_SEL)) queue(m.target);
        for (const a of m.addedNodes) if (a.nodeType === 1 || a.nodeType === 3) queue(a);
      }
    }
  });

  // Clic sur un bloc flouté = le révéler (tant que son contenu ne change pas)
  const COVER = '.frb-blur, .frb-veil';
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest && e.target.closest(COVER);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    unmark(el);
    revealed.set(el, fingerprint(el));
    report();
  }, true);

  // Pas d'aperçu vidéo au survol d'un bloc flouté (YouTube lance la vidéo en grand au survol)
  for (const type of ['mouseover', 'mouseenter', 'pointerover', 'pointerenter', 'mousemove', 'pointermove', 'focusin']) {
    document.addEventListener(type, (e) => {
      if (e.target && e.target.closest && e.target.closest(COVER)) e.stopPropagation();
    }, true);
  }

  // Une vidéo dans un bloc masqué ne doit pas se lancer (Shorts, aperçus)
  document.addEventListener('play', (e) => {
    const v = e.target;
    if (v && v.closest && v.closest('.frb-blur, .frb-veil, .frb-hide')) v.pause();
  }, true);
  function pauseInside(el) {
    for (const v of el.querySelectorAll('video')) { try { v.pause(); } catch (e) { /* ignore */ } }
  }

  let lastCount = -1;
  function count() {
    for (const el of hits) if (!el.isConnected) hits.delete(el);
    return hits.size;
  }
  function report() {
    const n = count();
    if (n === lastCount) return;
    lastCount = n;
    try { chrome.runtime.sendMessage({ type: 'count', n }).catch(() => {}); } catch (e) { /* contexte invalidé */ }
  }

  function resetAll() {
    for (const el of [...hits]) unmark(el);
    // Marques laissées par une ancienne copie du script (avant une mise à jour)
    for (const el of document.querySelectorAll('[data-frb]')) unmark(el);
    seen = new WeakMap();
    targetOf = new WeakMap();
  }

  async function load() {
    const st = await chrome.storage.local.get(['settings', 'personal', 'subscriptions']);
    const settings = { ...DEFAULTS, ...(st.settings || {}) };
    const c = collect(st);
    resetAll();
    mode = settings.mode === 'hide' ? 'hide' : 'blur';
    if (globalThis.I18N) I18N.setLang(settings.lang);
    active = settings.enabled && !isPaused(host, settings.pausedSites);
    matcher = buildMatcher(c.terms);
    domains = c.domains;
    accounts = c.accounts;
    names = c.names;
    if (!matcher && !domains.length && !accounts.size) active = false;
    if (active) {
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-frb-ch'] });
      if (document.body) scan(document.body);
      else document.addEventListener('DOMContentLoaded', () => { scan(document.body); report(); }, { once: true });
    } else {
      observer.disconnect();
    }
    report();
  }

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && (ch.settings || ch.personal || ch.subscriptions)) load();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, send) => {
    if (msg && msg.type === 'getCount') {
      const terms = [...new Set([...hits].map((el) => el.getAttribute('data-frb')).filter(Boolean))];
      send({ n: count(), terms, active, host });
    }
  });

  load();
})();
