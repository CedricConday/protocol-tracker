import { createContext, useContext } from 'react';

const AppResetContext = createContext<() => void>(() => {});

export const AppResetProvider = AppResetContext.Provider;

export function useAppReset(): () => void {
  return useContext(AppResetContext);
}
