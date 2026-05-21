import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { signOut } from '../lib/auth';

const { width: SCREEN_W } = Dimensions.get('window');
const DRAWER_W = Math.min(SCREEN_W * 0.78, 320);

type Props = {
  visible: boolean;
  onClose: () => void;
};

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type NavItem = {
  label: string;
  icon: IoniconsName;
  path: '/(auth)/dashboard' | '/(auth)/cases' | '/(auth)/clients' | '/(auth)/messages' | '/(auth)/calls' | '/(auth)/profile';
  match: string;
};

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: 'grid-outline', path: '/(auth)/dashboard', match: '/dashboard' },
  { label: 'Cases', icon: 'briefcase-outline', path: '/(auth)/cases', match: '/cases' },
  { label: 'My Clients', icon: 'people-outline', path: '/(auth)/clients', match: '/clients' },
  { label: 'Messages', icon: 'chatbubbles-outline', path: '/(auth)/messages', match: '/messages' },
  { label: 'Calls', icon: 'call-outline', path: '/(auth)/calls', match: '/calls' },
];

const PROFILE_ITEM: NavItem = {
  label: 'Profile',
  icon: 'person-outline',
  path: '/(auth)/profile',
  match: '/profile',
};

export function MenuDrawer({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const translate = useSharedValue(DRAWER_W);
  const overlay = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translate.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
      overlay.value = withTiming(1, { duration: 260 });
    } else {
      translate.value = withTiming(DRAWER_W, { duration: 220, easing: Easing.in(Easing.cubic) });
      overlay.value = withTiming(0, { duration: 220 });
    }
  }, [visible, translate, overlay]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value }],
  }));
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlay.value,
  }));

  const close = () => onClose();

  const navigate = (path: NavItem['path']) => {
    close();
    router.replace(path);
  };

  const handleSignOut = async () => {
    close();
    await signOut();
    router.replace('/login');
  };

  const renderItem = (item: NavItem) => {
    const active = pathname?.includes(item.match) ?? false;
    return (
      <Pressable
        key={item.label}
        onPress={() => navigate(item.path)}
        style={({ pressed }) => [
          styles.item,
          {
            backgroundColor: active ? colors.card : 'transparent',
            borderColor: active ? colors.accentBorder : 'transparent',
          },
          pressed && !active && { backgroundColor: colors.card },
        ]}
        android_ripple={{ color: colors.card }}
      >
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: active ? colors.accentTint : 'transparent',
              borderColor: active ? colors.accentBorder : colors.cardBorder,
            },
          ]}
        >
          <Ionicons
            name={item.icon}
            size={18}
            color={active ? colors.accent : colors.textMuted}
          />
        </View>
        <Text
          style={[
            styles.itemLabel,
            {
              color: active ? colors.text : colors.textMuted,
              fontFamily: active ? fonts.sansBold : fonts.sansSemiBold,
            },
          ]}
        >
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[styles.overlay, { backgroundColor: colors.overlay }, overlayStyle]}>
          <Pressable style={styles.overlayPress} onPress={close} />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            {
              width: DRAWER_W,
              backgroundColor: colors.surface,
              borderLeftColor: colors.cardBorder,
            },
            drawerStyle,
          ]}
        >
          <View
            style={[
              styles.flex,
              {
                paddingTop: insets.top,
                paddingRight: insets.right,
                paddingBottom: insets.bottom,
              },
            ]}
          >
            <View style={styles.logoWrap}>
              <Image
                source={require('../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

            <View style={styles.items}>
              {NAV.map(renderItem)}
            </View>

            <View style={styles.spacer} />

            <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

            <View style={styles.items}>
              {renderItem(PROFILE_ITEM)}

              <Pressable
                onPress={handleSignOut}
                style={({ pressed }) => [
                  styles.item,
                  { borderColor: 'transparent' },
                  pressed && { backgroundColor: 'rgba(224,82,82,0.08)' },
                ]}
                android_ripple={{ color: 'rgba(224,82,82,0.12)' }}
              >
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: 'rgba(224,82,82,0.10)',
                      borderColor: 'rgba(224,82,82,0.30)',
                    },
                  ]}
                >
                  <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                </View>
                <Text
                  style={[styles.itemLabel, { color: colors.danger, fontFamily: fonts.sansBold }]}
                >
                  Sign Out
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayPress: { flex: 1 },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: -6, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 12,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  logo: {
    width: 140,
    height: 80,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
  },
  items: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  spacer: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    fontSize: 15,
    letterSpacing: 0.2,
  },
});
