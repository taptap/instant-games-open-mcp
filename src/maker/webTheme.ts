export const consoleThemeStyles = String.raw`
:root{color-scheme:dark;--bg:#111215;--top:#16171b;--surface:rgba(24,25,30,.74);--surface-alt:rgba(20,21,26,.68);--surface-solid:#1b1c21;--border:rgba(255,255,255,.08);--border-strong:rgba(255,255,255,.14);--text:#eceef2;--muted:#9398a4;--muted-dim:#616673;--primary:#00b8a6;--on-primary:#ffffff;--accent:#22b8aa;--brand-maker:#8184e8;--ai:#8b8ff8;--warning:#e5a93c;--green:#38b882;--red:#e56b6f;--soft:rgba(255,255,255,.055);--soft-hover:rgba(255,255,255,.095);--code:rgba(15,16,20,.92);--selection:rgba(255,255,255,.09);--selection-soft:rgba(255,255,255,.045);--track:#121317;--track-active:#262830;--focus-ring:rgba(255,255,255,.28);--scrollbar-thumb:rgba(255,255,255,.16);--scrollbar-thumb-hover:rgba(255,255,255,.30);--shadow-dialog:0 24px 64px rgba(0,0,0,.58);--shadow-menu:0 12px 32px rgba(0,0,0,.52);--radius-xs:6px;--radius-sm:8px;--radius-md:10px;--radius-lg:14px;--radius-pill:999px}
:root[data-theme="light"]{color-scheme:light;--bg:#f6f7f9;--top:#eff1f5;--surface:rgba(255,255,255,.78);--surface-alt:rgba(248,249,251,.72);--surface-solid:#ffffff;--border:rgba(15,23,42,.08);--border-strong:rgba(15,23,42,.15);--text:#14171f;--muted:#5c6473;--muted-dim:#8d96a6;--primary:#00b0a0;--on-primary:#ffffff;--accent:#0d8f82;--brand-maker:#4d4dad;--ai:#6366f1;--warning:#b87400;--green:#16805a;--red:#cf3644;--soft:rgba(15,23,42,.045);--soft-hover:rgba(15,23,42,.08);--code:rgba(250,251,253,.94);--selection:rgba(15,23,42,.075);--selection-soft:rgba(15,23,42,.04);--track:#e6e9ef;--track-active:#ffffff;--focus-ring:rgba(15,23,42,.22);--scrollbar-thumb:rgba(15,23,42,.18);--scrollbar-thumb-hover:rgba(15,23,42,.34);--shadow-dialog:0 24px 60px rgba(15,23,42,.14);--shadow-menu:0 12px 30px rgba(15,23,42,.14);--radius-xs:6px;--radius-sm:8px;--radius-md:10px;--radius-lg:14px;--radius-pill:999px}
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
