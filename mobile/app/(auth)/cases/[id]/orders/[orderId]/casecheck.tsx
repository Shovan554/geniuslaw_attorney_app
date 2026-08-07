import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import Animated, { Easing, FadeInDown, FadeInUp, Layout } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fonts, radius, spacing } from '../../../../../../constants/theme';
import { useTheme } from '../../../../../../contexts/ThemeContext';
import {
  normalizeCasecheckUpdates,
  normalizeIdentityDetails,
  type CasecheckUpdate,
  type IdentityRow,
} from '../../../../../../lib/casecheck';
import { OrderDetail, getOrderDetail } from '../../../../../../lib/cases';
import { screenEdges } from '../../../../../../lib/safeAreaEdges';

export default function CasecheckScreen() {
  const { id, orderId } = useLocalSearchParams<{ id: string; orderId: string }>();
  const caseId = Number(id);
  const numericOrderId = Number(orderId);
  const valid = Number.isFinite(caseId) && Number.isFinite(numericOrderId);
  const { colors } = useTheme();

  const [order, setOrder] = useState<OrderDetail | null>(null);
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
      const res = await getOrderDetail(caseId, numericOrderId);
      if (res.ok) setOrder(res.data);
      else setError(res.message);
      setLoading(false);
      setRefreshing(false);
    },
    [caseId, numericOrderId, valid],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const details = useMemo(
    () => normalizeIdentityDetails(order?.casecheck_identity_details),
    [order?.casecheck_identity_details],
  );
  const updates = useMemo(
    () => normalizeCasecheckUpdates(order?.casecheck_updates),
    [order?.casecheck_updates],
  );

  return (
    <SafeAreaView
      edges={screenEdges}
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
        {loading && !order ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : !order ? (
          <View style={styles.centered}>
            <Text
              style={[styles.muted, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
            >
              {error ?? 'Order not found.'}
            </Text>
            {error ? (
              <Pressable
                onPress={() => load()}
                style={({ pressed }) => [
                  styles.retryBtn,
                  { borderColor: colors.cardBorder },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={{ color: colors.text, fontFamily: fonts.sansSemiBold }}>
                  Retry
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <Animated.View
              entering={FadeInDown.duration(500).easing(Easing.out(Easing.cubic))}
            >
              <Text style={[styles.title, { color: colors.text, fontFamily: fonts.sansBold }]}>
                CaseCheck
              </Text>
              <Text
                style={[styles.subtitle, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
              >
                {updates.length === 0
                  ? 'No reports yet'
                  : `${updates.length} ${updates.length === 1 ? 'report' : 'reports'}`}
              </Text>
            </Animated.View>

            <SectionHeader title="Case Details" delay={70} />
            {details.length === 0 ? (
              <EmptyBox
                icon="document-outline"
                title="No case details"
                body="Court and case identifiers have not been recorded for this order yet."
                delay={110}
              />
            ) : (
              <Animated.View
                entering={FadeInDown.delay(110)
                  .duration(520)
                  .easing(Easing.out(Easing.cubic))}
                style={[
                  styles.detailCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                    shadowColor: colors.cardShadow,
                  },
                ]}
              >
                {details.map((row, idx) => (
                  <DetailRow key={`${row.label}-${idx}`} row={row} isLast={idx === details.length - 1} />
                ))}
              </Animated.View>
            )}

            <SectionHeader title="Updates" delay={150} />
            {updates.length === 0 ? (
              <EmptyBox
                icon="shield-checkmark-outline"
                title="No reports yet"
                body="Published CaseCheck reports for this order will appear here."
                delay={190}
              />
            ) : (
              <View style={styles.updateList}>
                {updates.map((u, idx) => (
                  <Animated.View
                    key={u.id}
                    entering={FadeInUp.delay(190 + idx * 70)
                      .duration(520)
                      .easing(Easing.out(Easing.cubic))}
                    layout={Layout.springify()}
                  >
                    <UpdateCard update={u} />
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
        <Text style={[styles.backText, { color: colors.text, fontFamily: fonts.sansMedium }]}>
          Back
        </Text>
      </Pressable>
    </View>
  );
}

function SectionHeader({ title, delay }: { title: string; delay: number }) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(480).easing(Easing.out(Easing.cubic))}
    >
      <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.sansBold }]}>
        {title}
      </Text>
    </Animated.View>
  );
}

/**
 * One court identity field. URLs open externally and phone numbers dial; everything
 * else is inert text.
 */
function DetailRow({ row, isLast }: { row: IdentityRow; isLast: boolean }) {
  const { colors } = useTheme();

  const open = () => {
    if (row.kind === 'url') void Linking.openURL(row.value).catch(() => {});
    else if (row.kind === 'phone') {
      const digits = row.value.replace(/[^\d+]/g, '');
      if (digits) void Linking.openURL(`tel:${digits}`).catch(() => {});
    }
  };

  const interactive = row.kind !== 'text';
  const body = (
    <View
      style={[
        styles.detailRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.cardBorder },
      ]}
    >
      <Text
        style={[styles.detailLabel, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
      >
        {row.label}
      </Text>
      <Text
        style={[
          styles.detailValue,
          {
            color: interactive ? colors.accent : colors.text,
            fontFamily: fonts.sansSemiBold,
          },
        ]}
      >
        {row.value}
      </Text>
    </View>
  );

  if (!interactive) return body;
  return (
    <Pressable onPress={open} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  );
}

/**
 * One published report, collapsed to its date and send status until tapped.
 *
 * Reports run ~1,700 characters, so opening several at once buries the list. The
 * internal `text` field never reaches this component.
 */
function UpdateCard({ update }: { update: CasecheckUpdate }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View
      style={[
        styles.updateCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          shadowColor: colors.cardShadow,
        },
      ]}
    >
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Report ${update.timestampLabel || 'undated'}`}
        style={({ pressed }) => [
          styles.updateHeader,
          // Only pad beneath the header when a body follows it, so a collapsed
          // card stays vertically symmetric inside the card's own padding.
          open && { paddingBottom: spacing.md },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={styles.updateHeaderLeft}>
          <Text
            style={[styles.updateDate, { color: colors.text, fontFamily: fonts.sansBold }]}
          >
            {update.timestampLabel || 'Undated report'}
          </Text>
          {update.author ? (
            <Text
              style={[styles.updateAuthor, { color: colors.textSubtle, fontFamily: fonts.sansMedium }]}
              numberOfLines={1}
            >
              {update.author}
            </Text>
          ) : null}
        </View>
        {update.isSent ? (
          <View style={[styles.sentPill, { backgroundColor: colors.accentTint }]}>
            <Ionicons name="checkmark-circle" size={12} color={colors.accent} />
            <Text
              style={[styles.sentText, { color: colors.accent, fontFamily: fonts.sansSemiBold }]}
            >
              Sent
            </Text>
          </View>
        ) : null}
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>

      {open ? (
        <Animated.View
          entering={FadeInDown.duration(220).easing(Easing.out(Easing.cubic))}
          style={[styles.updateBody, { borderTopColor: colors.cardBorder }]}
        >
          {update.sections.map((s, idx) => (
            <View key={`${s.heading ?? 'section'}-${idx}`} style={styles.section}>
              {s.heading ? (
                <Text
                  style={[
                    styles.sectionHeading,
                    { color: colors.gold, fontFamily: fonts.sansBold },
                  ]}
                >
                  {s.heading}
                </Text>
              ) : null}
              <Text
                style={[styles.sectionBody, { color: colors.text, fontFamily: fonts.sans }]}
              >
                {s.body}
              </Text>
            </View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

function EmptyBox({
  icon,
  title,
  body,
  delay,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  delay: number;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(500).easing(Easing.out(Easing.cubic))}
      style={[styles.emptyBox, { borderColor: colors.cardBorder }]}
    >
      <Ionicons name={icon} size={26} color={colors.textSubtle} />
      <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
        {title}
      </Text>
      <Text
        style={[styles.emptyBody, { color: colors.textMuted, fontFamily: fonts.sans }]}
      >
        {body}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl * 2,
    gap: spacing.md,
  },
  backBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { fontSize: 15 },
  centered: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  muted: { fontSize: 14, textAlign: 'center' },
  retryBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  title: { fontSize: 28, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2 },
  sectionTitle: { fontSize: 17, marginTop: spacing.sm },

  detailCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 4,
  },
  detailRow: { paddingVertical: spacing.md, gap: 3 },
  detailLabel: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  detailValue: { fontSize: 15, lineHeight: 21 },

  updateList: { gap: spacing.md },
  updateCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 4,
  },
  updateHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  updateHeaderLeft: { flex: 1, gap: 2 },
  updateDate: { fontSize: 15 },
  updateAuthor: { fontSize: 12 },
  sentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  sentText: { fontSize: 11 },
  updateBody: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, gap: spacing.md },
  section: { gap: spacing.xs },
  sectionHeading: { fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionBody: { fontSize: 14, lineHeight: 22 },

  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: { fontSize: 15 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
