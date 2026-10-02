import { create } from 'zustand';

/**
 * Estado de interfaz del shell: modo de color y estado del menú lateral.
 *
 * Es estado de cliente puro, así que vive en Zustand. Se persiste en
 * `localStorage` porque es una preferencia por navegador, no un dato de
 * negocio: si la preferencia debe seguir al usuario entre dispositivos, se
 * mueve a `UserPreference` en la base de datos (ver docs/database).
 */

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'app-theme';
const SIDEBAR_STORAGE_KEY = 'app-sidebar-mini';

function readStoredTheme(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    // Modo privado o almacenamiento bloqueado: se cae a la preferencia del sistema.
    return null;
  }
}

function prefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredSidebarMini(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function persist(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // La preferencia se pierde al recargar; no es motivo para romper la UI.
  }
}

interface UiState {
  themeMode: ThemeMode;
  sidebarMini: boolean;
  sidebarOpenMobile: boolean;
  toggleThemeMode: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleSidebarMini: () => void;
  setSidebarOpenMobile: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  themeMode: readStoredTheme() ?? (prefersDark() ? 'dark' : 'light'),
  sidebarMini: readStoredSidebarMini(),
  sidebarOpenMobile: false,

  setThemeMode: (mode) => {
    persist(THEME_STORAGE_KEY, mode);
    set({ themeMode: mode });
  },

  toggleThemeMode: () => {
    const next: ThemeMode = get().themeMode === 'dark' ? 'light' : 'dark';
    persist(THEME_STORAGE_KEY, next);
    set({ themeMode: next });
  },

  toggleSidebarMini: () => {
    const next = !get().sidebarMini;
    persist(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
    set({ sidebarMini: next });
  },

  setSidebarOpenMobile: (open) => set({ sidebarOpenMobile: open }),
}));
