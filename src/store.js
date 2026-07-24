import { DEFAULT_MEMBERS, DEFAULT_TASKS, DEFAULT_SETTINGS } from "./data.js";

const KEY = "foyer-state-v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        members: s.members ?? DEFAULT_MEMBERS,
        tasks: s.tasks ?? DEFAULT_TASKS,
        settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
        history: s.history ?? [],           // {id, taskId, memberId, pts, ts}
        weekStart: s.weekStart ?? Date.now(),
        rev: s.rev ?? 0,
      };
    }
  } catch (e) {
    console.error("Lecture impossible, valeurs par défaut utilisées", e);
  }
  return {
    members: DEFAULT_MEMBERS,
    tasks: DEFAULT_TASKS,
    settings: DEFAULT_SETTINGS,
    history: [],
    weekStart: Date.now(),
    rev: 0,
  };
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Sauvegarde impossible", e);
  }
}
