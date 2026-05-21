import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import { fonts, radius, spacing } from '../constants/theme';

type Props = {
  children?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  padding?: keyof typeof spacing;
};

export function Card({ children, onPress, style, padding = 'lg' }: Props) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const base: ViewStyle = {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing[padding],
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  };

  if (!onPress) {
    return <Animated.View style={[base, style]}>{children}</Animated.View>;
  }

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 18, stiffness: 220 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 14, stiffness: 180 });
        }}
        style={[base, style]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

type RowProps = {
  label: string;
  value?: string | null;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  showChevron?: boolean;
};

export function CardRow({ label, value, icon, onPress, showChevron }: RowProps) {
  const { colors } = useTheme();
  const display = value && value.length > 0 ? value : '—';
  const content = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
          <Ionicons name={icon} size={16} color={colors.accent} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={[styles.label, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}>
          {label}
        </Text>
        <Text style={[styles.value, { color: colors.text, fontFamily: fonts.sans }]} numberOfLines={3}>
          {display}
        </Text>
      </View>
      {showChevron ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 15,
    lineHeight: 20,
  },
});
