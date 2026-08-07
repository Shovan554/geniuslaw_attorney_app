import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { fonts, radius } from '../constants/theme';
import { useAlerts } from '../contexts/AlertsContext';
import { useTheme } from '../contexts/ThemeContext';

export function AlertsBell() {
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { unreadCount } = useAlerts();

  // AppHeader renders on the Alerts screen too. Showing the bell there would
  // just push a second copy of the screen onto the stack.
  if (pathname?.includes('/alerts')) return null;

  return (
    <TouchableOpacity
      onPress={() => router.push('/(auth)/alerts')}
      style={styles.btn}
      hitSlop={12}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Alerts, ${unreadCount} unread` : 'Alerts'}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.text} />
      {unreadCount > 0 && (
        <View
          style={[
            styles.badge,
            { backgroundColor: colors.danger, borderColor: colors.background },
          ]}
        >
          <Text
            style={[styles.badgeText, { color: '#FFFFFF', fontFamily: fonts.sansBold }]}
            numberOfLines={1}
          >
            {unreadCount > 9 ? '9+' : String(unreadCount)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 13 },
});
