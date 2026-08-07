import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { fonts, radius, spacing, type AppColors } from '../../../../../../constants/theme';
import { useTheme } from '../../../../../../contexts/ThemeContext';
import { OrderDetail, StepGroup, StepItem, getOrderDetail } from '../../../../../../lib/cases';
import {
  ChangeLine,
  HistoryEntry,
  normalizeHistory,
} from '../../../../../../lib/orderHistory';
import { formatOrderTitle, orderStatusMeta } from '../../../../../../lib/orderStatus';
import { screenEdges } from '../../../../../../lib/safeAreaEdges';

function formatDate(iso: string | null | undefined): string {
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

function formatCurrency(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export default function OrderDetailScreen() {
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
      if (res.ok) {
        setOrder(res.data);
      } else {
        setError(res.message);
      }
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

  const history = useMemo(() => normalizeHistory(order?.history), [order?.history]);

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
              <SummaryCard order={order} />
            </Animated.View>

            {order.service_type === 'casecheck' ? (
              <Animated.View
                entering={FadeInDown.delay(60)
                  .duration(500)
                  .easing(Easing.out(Easing.cubic))}
              >
                <CasecheckButton caseId={caseId} orderId={numericOrderId} />
              </Animated.View>
            ) : null}

            <SectionHeader
              title="Progress"
              trailing={
                order.current_step_label?.trim() ||
                (order.current_step ? order.current_step.replace(/_/g, ' ') : 'Not started')
              }
              delay={90}
            />

            {order.groups.length === 0 ? (
              <EmptyBox
                icon="git-branch-outline"
                title="No step details"
                body="This service type has no configured stages yet."
                delay={130}
              />
            ) : (
              <View style={styles.groupList}>
                {order.groups.map((g, idx) => (
                  <Animated.View
                    key={g.key}
                    entering={FadeInDown.delay(130 + idx * 70)
                      .duration(520)
                      .easing(Easing.out(Easing.cubic))}
                    layout={Layout.springify()}
                  >
                    <GroupCard group={g} />
                  </Animated.View>
                ))}
              </View>
            )}

            <SectionHeader
              title="Notes & Activity"
              trailing={`${history.length} ${history.length === 1 ? 'entry' : 'entries'}`}
              delay={160}
            />

            {history.length === 0 ? (
              <EmptyBox
                icon="chatbubble-ellipses-outline"
                title="Nothing logged yet"
                body="Notes and changes recorded on this order will appear here."
                delay={200}
              />
            ) : (
              <View style={styles.timeline}>
                <View
                  style={[styles.timelineRail, { backgroundColor: colors.cardBorder }]}
                />
                {history.map((entry, idx) => (
                  <Animated.View
                    key={entry.key}
                    entering={FadeInUp.delay(200 + idx * 55)
                      .duration(500)
                      .easing(Easing.out(Easing.cubic))}
                    layout={Layout.springify()}
                  >
                    <HistoryCard entry={entry} />
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

function SectionHeader({
  title,
  trailing,
  delay,
}: {
  title: string;
  trailing: string;
  delay: number;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(500).easing(Easing.out(Easing.cubic))}
      style={styles.sectionHeader}
    >
      <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.sansBold }]}>
        {title}
      </Text>
      <Text
        style={[
          styles.sectionTrailing,
          { color: colors.textMuted, fontFamily: fonts.sansMedium },
        ]}
        numberOfLines={1}
      >
        {trailing}
      </Text>
    </Animated.View>
  );
}

/** Entry point to the CaseCheck report screen. Rendered only for casecheck orders. */
function CasecheckButton({ caseId, orderId }: { caseId: number; orderId: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() =>
        router.push(`/(auth)/cases/${caseId}/orders/${orderId}/casecheck` as never)
      }
      style={({ pressed }) => [
        styles.casecheckBtn,
        { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name="document-text-outline" size={20} color={colors.accent} />
      <Text
        style={[
          styles.casecheckBtnText,
          { color: colors.accent, fontFamily: fonts.sansBold },
        ]}
      >
        CaseCheck Update
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.accent} />
    </Pressable>
  );
}

function SummaryCard({ order }: { order: OrderDetail }) {
  const { colors } = useTheme();
  const meta = orderStatusMeta(order.status, colors);
  const outstanding = Math.max(0, order.contract_amount - order.paid_amount);
  const pctPaid =
    order.contract_amount > 0
      ? Math.min(1, Math.max(0, order.paid_amount / order.contract_amount))
      : 0;

  return (
    <View
      style={[
        styles.summaryCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          shadowColor: colors.cardShadow,
        },
      ]}
    >
      <View style={[styles.statusPill, { backgroundColor: meta.bg, alignSelf: 'flex-start' }]}>
        <Ionicons name={meta.icon} size={12} color={meta.fg} />
        <Text style={[styles.statusText, { color: meta.fg, fontFamily: fonts.sansSemiBold }]}>
          {meta.label}
        </Text>
      </View>

      <Text
        style={[styles.summaryTitle, { color: colors.text, fontFamily: fonts.sansBold }]}
        numberOfLines={3}
      >
        {formatOrderTitle(order.service_type_label)}
      </Text>
      <Text
        style={[styles.summarySub, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
      >
        {order.order_date ? `Ordered ${formatDate(order.order_date)}` : 'Order date pending'}
      </Text>

      <View style={[styles.moneyBlock, { borderTopColor: colors.cardBorder }]}>
        <View style={styles.moneyRow}>
          <MoneyCell label="Contract" value={formatCurrency(order.contract_amount)} />
          <MoneyCell
            label="Paid"
            value={formatCurrency(order.paid_amount)}
            tone={colors.success}
          />
          <MoneyCell
            label="Balance"
            value={formatCurrency(outstanding)}
            tone={outstanding > 0 ? colors.gold : colors.textMuted}
          />
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.cardBorder }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: outstanding > 0 ? colors.gold : colors.success,
                width: `${Math.round(pctPaid * 100)}%`,
              },
            ]}
          />
        </View>
      </View>

      <View style={[styles.metaGrid, { borderTopColor: colors.cardBorder }]}>
        <MetaCell label="Current Step" value={currentStepText(order)} wide />
        {order.state ? <MetaCell label="State" value={order.state} /> : null}
        {order.due_date ? <MetaCell label="Due" value={formatDate(order.due_date)} /> : null}
        {order.service_fee > 0 ? (
          <MetaCell label="Service Fee" value={formatCurrency(order.service_fee)} />
        ) : null}
        {order.sell_date ? (
          <MetaCell label="Sold" value={formatDate(order.sell_date)} />
        ) : null}
        {order.case_type ? <MetaCell label="Case Type" value={order.case_type} /> : null}
      </View>
    </View>
  );
}

function currentStepText(order: OrderDetail): string {
  const label = order.current_step_label?.trim();
  if (label) return label;
  if (order.current_step) return order.current_step.replace(/_/g, ' ');
  return 'Not started';
}

function MoneyCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.moneyCell}>
      <Text
        style={[styles.cellLabel, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
      >
        {label}
      </Text>
      <Text
        style={[styles.moneyValue, { color: tone ?? colors.text, fontFamily: fonts.sansBold }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

function MetaCell({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metaCell, wide && styles.metaCellWide]}>
      <Text
        style={[styles.cellLabel, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
      >
        {label}
      </Text>
      <Text
        style={[styles.metaValue, { color: colors.text, fontFamily: fonts.sansSemiBold }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function groupStateColor(state: StepGroup['state'], colors: AppColors): string {
  if (state === 'complete') return colors.success;
  if (state === 'current') return colors.gold;
  return colors.textMuted;
}

function groupStateLabel(g: StepGroup): string {
  if (g.state === 'complete') return 'Complete';
  if (g.state === 'current') return 'Current';
  return `${g.completed_count}/${g.total_count}`;
}

function GroupCard({ group }: { group: StepGroup }) {
  const { colors } = useTheme();
  const accent = groupStateColor(group.state, colors);
  return (
    <View
      style={[
        styles.groupCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          borderLeftColor: accent,
          shadowColor: colors.cardShadow,
        },
      ]}
    >
      <View style={styles.groupHeader}>
        <Text style={[styles.roman, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
          {group.roman}
        </Text>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.groupLabel, { color: colors.text, fontFamily: fonts.sansBold }]}
          >
            {group.label}
          </Text>
          <Text
            style={{
              color: accent,
              fontFamily: fonts.sansSemiBold,
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {groupStateLabel(group)}
          </Text>
        </View>
      </View>
      <View style={styles.stepList}>
        {group.steps.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </View>
    </View>
  );
}

function StepRow({ step }: { step: StepItem }) {
  const { colors } = useTheme();
  let icon: React.ComponentProps<typeof Ionicons>['name'] = 'ellipse-outline';
  let iconColor = colors.textSubtle;
  let textColor = colors.textMuted;
  let weight = fonts.sansMedium;
  if (step.state === 'complete') {
    icon = 'checkmark-circle';
    iconColor = colors.success;
    textColor = colors.text;
  } else if (step.state === 'current') {
    icon = 'ellipsis-horizontal-circle';
    iconColor = colors.gold;
    textColor = colors.text;
    weight = fonts.sansBold;
  }
  return (
    <View style={styles.stepRow}>
      <Ionicons name={icon} size={17} color={iconColor} />
      <Text style={{ color: textColor, fontFamily: weight, fontSize: 14, flex: 1 }}>
        {step.label}
      </Text>
    </View>
  );
}

function HistoryCard({ entry }: { entry: HistoryEntry }) {
  const { colors } = useTheme();
  const accent = colors[entry.accent];
  return (
    <View style={styles.historyRow}>
      <View
        style={[
          styles.timelineDot,
          { backgroundColor: accent, borderColor: colors.background },
        ]}
      />
      <View
        style={[
          styles.historyCard,
          {
            backgroundColor: colors.card,
            borderColor: entry.pinned ? colors.gold : colors.cardBorder,
            shadowColor: colors.cardShadow,
          },
        ]}
      >
        <View style={styles.historyHeader}>
          <Text
            style={[styles.historyAction, { color: accent, fontFamily: fonts.sansBold }]}
          >
            {entry.actionLabel}
          </Text>
          {entry.pinned ? <Tag label="Pinned" tone={colors.gold} /> : null}
          {entry.urgent ? <Tag label="Urgent" tone={colors.danger} /> : null}
        </View>

        <Text
          style={[
            styles.historyMeta,
            { color: colors.textMuted, fontFamily: fonts.sansMedium },
          ]}
          numberOfLines={1}
        >
          {entry.author} · {entry.timestampLabel}
        </Text>

        {entry.description ? (
          <Text
            style={[styles.historyBody, { color: colors.text, fontFamily: fonts.sans }]}
          >
            {entry.description}
          </Text>
        ) : null}

        {entry.changes.length > 0 ? (
          <View style={styles.changeList}>
            {entry.changes.map((c, i) => (
              <ChangeRow key={`${c.field}-${i}`} change={c} />
            ))}
          </View>
        ) : null}

        {entry.comment ? (
          <View
            style={[
              styles.commentBox,
              { backgroundColor: colors.surface, borderLeftColor: accent },
            ]}
          >
            <Text
              style={[styles.commentText, { color: colors.text, fontFamily: fonts.sans }]}
            >
              {entry.comment}
            </Text>
          </View>
        ) : null}

        {entry.isEmpty ? (
          <Text
            style={[
              styles.historyEmpty,
              { color: colors.textSubtle, fontFamily: fonts.sans },
            ]}
          >
            No specific details
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ChangeRow({ change }: { change: ChangeLine }) {
  const { colors } = useTheme();
  return (
    <View style={styles.changeRow}>
      <Text
        style={[styles.changeField, { color: colors.textMuted, fontFamily: fonts.sansSemiBold }]}
      >
        {change.field}
      </Text>
      <View style={styles.changeValues}>
        {change.kind === 'transition' ? (
          <>
            {change.from ? (
              <Text
                style={[
                  styles.changeValue,
                  { color: colors.textMuted, fontFamily: fonts.sansMedium },
                ]}
                numberOfLines={2}
              >
                {change.from}
              </Text>
            ) : (
              <Text
                style={[
                  styles.changeEmpty,
                  { color: colors.textSubtle, fontFamily: fonts.sans },
                ]}
              >
                empty
              </Text>
            )}
            <Ionicons name="arrow-forward" size={12} color={colors.textSubtle} />
          </>
        ) : null}
        <Text
          style={[
            styles.changeValue,
            { color: colors.text, fontFamily: fonts.sansSemiBold, flexShrink: 1 },
          ]}
          numberOfLines={3}
        >
          {change.to}
        </Text>
      </View>
    </View>
  );
}

function Tag({ label, tone }: { label: string; tone: string }) {
  return (
    <View style={[styles.tag, { borderColor: tone }]}>
      <Text style={[styles.tagText, { color: tone, fontFamily: fonts.sansSemiBold }]}>
        {label}
      </Text>
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
      entering={FadeInUp.delay(delay).duration(450)}
      style={[
        styles.emptyBox,
        { borderColor: colors.cardBorder, backgroundColor: colors.card },
      ]}
    >
      <Ionicons name={icon} size={26} color={colors.textMuted} />
      <Text
        style={[styles.emptyTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}
      >
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  muted: { fontSize: 14, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },

  casecheckBtn: {
    // The scroll container has no gap, so the button would otherwise sit flush
    // against the summary card above it.
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  casecheckBtnText: { flex: 1, fontSize: 15 },
  summaryCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },
  summaryTitle: { fontSize: 22, lineHeight: 28, marginTop: spacing.xs },
  summarySub: { fontSize: 13 },

  moneyBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  moneyRow: { flexDirection: 'row', gap: spacing.md },
  moneyCell: { flex: 1, gap: 3 },
  moneyValue: { fontSize: 17 },
  progressTrack: {
    height: 5,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.full },

  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
    columnGap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  metaCell: { minWidth: 88, flexGrow: 1, flexBasis: '28%', gap: 3 },
  metaCellWide: { flexBasis: '100%' },
  metaValue: { fontSize: 14, lineHeight: 18 },
  cellLabel: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: 20 },
  sectionTrailing: {
    flexShrink: 1,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'right',
  },

  groupList: { gap: spacing.md },
  groupCard: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 5,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  roman: { fontSize: 21, width: 38, textAlign: 'center' },
  groupLabel: { fontSize: 16 },
  stepList: { gap: spacing.sm, marginTop: spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  timeline: { paddingLeft: spacing.lg, gap: spacing.md },
  timelineRail: {
    position: 'absolute',
    left: 5,
    top: 8,
    bottom: 8,
    width: StyleSheet.hairlineWidth,
  },
  historyRow: { position: 'relative' },
  timelineDot: {
    position: 'absolute',
    left: -spacing.lg + 1,
    top: spacing.lg,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    zIndex: 1,
  },
  historyCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 3,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  historyAction: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  historyMeta: { fontSize: 11 },
  historyBody: { fontSize: 14, lineHeight: 20, marginTop: spacing.xs },
  historyEmpty: { fontSize: 12, fontStyle: 'italic', marginTop: spacing.xs },

  changeList: { gap: spacing.sm, marginTop: spacing.sm },
  changeRow: { gap: 3 },
  changeField: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  changeValues: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  changeValue: { fontSize: 14, lineHeight: 19 },
  changeEmpty: { fontSize: 13, fontStyle: 'italic' },

  commentBox: {
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  commentText: { fontSize: 14, lineHeight: 20 },

  tag: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },

  emptyBox: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 16 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusText: { fontSize: 11, letterSpacing: 0.4 },
});
