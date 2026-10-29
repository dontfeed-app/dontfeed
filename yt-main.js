/* Don't Feed - YouTube, contexte de la page.
   Les vignettes Shorts n'affichent pas leur chaîne : elle n'existe que dans les données JSON
   que YouTube charge (ytInitialData puis les réponses /youtubei/). Ce script relève, pour chaque
   vidéo, l'identifiant de sa chaîne (UC...) et le pose en attribut data-frb-ch sur ses liens.
   Le content script compare ensuite cet identifiant aux chaînes bloquées.
   Rien n'est envoyé nulle part, et ce script ne lit ni ne modifie rien d'autre. */
(() => {
  'use strict';
  if (window.__frbYt) return;
  window.__frbYt = true;

  const chanOf = new Map(); // videoId -> UC...
  const UC = /UC[\w-]{22}/;

  function fromParams(p) {
    try {
      const b = atob(decodeURIComponent(p).replace(/-/g, '+').replace(/_/g, '/'));
      const m = b.match(UC);
      return m ? m[0] : null;
    } catch (e) { return null; }
  }

  // Cherche la chaîne d'un "renderer" (vidéo, Short...) sans s'égarer dans les sous-listes
  function ownerOf(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 8) return null;
    if (typeof obj.browseId === 'string' && UC.test(obj.browseId)) return obj.browseId.match(UC)[0];
    if (obj.reelWatchEndpoint && obj.reelWatchEndpoint.params) {
      const c = fromParams(obj.reelWatchEndpoint.params);
      if (c) return c;
    }
    for (const k in obj) {
      if (k === 'contents' || k === 'items') continue;
      const c = ownerOf(obj[k], depth + 1);
      if (c) return c;
    }
    return null;
  }
  function videoIdOf(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 8) return null;
    if (typeof obj.videoId === 'string' && /^[\w-]{11}$/.test(obj.videoId)) return obj.videoId;
    if (typeof obj.contentId === 'string' && /^[\w-]{11}$/.test(obj.contentId)) return obj.contentId;
    for (const k in obj) {
      const v = videoIdOf(obj[k], depth + 1);
      if (v) return v;
    }
    return null;
  }

  const RENDERERS = /^(shortsLockupViewModel|reelItemRenderer|videoRenderer|compactVideoRenderer|gridVideoRenderer|richItemRenderer|lockupViewModel|playlistVideoRenderer|reelWatchEndpoint)$/;

  function walk(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 60) return;
    if (Array.isArray(node)) { for (const x of node) walk(x, depth + 1); return; }
    // Réponse du lecteur (chaque Short balayé déclenche /player) : videoDetails donne la chaîne
    const vd = node.videoDetails;
    if (vd && typeof vd.videoId === 'string' && typeof vd.channelId === 'string' && UC.test(vd.channelId)) {
      chanOf.set(vd.videoId, vd.channelId);
    }
    for (const k in node) {
      const v = node[k];
      if (RENDERERS.test(k) && v && typeof v === 'object') {
        const id = videoIdOf(v);
        const ch = id && ownerOf(v);
        if (id && ch) chanOf.set(id, ch);
      }
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
    scheduleTag();
  }

  // --- Pose des attributs sur les liens ---
  let tagTimer = null;
  function scheduleTag() {
    if (!tagTimer) tagTimer = setTimeout(tag, 150);
  }
  function idFromHref(href) {
    const m = href && (href.match(/\/shorts\/([\w-]{11})/) || href.match(/[?&]v=([\w-]{11})/));
    return m ? m[1] : null;
  }
  function tag() {
    tagTimer = null;
    if (!document.documentElement) return;
    for (const a of document.querySelectorAll('a[href*="/shorts/"], a[href*="watch?v="]')) {
      const id = idFromHref(a.getAttribute('href'));
      setCh(a, id && chanOf.get(id));
    }
    // Lecteur Shorts plein écran : la vidéo en cours est dans l'URL
    const cur = idFromHref(location.pathname + location.search);
    const r = document.querySelector('ytd-reel-video-renderer[is-active]');
    if (r) setCh(r, cur && chanOf.get(cur));
    for (const old of document.querySelectorAll('ytd-reel-video-renderer[data-frb-ch]:not([is-active])')) setCh(old, null);
  }
  // YouTube réutilise ses éléments : un attribut périmé doit disparaître
  function setCh(el, ch) {
    if (ch) { if (el.getAttribute('data-frb-ch') !== ch) el.setAttribute('data-frb-ch', ch); }
    else if (el.hasAttribute('data-frb-ch')) el.removeAttribute('data-frb-ch');
  }

  // --- Sources de données ---
  function readInitial() {
    try { if (window.ytInitialData) walk(window.ytInitialData); } catch (e) { /* ignore */ }
    try { if (window.ytInitialPlayerResponse) walk(window.ytInitialPlayerResponse); } catch (e) { /* ignore */ }
  }

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.includes('/youtubei/v1/')) {
        p.then((res) => res.clone().json().then(walk).catch(() => {})).catch(() => {});
      }
    } catch (e) { /* ignore */ }
    return p;
  };

  // Injecté dans un onglet déjà ouvert (installation, mise à jour) : lire tout de suite
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', readInitial);
  else readInitial();
  window.addEventListener('yt-navigate-finish', () => { readInitial(); scheduleTag(); });
  new MutationObserver(scheduleTag).observe(document.documentElement || document, { childList: true, subtree: true });
})();
