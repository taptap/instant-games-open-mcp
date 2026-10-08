export const consoleThemeStyles = String.raw`
:root{color-scheme:dark;--bg:#1b1e1f;--top:#232728;--border:#363b3c;--text:#ecefee;--muted:#9ca6a4;--yellow:#f5dc56;--on-yellow:#252820;--accent:#f5dc56;--green:#78d4ad;--red:#f08b85;--soft:#303b36;--code:#16191a;--selection:rgba(245,220,86,.18);--selection-soft:rgba(245,220,86,.08)}
:root[data-theme="light"]{color-scheme:light;--bg:#fff;--top:#f3f5f4;--border:#dce2de;--text:#252e29;--muted:#64716a;--accent:#76600b;--green:#176c50;--red:#b3352c;--soft:#edf4ef;--code:#f5f7f6;--selection:rgba(163,127,18,.18);--selection-soft:rgba(163,127,18,.08)}
`;

export const consoleThemeScript = String.raw`
(function () {
  'use strict';
  const storageKey = 'maker-console-theme';
  const eventName = 'maker-console:theme';
  let host;
  try {
    if (window.parent !== window && window.parent.location.origin === location.origin) {
      host = window.parent.MakerConsole;
    }
  } catch (_) {}
  function getTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }
  function applyTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') return;
    const changed = getTheme() !== theme;
    document.documentElement.dataset.theme = theme;
    const toggle = document.getElementById('theme');
    if (toggle) toggle.checked = theme === 'dark';
    if (changed) window.dispatchEvent(new CustomEvent(eventName, {
      detail: Object.freeze({protocolVersion: 1, theme})
    }));
  }
  function setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') return false;
    if (host) return host.setTheme(theme);
    applyTheme(theme);
    try { localStorage.setItem(storageKey, theme); } catch (_) { return false; }
    return true;
  }
  function onThemeChange(listener) {
    const handler = event => listener(event.detail.theme);
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }
  window.MakerConsole = Object.freeze({getTheme, setTheme, onThemeChange});
  if (host) {
    applyTheme(host.getTheme());
    let unsubscribe = host.onThemeChange(applyTheme);
    window.addEventListener('pagehide', () => { unsubscribe(); });
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      applyTheme(host.getTheme());
      unsubscribe = host.onThemeChange(applyTheme);
    });
  } else {
    let initial = 'dark';
    try { initial = localStorage.getItem(storageKey) || initial; } catch (_) {}
    applyTheme(initial);
    window.addEventListener('storage', event => {
      if (event.key === storageKey || event.key === null) applyTheme(event.newValue || 'dark');
    });
  }
})();
`;
