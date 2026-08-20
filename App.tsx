import { StatusBar } from 'expo-status-bar';
import { Platform, StatusBar as RNStatusBar, View } from 'react-native';

import { Screen } from './src/ui/Screen';
import { useTheme } from './src/ui/theme';

/**
 * Корень приложения: тема, отступ под системную строку и единственный экран.
 * SafeAreaView в react-native объявлен устаревшим, а тащить safe-area-context
 * ради одного отступа дороже, чем прочитать высоту строки состояния.
 */
export default function App() {
  const theme = useTheme();
  const topInset = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.background, paddingTop: topInset }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Screen />
    </View>
  );
}
