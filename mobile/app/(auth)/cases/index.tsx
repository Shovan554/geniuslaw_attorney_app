import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { SearchBar } from '../../../components/SearchBar';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { caseStatusMeta } from '../../../lib/orderStatus';
import { CaseStatus, CaseSummary, getCases } from '../../../lib/cases';

const STATUS_KEYS: CaseStatus[] = ['open', 'in_progress', 'closed'];

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

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function ItemSeparator() {
  return <View style={{ height: spacing.md }} />;
}

export default function CasesListScreen() {
  const { colors } = useTheme();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const query = useDebouncedValue(input, 150);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    const result = await getCases();
    if (result.ok) {
      setCases(result.data.cases);
    } else {
      setError(result.message);
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

  const counts = useMemo(() => {
    const c: Record<CaseStatus, number> = { open: 0, in_progress: 0, closed: 0 };
    for (const k of cases) c[k.status] += 1;
    return c;
  }, [cases]);

  const indexedCases = useMemo(
    () =>
      cases.map((c) => ({
        item: c,
        search: [c.title, c.case_number, c.client_name, c.case_type]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      })),
    [cases]
  );

  const filteredCases = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cases;
    const out: CaseSummary[] = [];
    for (const entry of indexedCases) {
      if (entry.search.includes(q)) out.push(entry.item);
    }
    return out;
  }, [indexedCases, cases, query]);
  const isFiltering = query.trim().length > 0;

  const handlePressItem = useCallback((id: number) => {
    router.push(`/(auth)/cases/${id}` as never);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: CaseSummary }) => (
      <CaseCard item={item} onPress={handlePressItem} />
    ),
    [handlePressItem]
  );

  const keyExtractor = useCallback((c: CaseSummary) => String(c.id), []);

  const ListHeader = (
    <>
      {cases.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(420).easing(Easing.out(Easing.cubic))}
          style={styles.searchWrap}
        >
          <SearchBar
            value={input}
            onChangeText={setInput}
            placeholder="Search cases, clients, case #"
          />
          {isFiltering ? (
            <Text
              style={[
                styles.filterHint,
                { color: colors.textMuted, fontFamily: fonts.sansMedium },
              ]}
            >
              {filteredCases.length} of {cases.length}
            </Text>
          ) : null}
        </Animated.View>
      )}

      {cases.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(450).easing(Easing.out(Easing.cubic))}
          style={styles.summaryRow}
        >
          {STATUS_KEYS.map((s, idx) => {
            const meta = caseStatusMeta(s, colors);
            return (
              <Animated.View
                key={s}
                entering={FadeInUp.delay(idx * 90)
                  .duration(500)
                  .easing(Easing.out(Easing.cubic))}
                style={[
                  styles.summaryCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                    shadowColor: colors.cardShadow,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.summaryValue,
                    { color: meta.fg, fontFamily: fonts.sansBold },
                  ]}
                >
                  {counts[s]}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: colors.textMuted, fontFamily: fonts.sansMedium },
                  ]}
                >
                  {meta.label}
                </Text>
              </Animated.View>
            );
          })}
        </Animated.View>
      )}

      {error && (
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
              style={{
                color: colors.accent,
                fontFamily: fonts.sansSemiBold,
              }}
            >
              Retry
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </>
  );

  const ListEmpty = (
    <>
      {!error && cases.length === 0 && !loading && (
        <Animated.View
          entering={FadeInUp.duration(450).easing(Easing.out(Easing.cubic))}
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
            No cases yet
          </Text>
          <Text
            style={[
              styles.emptyBody,
              { color: colors.textMuted, fontFamily: fonts.sans },
            ]}
          >
            Cases assigned to you will appear here.
          </Text>
        </Animated.View>
      )}

      {!error && cases.length > 0 && (
        <View
          style={[
            styles.emptyBox,
            { borderColor: colors.cardBorder, backgroundColor: colors.card },
          ]}
        >
          <Ionicons name="search-outline" size={26} color={colors.textMuted} />
          <Text
            style={[
              styles.emptyTitle,
              { color: colors.text, fontFamily: fonts.sansSemiBold },
            ]}
          >
            No matches
          </Text>
          <Text
            style={[
              styles.emptyBody,
              { color: colors.textMuted, fontFamily: fonts.sans },
            ]}
          >
            No cases match “{query.trim()}”.
          </Text>
        </View>
      )}
    </>
  );

  if (loading && cases.length === 0) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Cases" />
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Cases" />
      <FlatList
        data={filteredCases}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ItemSeparatorComponent={ItemSeparator}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const CaseCard = memo(function CaseCard({
  item,
  onPress,
}: {
  item: CaseSummary;
  onPress: (id: number) => void;
}) {
  const { colors } = useTheme();
  const meta = caseStatusMeta(item.status, colors);
  const caseNumberLabel = item.case_number?.trim() || 'Case number pending';
  const caseNumberMuted = !item.case_number?.trim();
  const handlePress = useCallback(() => onPress(item.id), [onPress, item.id]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          shadowColor: colors.cardShadow,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text
          style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansBold }]}
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
            color: caseNumberMuted ? colors.textSubtle : colors.textMuted,
            fontFamily: fonts.sansMedium,
          },
        ]}
      >
        {caseNumberLabel}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
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
        </View>
        {item.case_type ? (
          <View
            style={[
              styles.typeBadge,
              { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
            ]}
          >
            <Text
              style={{
                color: colors.accent,
                fontFamily: fonts.sansSemiBold,
                fontSize: 11,
                letterSpacing: 0.4,
              }}
              numberOfLines={1}
            >
              {item.case_type}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.cardFooter, { borderTopColor: colors.cardBorder }]}>
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
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  searchWrap: {
    gap: 6,
    marginBottom: spacing.md,
  },
  filterHint: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  summaryValue: {
    fontSize: 26,
    lineHeight: 30,
  },
  summaryLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 2,
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
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
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
  caseNumber: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  metaItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  footerText: {
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
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
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
    marginTop: spacing.md,
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
