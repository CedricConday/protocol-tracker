import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SIMPLE_MODE_KEY = 'simple_mode';

type SimpleModeContextType = {
  isSimple: boolean;
  toggleSimple: () => Promise<void>;
};

const SimpleModeContext = createContext<SimpleModeContextType>({ isSimple: false, toggleSimple: async () => {} });

export function SimpleModeProvider({ children }: { children: React.ReactNode }) {
  const [isSimple, setIsSimple] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SIMPLE_MODE_KEY).then((val) => {
      setIsSimple(val === '1');
    });
  }, []);

  const toggleSimple = useCallback(async () => {
    const next = !isSimple;
    setIsSimple(next);
    await AsyncStorage.setItem(SIMPLE_MODE_KEY, next ? '1' : '0');
  }, [isSimple]);

  return (
    <SimpleModeContext.Provider value={{ isSimple, toggleSimple }}>
      {children}
    </SimpleModeContext.Provider>
  );
}

export function useSimpleMode(): SimpleModeContextType {
  return useContext(SimpleModeContext);
}
