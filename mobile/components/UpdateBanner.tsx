import { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const STORE_URL = Platform.select({
  ios: process.env.EXPO_PUBLIC_IOS_STORE_URL ?? '',
  android: process.env.EXPO_PUBLIC_ANDROID_STORE_URL ?? '',
  default: process.env.EXPO_PUBLIC_IOS_STORE_URL ?? '',
});
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import { fonts, radius, spacing } from '../constants/theme';
import type { AppColors } from '../constants/theme';
import { useAppVersion } from '../hooks/useAppVersion';

export function UpdateBanner() {
  const { colors } = useTheme();
  const { isOutdated, latestVersion, currentVersion } = useAppVersion();
  const [dismissed, setDismissed] = useState(false);

  const visible = isOutdated && !dismissed;

  const cardY = useSharedValue(80);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      cardY.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
      cardOpacity.value = withTiming(1, { duration: 320 });
    } else {
      cardY.value = 80;
      cardOpacity.value = 0;
    }
  }, [visible, cardY, cardOpacity]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardY.value }],
    opacity: cardOpacity.value,
  }));

  const s = styles(colors);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => setDismissed(true)}
      statusBarTranslucent
    >
      <Pressable style={s.backdrop} onPress={() => setDismissed(true)}>
        <Pressable onPress={() => {}}>
          <Animated.View style={[s.card, cardStyle]}>
            <Image
              source={require('../assets/logo.png')}
              style={s.logo}
              resizeMode="contain"
            />

            <Text style={s.title}>Update Available</Text>

            <Text style={s.body}>
              A newer version of GeniusLaw Attorney is available. Please update
              for the best experience.
            </Text>

            <View style={s.versionRow}>
              <View style={s.versionPill}>
                <Text style={s.versionPillLabel}>Installed</Text>
                <Text style={s.versionPillValue}>{currentVersion || '—'}</Text>
              </View>
              <Text style={s.versionArrow}>→</Text>
              <View style={[s.versionPill, s.versionPillLatest]}>
                <Text style={s.versionPillLabel}>Latest</Text>
                <Text style={[s.versionPillValue, { color: colors.accent }]}>
                  {latestVersion || '—'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => { if (STORE_URL) Linking.openURL(STORE_URL).catch(() => {}); }}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>Update Now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => setDismissed(true)}
              activeOpacity={0.7}
            >
              <Text style={s.secondaryBtnText}>Remind me later</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = (colors: AppColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 28,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 20,
      elevation: 8,
      width: '88%',
      maxWidth: 360,
      alignSelf: 'center',
    },
    logo: {
      width: 120,
      height: 72,
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    title: {
      fontFamily: fonts.heading,
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    versionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.lg,
    },
    versionPill: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      alignItems: 'center',
      minWidth: 96,
    },
    versionPillLatest: {
      borderColor: colors.accentBorder,
      backgroundColor: colors.accentTint,
    },
    versionPillLabel: {
      fontSize: 10,
      letterSpacing: 1,
      color: colors.textSubtle,
      textTransform: 'uppercase',
      marginBottom: 2,
      fontFamily: fonts.sansMedium,
    },
    versionPillValue: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    versionArrow: {
      marginHorizontal: spacing.sm,
      fontSize: 18,
      color: colors.textSubtle,
    },
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      alignSelf: 'stretch',
    },
    primaryBtnText: {
      fontSize: 13,
      letterSpacing: 1,
      color: '#0A1628',
      fontFamily: fonts.sansBold,
      textTransform: 'uppercase',
    },
    secondaryBtn: {
      paddingVertical: 12,
      alignItems: 'center',
      alignSelf: 'stretch',
      marginTop: spacing.xs,
    },
    secondaryBtnText: {
      fontSize: 13,
      color: colors.textMuted,
      fontFamily: fonts.sansMedium,
    },
  });
