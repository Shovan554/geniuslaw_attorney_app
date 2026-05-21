import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
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
  FadeInLeft,
  FadeInUp,
  Layout,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  CaseSummary,
  OrderSummary,
  getCaseById,
  getOrdersByCaseId,
} from '../../../lib/cases';
import { caseStatusMeta, formatOrderTitle, orderStatusMeta } from '../../../lib/orderStatus';

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

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numericId = Number(id);
  const valid = Number.isFinite(numericId);
  const { colors } = useTheme();

  const [caseItem, setCaseItem] = useState<CaseSummary | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
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
      const [caseRes, ordersRes] = await Promise.all([
        getCaseById(numericId),
        getOrdersByCaseId(numericId),
      ]);
      if (caseRes.ok) {
        setCaseItem(caseRes.data);
      } else {
        setError(caseRes.message);
      }
      if (ordersRes.ok) {
        setOrders(ordersRes.data.orders);
      } else if (!caseRes.ok) {
        // already set
      } else {
        setError(ordersRes.message);
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
            Case not found.
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
        {loading && !caseItem ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : !caseItem ? (
          <View style={styles.centered}>
            <Text
              style={[styles.muted, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
            >
              {error ?? 'Case not found.'}
            </Text>
          </View>
        ) : (
          <>
            <Animated.View
              entering={FadeInDown.duration(500).easing(Easing.out(Easing.cubic))}
            >
              <CaseHero item={caseItem} />
            </Animated.View>

            <Animated.View
              entering={FadeInLeft.delay(80)
                .duration(500)
                .easing(Easing.out(Easing.cubic))}
            >
              <DetailsCard item={caseItem} />
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
                Orders
              </Text>
              <Text
                style={[
                  styles.sectionCount,
                  { color: colors.textMuted, fontFamily: fonts.sansMedium },
                ]}
              >
                {orders.length} {orders.length === 1 ? 'order' : 'orders'}
              </Text>
            </Animated.View>

            {orders.length === 0 ? (
              <Animated.View
                entering={FadeInUp.delay(200).duration(450)}
                style={[
                  styles.emptyBox,
                  { borderColor: colors.cardBorder, backgroundColor: colors.card },
                ]}
              >
                <Ionicons name="documents-outline" size={26} color={colors.textMuted} />
                <Text
                  style={[
                    styles.emptyTitle,
                    { color: colors.text, fontFamily: fonts.sansSemiBold },
                  ]}
                >
                  No orders yet
                </Text>
                <Text
                  style={[
                    styles.emptyBody,
                    { color: colors.textMuted, fontFamily: fonts.sans },
                  ]}
                >
                  Orders for this case will appear here once they’re created.
                </Text>
              </Animated.View>
            ) : (
              <View style={styles.orderList}>
                {orders.map((o, idx) => (
                  <Animated.View
                    key={o.id}
                    entering={FadeInDown.delay(200 + idx * 70)
                      .duration(520)
                      .easing(Easing.out(Easing.cubic))}
                    layout={Layout.springify()}
                  >
                    <OrderCard item={o} />
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

function CaseHero({ item }: { item: CaseSummary }) {
  const { colors } = useTheme();
  const meta = caseStatusMeta(item.status, colors);
  return (
    <View style={styles.hero}>
      <View style={styles.heroTopRow}>
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={12} color={meta.fg} />
          <Text
            style={[styles.statusText, { color: meta.fg, fontFamily: fonts.sansSemiBold }]}
          >
            {meta.label}
          </Text>
        </View>
        {item.case_number ? (
          <Text
            style={[
              styles.heroCaseNumber,
              { color: colors.textMuted, fontFamily: fonts.sansMedium },
            ]}
          >
            #{item.case_number}
          </Text>
        ) : null}
      </View>
      <Text
        style={[styles.heroTitle, { color: colors.text, fontFamily: fonts.sansBold }]}
        numberOfLines={3}
      >
        {item.title}
      </Text>
      <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
    </View>
  );
}

function DetailsCard({ item }: { item: CaseSummary }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.detailsCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          shadowColor: colors.cardShadow,
        },
      ]}
    >
      <DetailRow
        icon="person-outline"
        label="Client"
        value={item.client_name ?? 'Unassigned'}
        muted={!item.client_name}
      />
      <Divider />
      <DetailRow
        icon="pricetag-outline"
        label="Case Type"
        value={item.case_type ?? 'Not specified'}
        muted={!item.case_type}
      />
      <Divider />
      <DetailRow
        icon="calendar-outline"
        label="Opened"
        value={formatDate(item.opened_at)}
      />
      {item.status === 'closed' ? (
        <>
          <Divider />
          <DetailRow
            icon="checkmark-done-outline"
            label="Closed"
            value={formatDate(item.closed_at)}
          />
        </>
      ) : null}
      {item.notes ? (
        <>
          <Divider />
          <DetailRow
            icon="document-text-outline"
            label="Notes"
            value={item.notes}
            multiline
          />
        </>
      ) : null}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  muted,
  multiline,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  muted?: boolean;
  multiline?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.detailRow}>
      <View
        style={[
          styles.detailIcon,
          { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
        ]}
      >
        <Ionicons name={icon} size={15} color={colors.accent} />
      </View>
      <View style={styles.detailText}>
        <Text
          style={[
            styles.detailLabel,
            { color: colors.textMuted, fontFamily: fonts.sansMedium },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.detailValue,
            {
              color: muted ? colors.textMuted : colors.text,
              fontFamily: fonts.sansSemiBold,
            },
          ]}
          numberOfLines={multiline ? undefined : 2}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />;
}

function OrderCard({ item }: { item: OrderSummary }) {
  const { colors } = useTheme();
  const meta = orderStatusMeta(item.status, colors);
  return (
    <View
      style={[
        styles.orderCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          shadowColor: colors.cardShadow,
        },
      ]}
    >
      <View style={styles.orderHeader}>
        <Text
          style={[styles.orderTitle, { color: colors.text, fontFamily: fonts.sansBold }]}
          numberOfLines={2}
        >
          {formatOrderTitle(item.service_type_label)}
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
          styles.orderSub,
          { color: colors.textMuted, fontFamily: fonts.sansMedium },
        ]}
      >
        {item.current_step_label?.trim() ||
          (item.current_step ? item.current_step.replace(/_/g, ' ') : 'Awaiting first step')}
      </Text>
      <View style={styles.orderMetaRow}>
        {item.state ? (
          <OrderMeta icon="location-outline" label={item.state} />
        ) : null}
        {item.due_date ? (
          <OrderMeta icon="calendar-outline" label={`Due ${formatDate(item.due_date)}`} />
        ) : null}
      </View>
      <View style={[styles.orderFooter, { borderTopColor: colors.cardBorder }]}>
        <Text
          style={[
            styles.footerText,
            { color: colors.textMuted, fontFamily: fonts.sansMedium },
          ]}
        >
          {item.order_date ? `Ordered ${formatDate(item.order_date)}` : 'Order date pending'}
        </Text>
      </View>
    </View>
  );
}

function OrderMeta({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.orderMeta}>
      <Ionicons name={icon} size={12} color={colors.textMuted} />
      <Text
        style={{ color: colors.textMuted, fontFamily: fonts.sansMedium, fontSize: 12 }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCaseNumber: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 30,
  },
  accentBar: {
    width: 48,
    height: 3,
    borderRadius: 2,
    marginTop: spacing.xs,
  },
  detailsCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailText: { flex: 1, gap: 2 },
  detailLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  detailValue: {
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
  sectionTitle: {
    fontSize: 20,
  },
  sectionCount: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  orderList: {
    gap: spacing.md,
  },
  orderCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 5,
    gap: spacing.sm,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  orderTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
  },
  orderSub: {
    fontSize: 13,
  },
  orderMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  orderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orderFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  footerText: {
    fontSize: 12,
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
