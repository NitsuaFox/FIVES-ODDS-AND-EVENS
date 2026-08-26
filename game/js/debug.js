// Lightweight debug logging utility.
//
// Debug logging is ON by default so that gameplay/AI/UI issues can be copy-pasted
// straight from the browser console for troubleshooting. Toggle it with:
//   - URL query:      ?debug=0  (disable) / ?debug=1 (enable)
//   - Console:        FOE.setDebug(false)
//   - In-game:        press the `d` key
// The preference is remembered in localStorage.

const STORAGE_KEY = 'FOE_DEBUG';

function readInitial() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('debug')) {
      const on = params.get('debug') !== '0';
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
      return on;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return true; // default ON
    return stored !== '0';
  } catch {
    return true;
  }
}

const state = { enabled: readInitial() };

export function setDebug(on) {
  state.enabled = !!on;
  try {
    localStorage.setItem(STORAGE_KEY, state.enabled ? '1' : '0');
  } catch {
    /* ignore storage errors */
  }
  // eslint-disable-next-line no-console
  console.log(`[FOE:debug] logging ${state.enabled ? 'ENABLED' : 'DISABLED'}`);
  return state.enabled;
}

export function isDebug() {
  return state.enabled;
}

export function toggleDebug() {
  return setDebug(!state.enabled);
}

function ts() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

export function createLogger(category) {
  const prefix = `[FOE:${category}]`;
  return {
    log: (...args) => {
      if (state.enabled) console.log(prefix, ts(), ...args);
    },
    info: (...args) => {
      if (state.enabled) console.info(prefix, ts(), ...args);
    },
    warn: (...args) => {
      if (state.enabled) console.warn(prefix, ts(), ...args);
    },
    // Errors always print, even with debug disabled.
    error: (...args) => console.error(prefix, ts(), ...args),
    group: (label) => {
      if (state.enabled) console.groupCollapsed(prefix, ts(), label);
    },
    groupEnd: () => {
      if (state.enabled) console.groupEnd();
    },
  };
}
