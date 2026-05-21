import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
  FadeInLeft,
  FadeInUp,
  Layout,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { CaseSummary, getCases } from '../../../lib/cases';
import { ClientSummary, getClientById } from '../../../lib/clients';
import { caseStatusMeta } from '../../../lib/orderStatus';

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

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numericId = Number(id);
  const valid = Number.isFinite(numericId);
  const { colors } = useTheme();

  const [client, setClient] = useState<ClientSummary | null>(null);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!valid) {
        setLoading(false);
        return;
      }
      if (!isRefresh) setLoading(true);
      setError(null);
      const [clientRes, casesRes] = await Promise.all([
        getClientById(numericId),
        getCases({ clientId: numericId }),
      ]);
      if (clientRes.ok) {
        setClient(clientRes.data);
      } else {
        setError(clientRes.message);
      }
      if (casesRes.ok) {
        setCases(casesRes.data.cases);
      } else if (clientRes.ok) {
        setError(casesRes.message);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [numericId, valid],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  if (!valid) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <BackBar />
        <View style={styles.centered}>
          <Text
            style={[styles.muted, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
          >
            Client not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <BackBar />
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
        {loading && !client ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : !client ? (
          <View style={styles.centered}>
            <Text
              style={[styles.muted, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
            >
              {error ?? 'Client not found.'}
            </Text>
          </View>
        ) : (
          <>
            <Animated.View
              entering={FadeInDown.duration(500).easing(Easing.out(Easing.cubic))}
              style={styles.hero}
            >
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: colors.accentTint,
                    borderColor: colors.accentBorder,
                  },
                ]}
              >
                <Text
                  style={{
                    color: colors.accent,
                    fontFamily: fonts.sansBold,
                    fontSize: 22,
                    letterSpacing: 0.5,
                  }}
                >
                  {initialsFrom(client.full_name)}
                </Text>
              </View>
              <Text
                style={[
                  styles.heroName,
                  { color: colors.text, fontFamily: fonts.sansBold },
                ]}
                numberOfLines={2}
              >
                {client.full_name}
              </Text>
              <Text
                style={[
                  styles.heroSub,
                  { color: colors.textMuted, fontFamily: fonts.sansMedium },
                ]}
              >
                {client.case_count} {client.case_count === 1 ? 'case' : 'cases'} with you
              </Text>
              <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
            </Animated.View>

            <Animated.View
              entering={FadeInLeft.delay(80)
                .duration(500)
                .easing(Easing.out(Easing.cubic))}
              style={[
                styles.contactCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                  shadowColor: colors.cardShadow,
                },
              ]}
            >
              <ContactRow
                icon="mail-outline"
                label="Email"
                value={client.email}
                onPress={
                  client.email
                    ? () => Linking.openURL(`mailto:${client.email}`)
                    : undefined
                }
              />
              <Divider />
              <ContactRow
                icon="call-outline"
                label="Phone"
                value={client.phone}
                onPress={
                  client.phone
                    ? () => Linking.openURL(`tel:${client.phone}`)
                    : undefined
                }
              />
              <Divider />
              <ContactRow
                icon="location-outline"
                label="State"
                value={client.state}
              />
            </Animated.View>

            <Animated.View
              entering={FadeInUp.delay(160)
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
                Cases
              </Text>
              <Text
                style={[
                  styles.sectionCount,
                  { color: colors.textMuted, fontFamily: fonts.sansMedium },
                ]}
              >
                {cases.length} {cases.length === 1 ? 'case' : 'cases'}
              </Text>
            </Animated.View>

            {cases.length === 0 ? (
              <Animated.View
                entering={FadeInUp.delay(200).duration(450)}
                style={[
                  styles.emptyBox,
                  { borderColor: colors.cardBorder, backgroundColor: colors.card },
                ]}
              >
                <Ionicons name="briefcase-outline" size={26} color={colors.textMuted} />
                <Text
                  style={[
                    styles.emptyTitle,
                    { color: colors.text, fontFamily: fonts.sansSemiBold },
                  ]}
                >
                  No cases yet
                </Text>
                <Text
                  style={[
                    styles.emptyBody,
                    { color: colors.textMuted, fontFamily: fonts.sans },
                  ]}
                >
                  Cases for this client will appear here.
                </Text>
              </Animated.View>
            ) : (
              <View style={styles.caseList}>
                {cases.map((c, idx) => (
                  <Animated.View
                    key={c.id}
                    entering={FadeInDown.delay(200 + idx * 70)
                      .duration(520)
                      .easing(Easing.out(Easing.cubic))}
                    layout={Layout.springify()}
                  >
                    <ClientCaseCard
                      item={c}
                      onPress={() =>
                        router.push(`/(auth)/cases/${c.id}` as never)
                      }
                    />
                  </Animated.View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BackBar() {
  const { colors } = useTheme();
  return (
    <View style={styles.backBar}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text
          style={[styles.backText, { color: colors.text, fontFamily: fonts.sansMedium }]}
        >
          Back
        </Text>
      </Pressable>
    </View>
  );
}

function ContactRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string | null;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const display = value && value.trim().length > 0 ? value : null;
  const content = (
    <View style={styles.contactRow}>
      <View
        style={[
          styles.contactIcon,
          { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
        ]}
      >
        <Ionicons name={icon} size={15} color={colors.accent} />
      </View>
      <View style={styles.contactText}>
        <Text
          style={[
            styles.contactLabel,
            { color: colors.textMuted, fontFamily: fonts.sansMedium },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.contactValue,
            {
              color: display ? colors.text : colors.textMuted,
              fontFamily: fonts.sansSemiBold,
            },
          ]}
          numberOfLines={1}
        >
          {display ?? '—'}
        </Text>
      </View>
      {onPress && display ? (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      ) : null}
    </View>
  );
  if (onPress && display) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />;
}

function ClientCaseCard({
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
        styles.caseCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          shadowColor: colors.cardShadow,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          opacity: pressed ? 0.94 : 1,
        },
      ]}
    >
      <View style={styles.caseHeader}>
        <Text
          style={[styles.caseTitle, { color: colors.text, fontFamily: fonts.sansBold }]}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={12} color={meta.fg} />
          <Text
            style={[styles.statusText, { color: meta.fg, fontFamily: fonts.sansSemiBold }]}
          >
            {meta.label}
          </Text>
        </View>
      </View>
      <Text
        style={[
          styles.caseNumber,
          {
            color: item.case_number?.trim() ? colors.textMuted : colors.textSubtle,
            fontFamily: fonts.sansMedium,
          },
        ]}
      >
        {item.case_number?.trim() || 'Case number pending'}
      </Text>
      <View style={[styles.caseFooter, { borderTopColor: colors.cardBorder }]}>
        <Text
          style={[
            styles.footerText,
            { color: colors.textMuted, fontFamily: fonts.sansMedium },
          ]}
        >
          {item.status === 'closed' && item.closed_at
            ? `Closed ${formatDate(item.closed_at)}`
            : `Opened ${formatDate(item.opened_at)}`}
        </Text>
        <View style={styles.viewRow}>
          <Text
            style={[
              styles.viewText,
              { color: colors.accent, fontFamily: fonts.sansSemiBold },
            ]}
          >
            View
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
  backBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 12,
    gap: 2,
  },
  backText: { fontSize: 15 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  muted: { fontSize: 14 },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heroName: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 13,
    letterSpacing: 0.3,
  },
  accentBar: {
    width: 48,
    height: 3,
    borderRadius: 2,
    marginTop: spacing.xs,
  },
  contactCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
    gap: spacing.sm,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  contactIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactText: { flex: 1, gap: 2 },
  contactLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  contactValue: {
    fontSize: 15,
    lineHeight: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: 20 },
  sectionCount: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  caseList: { gap: spacing.md },
  caseCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 5,
    gap: spacing.sm,
  },
  caseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  caseTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
  },
  caseNumber: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  caseFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  footerText: { fontSize: 12 },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewText: { fontSize: 13 },
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
  emptyBox: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 16 },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
