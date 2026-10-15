import { create } from 'zustand';

/**
 * Estado de interfaz del shell: modo de color y estado del menú lateral.
 *
 * Es estado de cliente puro, así que vive en Zustand. `localStorage` es la
 * caché del navegador: la usa la pantalla de acceso y el arranque, antes de
 * conocer al usuario. El modo de color además sigue al usuario entre
 * dispositivos (Ajustes 1, RN-AJ1.17): `useThemePreferenceSync` aplica el
 * guardado en el servidor al iniciar sesión y guarda cada cambio manual. El
 * menú lateral minificado sigue siendo sólo del navegador.
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
  /** Cuántas veces el usuario cambió el tema con el botón (no cuenta las aplicaciones del servidor). */
  manualThemeChanges: number;
  sidebarMini: boolean;
  sidebarOpenMobile: boolean;
  /** Cambio manual: aplica al instante; el guardado en el servidor lo lanza `useThemePreferenceSync`. */
  toggleThemeMode: () => void;
  /** Aplica un modo sin contarlo como cambio manual (p. ej. el guardado en el servidor). */
  setThemeMode: (mode: ThemeMode) => void;
  toggleSidebarMini: () => void;
  setSidebarOpenMobile: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  themeMode: readStoredTheme() ?? (prefersDark() ? 'dark' : 'light'),
  manualThemeChanges: 0,
  sidebarMini: readStoredSidebarMini(),
  sidebarOpenMobile: false,

  setThemeMode: (mode) => {
    persist(THEME_STORAGE_KEY, mode);
    set({ themeMode: mode });
  },

  toggleThemeMode: () => {
    const next: ThemeMode = get().themeMode === 'dark' ? 'light' : 'dark';
    persist(THEME_STORAGE_KEY, next);
    set({ themeMode: next, manualThemeChanges: get().manualThemeChanges + 1 });
  },

  toggleSidebarMini: () => {
    const next = !get().sidebarMini;
    persist(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
    set({ sidebarMini: next });
  },

  setSidebarOpenMobile: (open) => set({ sidebarOpenMobile: open }),
}));
