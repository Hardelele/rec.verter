import { StatusBar } from 'expo-status-bar';
import { Platform, StatusBar as RNStatusBar, View } from 'react-native';

import { Screen } from './src/ui/Screen';
import { useTheme } from './src/ui/theme';

/**
 * Корень приложения: тема, отступы под системные панели и единственный экран.
 * SafeAreaView в react-native объявлен устаревшим, а тащить safe-area-context
 * ради двух чисел дороже, чем взять их здесь.
 */

/**
 * Нижняя панель. Высоту строки состояния система отдаёт в JS
 * (`StatusBar.currentHeight`), высоту нижней панели — нет, а `Dimensions`
 * её не выдаёт: с Android 15 приложение обязано рисоваться под системными
 * панелями, поэтому `screen` и `window` совпадают и разницы, из которой её
 * можно было бы вычислить, попросту не существует.
 *
 * 24 dp — высота жестовой полосы, заданная самой системой. Меньше нельзя:
 * при крупном шрифте под неё уходит главная кнопка. Больше (48 dp под
 * трёхкнопочную навигацию) резервировать не стали — экран и так просторный,
 * а до кнопки в этом случае остаётся собственный отступ прокрутки.
 */
const BOTTOM_BAR = 24;

export default function App() {
  const theme = useTheme();
  const android = Platform.OS === 'android';
  const topInset = android ? (RNStatusBar.currentHeight ?? 0) : 0;
  const bottomInset = android ? BOTTOM_BAR : 0;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.background,
        paddingTop: topInset,
        paddingBottom: bottomInset,
      }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Screen />
    </View>
  );
}
