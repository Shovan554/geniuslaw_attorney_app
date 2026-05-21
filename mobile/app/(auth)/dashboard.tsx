import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  Layout,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { fonts, radius, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { CaseSummary, getCases } from '../../lib/cases';
import { getClients } from '../../lib/clients';
import { caseStatusMeta } from '../../lib/orderStatus';
import { AttorneyProfile, getAttorneyMe } from '../../lib/attorney';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function DashboardScreen() {
  const { colors } = useTheme();
  const [attorney, setAttorney] = useState<AttorneyProfile | null>(null);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    const [profile, openCases, clients] = await Promise.all([
      getAttorneyMe(),
      getCases({ excludeClosed: true }),
      getClients(),
    ]);
    if (profile.ok) setAttorney(profile.data);
    if (openCases.ok) {
      setCases(openCases.data.cases.slice(0, 3));
      setOpenCount(openCases.data.cases.length);
    } else {
      setError(openCases.message);
    }
    if (clients.ok) {
      setClientCount(clients.data.clients.length);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const firstName = attorney?.full_name?.trim().split(/\s+/)[0] ?? null;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AppHeader eyebrow="Welcome back" title={firstName ?? 'Counselor'} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <Animated.View
          entering={FadeInDown.duration(500).easing(Easing.out(Easing.cubic))}
          style={styles.accentWrap}
        >
          <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(60)
            .duration(500)
            .easing(Easing.out(Easing.cubic))}
          style={styles.metricsRow}
        >
          <MetricCard
            value={openCount}
            label="Open Cases"
            icon="briefcase-outline"
            tone="accent"
            onPress={() => router.push('/(auth)/cases' as never)}
          />
          <MetricCard
            value={clientCount}
            label="Clients"
            icon="people-outline"
            tone="gold"
            onPress={() => router.push('/(auth)/clients' as never)}
          />
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(140)
            .duration(500)
            .easing(Easing.out(Easing.cubic))}
          style={styles.sectionHeader}
        >
          <Text
            style={[
              styles.sectionTitle,
              { color: colors.text, fontFamily: fonts.sansBold },
            ]}
          >
            Recently Updated Cases
          </Text>
          <Pressable
            onPress={() => router.push('/(auth)/cases' as never)}
            hitSlop={10}
            style={({ pressed }) => [styles.viewAll, pressed && { opacity: 0.6 }]}
          >
            <Text
              style={{
                color: colors.accent,
                fontFamily: fonts.sansSemiBold,
                fontSize: 13,
              }}
            >
              View all
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.accent} />
          </Pressable>
        </Animated.View>

        {loading && cases.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
        ) : error ? (
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={[
              styles.errorBox,
              { borderColor: colors.cardBorder, backgroundColor: colors.card },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
            <Text
              style={[
                styles.errorText,
                { color: colors.danger, fontFamily: fonts.sansMedium },
              ]}
            >
              {error}
            </Text>
            <Pressable onPress={() => load()} hitSlop={10}>
              <Text
                style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}
              >
                Retry
              </Text>
            </Pressable>
          </Animated.View>
        ) : cases.length === 0 ? (
          <Animated.View
            entering={FadeInUp.delay(180).duration(450)}
            style={[
              styles.emptyBox,
              { borderColor: colors.cardBorder, backgroundColor: colors.card },
            ]}
          >
            <Ionicons name="briefcase-outline" size={28} color={colors.textMuted} />
            <Text
              style={[
                styles.emptyTitle,
                { color: colors.text, fontFamily: fonts.sansSemiBold },
              ]}
            >
              All caught up
            </Text>
            <Text
              style={[
                styles.emptyBody,
                { color: colors.textMuted, fontFamily: fonts.sans },
              ]}
            >
              No open cases need your attention right now.
            </Text>
          </Animated.View>
        ) : (
          <View style={styles.list}>
            {cases.map((c, idx) => (
              <Animated.View
                key={c.id}
                entering={FadeInDown.delay(180 + idx * 90)
                  .duration(520)
                  .easing(Easing.out(Easing.cubic))}
                layout={Layout.springify()}
              >
                <RecentCaseCard
                  item={c}
                  onPress={() => router.push(`/(auth)/cases/${c.id}` as never)}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({
  value,
  label,
  icon,
  tone,
  onPress,
}: {
  value: number | null;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'accent' | 'gold';
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const toneColor = tone === 'gold' ? colors.gold : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.metricCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          shadowColor: colors.cardShadow,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={styles.metricTopRow}>
        <View
          style={[
            styles.metricIcon,
            { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
          ]}
        >
          <Ionicons name={icon} size={14} color={toneColor} />
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
      <Text
        style={[
          styles.metricValue,
          { color: toneColor, fontFamily: fonts.sansBold },
        ]}
      >
        {value ?? '—'}
      </Text>
      <Text
        style={[
          styles.metricLabel,
          { color: colors.textMuted, fontFamily: fonts.sansMedium },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function RecentCaseCard({
  item,
  onPress,
}: {
  item: CaseSummary;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const meta = caseStatusMeta(item.status, colors);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          shadowColor: colors.cardShadow,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          opacity: pressed ? 0.94 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={12} color={meta.fg} />
          <Text
            style={[styles.statusText, { color: meta.fg, fontFamily: fonts.sansSemiBold }]}
          >
            {meta.label}
          </Text>
        </View>
        <Text
          style={[
            styles.cardUpdated,
            { color: colors.textMuted, fontFamily: fonts.sansMedium },
          ]}
        >
          Updated {formatDate(item.updated_at)}
        </Text>
      </View>
      <Text
        style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansBold }]}
        numberOfLines={2}
      >
        {item.title}
      </Text>
      <View style={styles.metaRow}>
        <Ionicons name="person-outline" size={13} color={colors.textMuted} />
        <Text
          style={[
            styles.metaText,
            {
              color: item.client_name ? colors.text : colors.textMuted,
              fontFamily: fonts.sansMedium,
            },
          ]}
          numberOfLines={1}
        >
          {item.client_name ?? 'Client unassigned'}
        </Text>
        {item.case_number ? (
          <Text
            style={[
              styles.caseNum,
              { color: colors.textMuted, fontFamily: fonts.sansMedium },
            ]}
          >
            #{item.case_number}
          </Text>
        ) : null}
      </View>
      <View style={[styles.cardFooter, { borderTopColor: colors.cardBorder }]}>
        <Text
          style={[
            styles.footerOpened,
            { color: colors.textMuted, fontFamily: fonts.sansMedium },
          ]}
        >
          Opened {formatDate(item.opened_at)}
        </Text>
        <View style={styles.viewRow}>
          <Text
            style={[
              styles.viewText,
              { color: colors.accent, fontFamily: fonts.sansSemiBold },
            ]}
          >
            Open
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accent} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  accentWrap: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  accentBar: {
    width: 48,
    height: 3,
    borderRadius: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  metricCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 4,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  metricTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 26,
    lineHeight: 30,
  },
  metricLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardUpdated: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
  },
  caseNum: {
    fontSize: 12,
    letterSpacing: 0.4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  footerOpened: {
    fontSize: 12,
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewText: {
    fontSize: 13,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 11,
    letterSpacing: 0.4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
  },
  emptyBox: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
