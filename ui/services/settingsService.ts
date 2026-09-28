import { call } from "./ipc";

export type Settings = Record<string, string>;

export const settingsService = {
  getAll: () => call<Settings>("get_settings"),
  set: (key: string, value: string) => call<void>("set_setting", { key, value }),
};
