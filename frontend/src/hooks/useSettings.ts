import { useSyncExternalStore } from "react";
import {
  type AppSettings,
  getSettings,
  isConfigured,
  saveSettings,
  subscribe,
} from "../lib/settingsStore";

/**
 * Reactive view of the connection settings. Components re-render when the
 * operator changes settings (the store notifies subscribers).
 */
export function useSettings(): {
  settings: AppSettings;
  configured: boolean;
  save: (next: Partial<AppSettings>) => void;
} {
  const settings = useSyncExternalStore(subscribe, getSettings, getSettings);
  return {
    settings,
    configured: isConfigured(settings),
    save: saveSettings,
  };
}
