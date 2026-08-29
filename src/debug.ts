const STORAGE_KEY = 'FOE_DEBUG';

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('debug')) {
      const enabled = params.get('debug') !== '0';
      window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
      return enabled;
    }
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

const state = { enabled: readInitial() };

export function setDebug(enabled: boolean): boolean {
  state.enabled = Boolean(enabled);
  try {
    window.localStorage.setItem(STORAGE_KEY, state.enabled ? '1' : '0');
  } catch {
    // Storage can be unavailable in embedded or privacy-restricted browsers.
  }
  console.info(`[FOE:debug] logging ${state.enabled ? 'enabled' : 'disabled'}`);
  return state.enabled;
}

export const isDebug = (): boolean => state.enabled;
export const toggleDebug = (): boolean => setDebug(!state.enabled);

function timestamp(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

export interface Logger {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  group: (label: string) => void;
  groupEnd: () => void;
}

export function createLogger(category: string): Logger {
  const prefix = `[FOE:${category}]`;
  return {
    log: (...args) => state.enabled && console.log(prefix, timestamp(), ...args),
    info: (...args) => state.enabled && console.info(prefix, timestamp(), ...args),
    warn: (...args) => state.enabled && console.warn(prefix, timestamp(), ...args),
    error: (...args) => console.error(prefix, timestamp(), ...args),
    group: (label) => state.enabled && console.groupCollapsed(prefix, timestamp(), label),
    groupEnd: () => state.enabled && console.groupEnd(),
  };
}
