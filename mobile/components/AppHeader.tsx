import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { fonts, spacing } from '../constants/theme';
import { MenuDrawer } from './MenuDrawer';

type Props = {
  title: string;
  eyebrow?: string;
  onBack?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
};

export function AppHeader({ title, eyebrow, onBack, onRefresh, refreshing }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            hitSlop={12}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.titleWrap}>
          {eyebrow ? (
            <Text
              style={[
                styles.eyebrow,
                { color: colors.textMuted, fontFamily: fonts.sansMedium },
              ]}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
        <View style={styles.actions}>
          {onRefresh ? (
            <TouchableOpacity
              onPress={onRefresh}
              disabled={refreshing}
              style={styles.iconBtn}
              hitSlop={12}
              activeOpacity={0.7}
              accessibilityLabel="Refresh"
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Ionicons name="refresh" size={22} color={colors.text} />
              )}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => setOpen(true)}
            style={styles.iconBtn}
            hitSlop={12}
            activeOpacity={0.7}
          >
            <Ionicons name="menu" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      <MenuDrawer visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    marginRight: spacing.xs,
  },
});
