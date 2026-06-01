import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { SearchBar } from '../../components/SearchBar';
import { type AppColors, fonts, radius, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  listProntoTransactions,
  type ProntoTransaction,
  type ProntoTransactionsSummary,
} from '../../lib/pronto';

type StatusFilter = 'all' | 'completed' | 'refunded';
type RangePreset = 'all' | 'month' | 'd30' | 'd90' | 'custom';

const STATUS_PILLS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'refunded', label: 'Refunded' },
];

const RANGE_PILLS: { key: RangePreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: 'd30', label: 'Last 30d' },
  { key: 'd90', label: 'Last 90d' },
  { key: 'custom', label: 'Custom' },
];

function formatMoney(cents: number, currency = 'USD'): string {
  const sym = currency.toUpperCase() === 'USD' ? '$' : `${currency} `;
  return `${sym}${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function startOfMonth(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1, 0, 0, 0, 0);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function ProntoTransactionsScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [summary, setSummary] = useState<ProntoTransactionsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null);

  const load = useCallback(async () => {
    const res = await listProntoTransactions();
    if (res.ok) {
      setSummary(res.data);
      setError(null);
    } else {
      setError(res.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const currency = summary?.currency ?? 'USD';
  const txns = summary?.transactions ?? [];

  const range = useMemo<{ from: Date | null; to: Date | null }>(() => {
    switch (preset) {
      case 'month':
        return { from: startOfMonth(), to: null };
      case 'd30':
        return { from: daysAgo(30), to: null };
      case 'd90':
        return { from: daysAgo(90), to: null };
      case 'custom':
        return { from: customFrom, to: customTo };
      default:
        return { from: null, to: null };
    }
  }, [preset, customFrom, customTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txns.filter((t) => {
      if (status !== 'all' && t.status !== status) return false;
      const created = new Date(t.created_at);
      if (range.from && created < range.from) return false;
      if (range.to) {
        const end = new Date(range.to);
        end.setHours(23, 59, 59, 999);
        if (created > end) return false;
      }
      if (q && !t.client_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [txns, search, status, range]);

  const filteredNet = useMemo(
    () => filtered.reduce((sum, t) => sum + t.net_cents, 0),
    [filtered],
  );

  const onPickerChange = (target: 'from' | 'to') => (
    event: DateTimePickerEvent,
    selected?: Date,
  ) => {
    if (Platform.OS !== 'ios') setPicker(null);
    if (event.type === 'dismissed' || !selected) return;
    if (target === 'from') setCustomFrom(selected);
    else setCustomTo(selected);
  };

  const renderPill = (
    active: boolean,
    label: string,
    onPress: () => void,
    key: string,
  ) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: active ? colors.accentTint : colors.card,
          borderColor: active ? colors.accentBorder : colors.cardBorder,
        },
      ]}
    >
      <Text
        style={{
          color: active ? colors.accent : colors.textMuted,
          fontFamily: fonts.sansSemiBold,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title="Payment History"
        eyebrow="Pronto"
        onBack={() => router.back()}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : error ? (
          <Pressable
            onPress={onRefresh}
            style={[
              styles.errorCard,
              { borderColor: colors.cardBorder, backgroundColor: colors.card },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
            <Text style={{ color: colors.danger, fontFamily: fonts.sansMedium, flex: 1 }}>
              {error}
            </Text>
            <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>Retry</Text>
          </Pressable>
        ) : (
          <>
            {/* Summary cards */}
            <View style={styles.summaryRow}>
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <Text style={[styles.summaryLabel, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}>
                  Total
                </Text>
                <Text style={[styles.summaryValue, { color: colors.text, fontFamily: fonts.sansBold }]}>
                  {formatMoney(summary?.total_net_cents ?? 0, currency)}
                </Text>
              </View>
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <Text style={[styles.summaryLabel, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}>
                  This Month
                </Text>
                <Text style={[styles.summaryValue, { color: colors.text, fontFamily: fonts.sansBold }]}>
                  {formatMoney(summary?.month_net_cents ?? 0, currency)}
                </Text>
              </View>
            </View>

            {/* Search */}
            <View style={{ marginTop: spacing.lg }}>
              <SearchBar value={search} onChangeText={setSearch} placeholder="Search by client" />
            </View>

            {/* Status pills */}
            <View style={styles.pillRow}>
              {STATUS_PILLS.map((p) =>
                renderPill(status === p.key, p.label, () => setStatus(p.key), `st-${p.key}`),
              )}
            </View>

            {/* Date range pills */}
            <View style={styles.pillRow}>
              {RANGE_PILLS.map((p) =>
                renderPill(preset === p.key, p.label, () => setPreset(p.key), `rg-${p.key}`),
              )}
            </View>

            {/* Custom range pickers */}
            {preset === 'custom' ? (
              <View style={styles.customRow}>
                <Pressable
                  onPress={() => setPicker('from')}
                  style={[styles.dateBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                  <Text style={{ color: colors.text, fontFamily: fonts.sans, fontSize: 13 }}>
                    {customFrom ? formatDate(customFrom.toISOString()) : 'From'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPicker('to')}
                  style={[styles.dateBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                  <Text style={{ color: colors.text, fontFamily: fonts.sans, fontSize: 13 }}>
                    {customTo ? formatDate(customTo.toISOString()) : 'To'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {picker ? (
              <>
                <DateTimePicker
                  value={(picker === 'from' ? customFrom : customTo) ?? new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={onPickerChange(picker)}
                />
                {Platform.OS === 'ios' ? (
                  <Pressable onPress={() => setPicker(null)} style={styles.pickerDone}>
                    <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>Done</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}

            {/* Filtered subtotal */}
            <Text style={[styles.subtotal, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}>
              Showing {filtered.length} · {formatMoney(filteredNet, currency)} net
            </Text>

            {/* List */}
            {filtered.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { borderColor: colors.cardBorder, backgroundColor: colors.card },
                ]}
              >
                <Ionicons name="receipt-outline" size={28} color={colors.textMuted} />
                <Text style={{ color: colors.text, fontFamily: fonts.sansSemiBold, marginTop: spacing.sm }}>
                  No payments
                </Text>
                <Text style={{ color: colors.textMuted, fontFamily: fonts.sans, textAlign: 'center', marginTop: 2 }}>
                  Pronto payments will appear here once clients pay your retainers.
                </Text>
              </View>
            ) : (
              filtered.map((t) => (
                <TransactionRow key={t.id} tx={t} currency={currency} colors={colors} />
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TransactionRow({
  tx,
  currency,
  colors,
}: {
  tx: ProntoTransaction;
  currency: string;
  colors: AppColors;
}) {
  const refunded = tx.status === 'refunded';
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, { color: colors.text, fontFamily: fonts.sansSemiBold }]} numberOfLines={1}>
          {tx.client_name}
        </Text>
        <Text style={{ color: colors.textMuted, fontFamily: fonts.sans, fontSize: 12, marginTop: 2 }}>
          {formatDate(tx.created_at)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.rowAmount, { color: colors.text, fontFamily: fonts.sansBold }]}>
          {formatMoney(tx.net_cents, currency)}
        </Text>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: refunded ? 'rgba(224,82,82,0.12)' : colors.accentTint,
              borderColor: refunded ? colors.danger : colors.accentBorder,
            },
          ]}
        >
          <Text
            style={{
              color: refunded ? colors.danger : colors.accent,
              fontFamily: fonts.sansSemiBold,
              fontSize: 11,
            }}
          >
            {refunded ? 'Refunded' : 'Completed'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl * 2 },
  summaryRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  summaryLabel: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  summaryValue: { fontSize: 22, marginTop: spacing.xs },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  customRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  subtotal: { marginTop: spacing.lg, marginBottom: spacing.sm, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowName: { fontSize: 15 },
  rowAmount: { fontSize: 16 },
  badge: {
    marginTop: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  emptyCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.sm,
  },
  pickerDone: { alignSelf: 'flex-end', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
