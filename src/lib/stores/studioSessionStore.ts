/**
 * StudioSessionStore — stan sesji Studio (tabs, view state, UI flags).
 *
 * Architektura MDI (Multi-Document Interface, Adobe Acrobat-style):
 * - Każdy otwarty PDF = TabState
 * - Per-tab viewState (currentPage, zoomLevel, scrollTop) — KLUCZOWE dla mental model
 *   "wróć do dokumentu tam gdzie zostawiłem"
 * - W Fazie 0: tabId === documentId (1:1 mapping). Kompleksowość N:1 odłożona.
 *
 * NIE persistowany przez Zustand persist — boot flow w StudioLayout
 * decyduje o restoracji (Recovery UX prompt). Persist tylko PdfDocumentRepository.
 */

import { create } from 'zustand';
import type { StudioToolId } from './studioStore';

export interface TabViewState {
  currentPage: number;
  zoomLevel: number;
  scrollTop: number;
}

export interface TabState {
  id: string; // tabId === documentId w Fazie 0
  documentId: string;
  name: string;
  pageCount: number | null;
  version: number;
  isDirty: boolean;
  lastEditedAt: number | null;
  viewState: TabViewState;
}

export type CombineWizardMode =
  | 'merge'
  | 'alternate-merge'
  | 'grid-combine'
  | 'repair';

interface StudioSessionState {
  tabs: TabState[];
  activeTabId: string | null;
  currentTool: StudioToolId;
  showLeftSidebar: boolean;
  showRightPanel: boolean;
  showCombineWizard: boolean;
  combineWizardMode: CombineWizardMode;
  showSettingsModal: boolean;
  syncMetadataEnabled: boolean;
  isProcessing: boolean;
  isBooting: boolean;

  // Tab management
  openTab: (
    documentId: string,
    name: string,
    pageCount: number | null,
  ) => string;
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  reorderTabs: (fromIdx: number, toIdx: number) => void;
  updateTabMeta: (
    tabId: string,
    patch: Partial<Pick<TabState, 'name' | 'pageCount' | 'version' | 'isDirty' | 'lastEditedAt'>>,
  ) => void;

  // Per-tab view state
  setCurrentPage: (page: number) => void; // operates on activeTab
  setZoom: (zoom: number) => void;
  setScrollTop: (scrollTop: number) => void;

  // UI / global
  selectTool: (tool: StudioToolId) => void;
  setProcessing: (processing: boolean) => void;
  toggleLeftSidebar: () => void;
  toggleRightPanel: () => void;
  openCombineWizard: (mode?: CombineWizardMode) => void;
  closeCombineWizard: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  setSyncMetadataEnabled: (enabled: boolean) => void;
  setBooting: (booting: boolean) => void;
  reset: () => void;
}

const DEFAULT_VIEW_STATE: TabViewState = {
  currentPage: 1,
  zoomLevel: 1.0,
  scrollTop: 0,
};

export const useStudioSessionStore = create<StudioSessionState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  currentTool: null,
  showLeftSidebar: true,
  showRightPanel: true,
  showCombineWizard: false,
  combineWizardMode: 'merge',
  showSettingsModal: false,
  syncMetadataEnabled: false,
  isProcessing: false,
  isBooting: true,

  openTab: (documentId, name, pageCount) => {
    const tabId = documentId; // 1:1 mapping w Fazie 0
    set((state) => {
      const existing = state.tabs.find((t) => t.id === tabId);
      if (existing) {
        return { activeTabId: tabId };
      }
      const newTab: TabState = {
        id: tabId,
        documentId,
        name,
        pageCount,
        version: 0,
        isDirty: false,
        lastEditedAt: null,
        viewState: { ...DEFAULT_VIEW_STATE },
      };
      return {
        tabs: [...state.tabs, newTab],
        activeTabId: state.activeTabId ?? tabId,
      };
    });
    return tabId;
  },

  closeTab: (tabId) =>
    set((state) => {
      const filtered = state.tabs.filter((t) => t.id !== tabId);
      const newActive =
        state.activeTabId === tabId
          ? (filtered[0]?.id ?? null)
          : state.activeTabId;
      return { tabs: filtered, activeTabId: newActive };
    }),

  selectTab: (tabId) => set({ activeTabId: tabId }),

  reorderTabs: (fromIdx, toIdx) =>
    set((state) => {
      if (
        fromIdx < 0 ||
        fromIdx >= state.tabs.length ||
        toIdx < 0 ||
        toIdx >= state.tabs.length
      )
        return state;
      const next = [...state.tabs];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { tabs: next };
    }),

  updateTabMeta: (tabId, patch) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
    })),

  setCurrentPage: (page) =>
    set((state) => {
      if (!state.activeTabId) return state;
      const clamped = Math.max(1, page);
      return {
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? { ...t, viewState: { ...t.viewState, currentPage: clamped } }
            : t,
        ),
      };
    }),

  setZoom: (zoom) =>
    set((state) => {
      if (!state.activeTabId) return state;
      const clamped = Math.max(0.25, Math.min(4.0, zoom));
      return {
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? { ...t, viewState: { ...t.viewState, zoomLevel: clamped } }
            : t,
        ),
      };
    }),

  setScrollTop: (scrollTop) =>
    set((state) => {
      if (!state.activeTabId) return state;
      return {
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? { ...t, viewState: { ...t.viewState, scrollTop } }
            : t,
        ),
      };
    }),

  selectTool: (tool) => set({ currentTool: tool }),
  setProcessing: (processing) => set({ isProcessing: processing }),
  toggleLeftSidebar: () =>
    set((state) => ({ showLeftSidebar: !state.showLeftSidebar })),
  toggleRightPanel: () =>
    set((state) => ({ showRightPanel: !state.showRightPanel })),
  openCombineWizard: (mode = 'merge') =>
    set({ showCombineWizard: true, combineWizardMode: mode }),
  closeCombineWizard: () =>
    set({ showCombineWizard: false, combineWizardMode: 'merge' }),
  openSettingsModal: () => set({ showSettingsModal: true }),
  closeSettingsModal: () => set({ showSettingsModal: false }),
  setSyncMetadataEnabled: (enabled) => set({ syncMetadataEnabled: enabled }),
  setBooting: (booting) => set({ isBooting: booting }),

  reset: () =>
    set({
      tabs: [],
      activeTabId: null,
      currentTool: null,
      showCombineWizard: false,
      showSettingsModal: false,
      isProcessing: false,
    }),
}));

// ---- Selectors ----

export const selectActiveTab = (
  state: StudioSessionState,
): TabState | null => {
  if (!state.activeTabId) return null;
  return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
};

export const selectActiveTabViewState = (
  state: StudioSessionState,
): TabViewState => {
  const tab = selectActiveTab(state);
  return tab?.viewState ?? DEFAULT_VIEW_STATE;
};

export const selectCurrentPage = (state: StudioSessionState): number =>
  selectActiveTabViewState(state).currentPage;

export const selectZoomLevel = (state: StudioSessionState): number =>
  selectActiveTabViewState(state).zoomLevel;

export const selectActiveTabId = (state: StudioSessionState): string | null =>
  state.activeTabId;

export const selectTabs = (state: StudioSessionState): TabState[] => state.tabs;

export const selectAnyDirty = (state: StudioSessionState): boolean =>
  state.tabs.some((t) => t.isDirty);
