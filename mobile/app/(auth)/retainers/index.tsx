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
import Animated, { Easing, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { SearchBar } from '../../../components/SearchBar';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { RetainerSummary, getRetainers } from '../../../lib/retainers';
import {
  formatRetainerDate,
  formatSlug,
  retainerStatusMeta,
} from '../../../lib/retainerStatus';
import { screenEdges } from '../../../lib/safeAreaEdges';

/** Statuses that count as "signed" in the summary tile. */
const SIGNED_STATUSES = new Set(['completed', 'signed']);

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

export default function RetainersScreen() {
  const { colors } = useTheme();
  const [retainers, setRetainers] = useState<RetainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const query = useDebouncedValue(input, 150);

  // Search is deliberately name-only — the field is labelled "Search by client
  // name", so matching on status or matter type would surprise the attorney.
  const indexed = useMemo(
    () => retainers.map((r) => ({ item: r, name: r.name.toLowerCase() })),
    [retainers],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return retainers;
    const out: RetainerSummary[] = [];
    for (const entry of indexed) {
      if (entry.name.includes(q)) out.push(entry.item);
    }
    return out;
  }, [indexed, retainers, query]);
  const isFiltering = query.trim().length > 0;

  const signedCount = useMemo(
    () =>
      retainers.filter((r) =>
        SIGNED_STATUSES.has((r.envelope_status ?? '').toLowerCase().trim()),
      ).length,
    [retainers],
  );

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    const result = await getRetainers();
    if (result.ok) {
      setRetainers(result.data.retainers);
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

  const handlePressItem = useCallback((id: string) => {
    router.push(`/(auth)/retainers/${id}` as never);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: RetainerSummary }) => (
      <RetainerCard item={item} onPress={handlePressItem} />
    ),
    [handlePressItem],
  );

  const keyExtractor = useCallback((r: RetainerSummary) => r.id, []);

  const ListHeader = (
    <>
      {retainers.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(420).easing(Easing.out(Easing.cubic))}
          style={styles.searchWrap}
        >
          <SearchBar
            value={input}
            onChangeText={setInput}
            placeholder="Search by client name"
          />
          {isFiltering ? (
            <Text
              style={[
                styles.filterHint,
                { color: colors.textMuted, fontFamily: fonts.sansMedium },
              ]}
            >
              {filtered.length} of {retainers.length}
            </Text>
          ) : null}
        </Animated.View>
      )}

      {retainers.length > 0 ? (
        <Animated.View
          entering={FadeInDown.duration(500).easing(Easing.out(Easing.cubic))}
          style={styles.summaryRow}
        >
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
            <Text
              style={[
                styles.summaryValue,
                { color: colors.accent, fontFamily: fonts.sansBold },
              ]}
            >
              {retainers.length}
            </Text>
            <Text
              style={[
                styles.summaryLabel,
                { color: colors.textMuted, fontFamily: fonts.sansMedium },
              ]}
            >
              Retainers
            </Text>
          </View>
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
            <Text
              style={[
                styles.summaryValue,
                { color: colors.success, fontFamily: fonts.sansBold },
              ]}
            >
              {signedCount}
            </Text>
            <Text
              style={[
                styles.summaryLabel,
                { color: colors.textMuted, fontFamily: fonts.sansMedium },
              ]}
            >
              Signed
            </Text>
          </View>
        </Animated.View>
      ) : null}

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
            <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>
              Retry
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </>
  );

  const ListEmpty = (
    <>
      {!error && retainers.length === 0 && !loading && (
        <Animated.View
          entering={FadeInUp.duration(450).easing(Easing.out(Easing.cubic))}
          style={[
            styles.emptyBox,
            { borderColor: colors.cardBorder, backgroundColor: colors.card },
          ]}
        >
          <Ionicons name="document-text-outline" size={28} color={colors.textMuted} />
          <Text
            style={[
              styles.emptyTitle,
              { color: colors.text, fontFamily: fonts.sansSemiBold },
            ]}
          >
            No retainer agreements
          </Text>
          <Text
            style={[
              styles.emptyBody,
              { color: colors.textMuted, fontFamily: fonts.sans },
            ]}
          >
            Retainers sent on your behalf will appear here.
          </Text>
        </Animated.View>
      )}

      {!error && retainers.length > 0 && (
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
            No retainers match “{query.trim()}”.
          </Text>
        </View>
      )}
    </>
  );

  if (loading && retainers.length === 0) {
    return (
      <SafeAreaView
        edges={screenEdges}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Retainer Agreements" />
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={screenEdges}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Retainer Agreements" />
      <FlatList
        data={filtered}
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
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const RetainerCard = memo(function RetainerCard({
  item,
  onPress,
}: {
  item: RetainerSummary;
  onPress: (id: string) => void;
}) {
  const { colors } = useTheme();
  const meta = retainerStatusMeta(item.envelope_status, colors);
  const matterType = formatSlug(item.matter_type);
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
          transform: [{ scale: pressed ? 0.985 : 1 }],
          opacity: pressed ? 0.94 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text
          style={[styles.cardName, { color: colors.text, fontFamily: fonts.sansBold }]}
          numberOfLines={1}
        >
          {item.name}
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
          styles.matterType,
          {
            color: matterType ? colors.textMuted : colors.textSubtle,
            fontFamily: fonts.sansMedium,
          },
        ]}
        numberOfLines={1}
      >
        {matterType ?? 'Matter type not set'}
      </Text>

      <View style={[styles.cardFooter, { borderTopColor: colors.cardBorder }]}>
        <View style={styles.footerItem}>
          <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
          <Text
            style={[
              styles.footerText,
              { color: colors.textMuted, fontFamily: fonts.sansMedium },
            ]}
          >
            {formatRetainerDate(item.created_at)}
          </Text>
        </View>
        <View style={styles.viewRow}>
          <Text
            style={[styles.viewText, { color: colors.accent, fontFamily: fonts.sansSemiBold }]}
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
    paddingHorizontal: spacing.md,
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
    shadowRadius: 14,
    elevation: 5,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardName: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
  },
  matterType: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
  },
  emptyTitle: { fontSize: 16 },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
