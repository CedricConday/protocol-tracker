import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FONT_SCALE_KEY = '@coimbra:font_scale';

type FontScaleContextType = {
  fontScale: number;
  setFontScale: (scale: number) => Promise<void>;
};

const FontScaleContext = createContext<FontScaleContextType>({
  fontScale: 1.0,
  setFontScale: async () => {},
});

export const FontScaleProvider = ({ children }: { children: ReactNode }) => {
  const [fontScale, setFontScaleValue] = useState(1.0);

  useEffect(() => {
    AsyncStorage.getItem(FONT_SCALE_KEY).then((scale) => {
      if (scale) setFontScaleValue(parseFloat(scale));
    });
  }, []);

  const setFontScale = async (scale: number) => {
    await AsyncStorage.setItem(FONT_SCALE_KEY, scale.toString());
    setFontScaleValue(scale);
  };

  return (
    <FontScaleContext.Provider value={{ fontScale, setFontScale }}>
      {children}
    </FontScaleContext.Provider>
  );
};

export const useFontScale = () => useContext(FontScaleContext);
