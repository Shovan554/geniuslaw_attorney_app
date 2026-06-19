import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, radius, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export function TestCallEntry() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/(auth)/pronto-test' as never)}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: colors.accentBorder, backgroundColor: colors.accentTint, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name="call-outline" size={20} color={colors.accent} />
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
          Try a test call
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted, fontFamily: fonts.sans }]}>
          See exactly how a Pronto call works — no client involved.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  textWrap: { flex: 1 },
  title: { fontSize: 15 },
  sub: { fontSize: 12, marginTop: 2 },
});
