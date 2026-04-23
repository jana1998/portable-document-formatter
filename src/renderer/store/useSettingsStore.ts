import { create } from 'zustand';

export type LLMBackend = 'local' | 'anthropic' | 'openai';

interface SettingsState {
  backend: LLMBackend;
  setBackend: (backend: LLMBackend) => void;
}

const STORAGE_KEY = 'pdf-formatter:settings:v1';

function loadInitial(): { backend: LLMBackend } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { backend: 'anthropic' };
    const parsed = JSON.parse(raw) as { backend?: LLMBackend };
    if (parsed.backend === 'local' || parsed.backend === 'anthropic' || parsed.backend === 'openai') {
      return { backend: parsed.backend };
    }
  } catch {
    // ignore
  }
  return { backend: 'anthropic' };
}

function persist(state: { backend: LLMBackend }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadInitial(),
  setBackend: (backend) => {
    set({ backend });
    persist({ backend: get().backend });
  },
}));
