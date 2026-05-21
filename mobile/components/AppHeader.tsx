import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { fonts, spacing } from '../constants/theme';
import { MenuDrawer } from './MenuDrawer';

type Props = {
  title: string;
  eyebrow?: string;
};

export function AppHeader({ title, eyebrow }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <View style={styles.header}>
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
        <TouchableOpacity
          onPress={() => setOpen(true)}
          style={styles.menuBtn}
          hitSlop={12}
          activeOpacity={0.7}
        >
          <Ionicons name="menu" size={26} color={colors.text} />
        </TouchableOpacity>
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
  menuBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
