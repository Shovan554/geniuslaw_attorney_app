import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInLeft } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { Card, CardRow } from '../../../components/Card';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { AttorneyProfile, getAttorneyMe } from '../../../lib/attorney';

export default function ProfileIndex() {
  const { colors } = useTheme();
  const router = useRouter();
  const [profile, setProfile] = useState<AttorneyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getAttorneyMe();
    if (res.ok) {
      setProfile(res.data);
      setError(null);
    } else {
      setError(res.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      load().finally(() => {
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const initials =
    profile?.full_name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') ?? '';

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Profile" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        {loading && !profile ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : error && !profile ? (
          <Card>
            <Text style={[styles.errorText, { color: colors.danger, fontFamily: fonts.sans }]}>
              {error}
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { borderColor: colors.cardBorder }]}
              onPress={load}
            >
              <Text style={[styles.retryText, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                Retry
              </Text>
            </TouchableOpacity>
          </Card>
        ) : profile ? (
          <>
            <Animated.View entering={FadeInDown.duration(320)}>
              <Card>
                <View style={styles.identity}>
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
                    ]}
                  >
                    <Text style={[styles.avatarText, { color: colors.accent, fontFamily: fonts.sansBold }]}>
                      {initials || '?'}
                    </Text>
                  </View>
                  <View style={styles.identityText}>
                    <Text style={[styles.name, { color: colors.text, fontFamily: fonts.heading }]}>
                      {profile.full_name}
                    </Text>
                    {profile.title ? (
                      <Text style={[styles.subtitle, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}>
                        {profile.title}
                      </Text>
                    ) : null}
                    {profile.firm_name ? (
                      <Text style={[styles.firm, { color: colors.accent, fontFamily: fonts.sansSemiBold }]}>
                        {profile.firm_name}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInLeft.duration(360).delay(80)}>
              <Card style={styles.cardSpacing}>
                <CardRow label="Email" value={profile.email} icon="mail-outline" />
                <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />
                <CardRow label="Phone" value={profile.phone} icon="call-outline" />
                <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />
                <CardRow label="Address" value={profile.address} icon="location-outline" />
                <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />
                <CardRow label="Bar Number" value={profile.bar_number} icon="ribbon-outline" />
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInLeft.duration(360).delay(160)}>
              <Card style={styles.cardSpacing}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}>
                  Bio
                </Text>
                <Text
                  style={[styles.bio, { color: colors.text, fontFamily: fonts.sans }]}
                  numberOfLines={0}
                >
                  {profile.bio && profile.bio.length > 0 ? profile.bio : '—'}
                </Text>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInLeft.duration(360).delay(240)}>
              <Card style={styles.cardSpacing} padding="md" onPress={() => router.push('/(auth)/profile/edit')}>
                <View style={styles.actionRow}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
                    <Ionicons name="create-outline" size={18} color={colors.accent} />
                  </View>
                  <Text style={[styles.actionText, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                    Edit Profile
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInLeft.duration(360).delay(300)}>
              <Card style={styles.cardSpacing} padding="md" onPress={() => router.push('/(auth)/profile/change-password')}>
                <View style={styles.actionRow}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
                    <Ionicons name="lock-closed-outline" size={18} color={colors.accent} />
                  </View>
                  <Text style={[styles.actionText, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                    Change Password
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInLeft.duration(360).delay(360)}>
              <Card style={styles.cardSpacing} padding="md" onPress={() => router.push('/(auth)/profile/vault')}>
                <View style={styles.actionRow}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
                    <Ionicons name="wallet-outline" size={18} color={colors.accent} />
                  </View>
                  <Text style={[styles.actionText, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                    Payment Vault
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </Card>
            </Animated.View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  center: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    letterSpacing: 1,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
  },
  firm: {
    fontSize: 12,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  cardSpacing: {
    marginTop: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xs,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  bio: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  actionText: {
    flex: 1,
    fontSize: 15,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  retryText: {
    fontSize: 13,
    letterSpacing: 0.6,
  },
});
