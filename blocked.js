(async () => {
  try {
    const { settings } = await chrome.storage.local.get('settings');
    I18N.setLang(settings && settings.lang);
  } catch (e) { /* langue du navigateur */ }
  I18N.apply();
  document.title = I18N.t('blocked_doc');
  const d = new URLSearchParams(location.search).get('d');
  document.getElementById('domain').textContent = d || I18N.t('this_site');
  document.getElementById('back').onclick = () => (history.length > 1 ? history.back() : window.close());
  document.getElementById('options').onclick = () => { location.href = chrome.runtime.getURL('options.html#sites'); };
})();
