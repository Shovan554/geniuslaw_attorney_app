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
import { ClientSummary, getClients } from '../../../lib/clients';

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

export default function ClientsScreen() {
  const { colors } = useTheme();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const query = useDebouncedValue(input, 150);

  const indexedClients = useMemo(
    () =>
      clients.map((c) => ({
        item: c,
        search: [c.full_name, c.email, c.state, c.phone]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      })),
    [clients]
  );

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    const out: ClientSummary[] = [];
    for (const entry of indexedClients) {
      if (entry.search.includes(q)) out.push(entry.item);
    }
    return out;
  }, [indexedClients, clients, query]);
  const isFiltering = query.trim().length > 0;

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    const result = await getClients();
    if (result.ok) {
      setClients(result.data.clients);
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

  const totalCases = useMemo(
    () => clients.reduce((acc, c) => acc + c.case_count, 0),
    [clients]
  );

  const handlePressItem = useCallback((id: number) => {
    router.push(`/(auth)/clients/${id}` as never);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ClientSummary }) => (
      <ClientCard item={item} onPress={handlePressItem} />
    ),
    [handlePressItem]
  );

  const keyExtractor = useCallback((c: ClientSummary) => String(c.id), []);

  const ListHeader = (
    <>
      {clients.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(420).easing(Easing.out(Easing.cubic))}
          style={styles.searchWrap}
        >
          <SearchBar
            value={input}
            onChangeText={setInput}
            placeholder="Search clients, email, state"
          />
          {isFiltering ? (
            <Text
              style={[
                styles.filterHint,
                { color: colors.textMuted, fontFamily: fonts.sansMedium },
              ]}
            >
              {filteredClients.length} of {clients.length}
            </Text>
          ) : null}
        </Animated.View>
      )}

      {clients.length > 0 ? (
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
              {clients.length}
            </Text>
            <Text
              style={[
                styles.summaryLabel,
                { color: colors.textMuted, fontFamily: fonts.sansMedium },
              ]}
            >
              Clients
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
                { color: colors.gold, fontFamily: fonts.sansBold },
              ]}
            >
              {totalCases}
            </Text>
            <Text
              style={[
                styles.summaryLabel,
                { color: colors.textMuted, fontFamily: fonts.sansMedium },
              ]}
            >
              Cases
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
      {!error && clients.length === 0 && !loading && (
        <Animated.View
          entering={FadeInUp.duration(450).easing(Easing.out(Easing.cubic))}
          style={[
            styles.emptyBox,
            { borderColor: colors.cardBorder, backgroundColor: colors.card },
          ]}
        >
          <Ionicons name="people-outline" size={28} color={colors.textMuted} />
          <Text
            style={[
              styles.emptyTitle,
              { color: colors.text, fontFamily: fonts.sansSemiBold },
            ]}
          >
            No clients yet
          </Text>
          <Text
            style={[
              styles.emptyBody,
              { color: colors.textMuted, fontFamily: fonts.sans },
            ]}
          >
            Clients will appear here once cases are assigned to you.
          </Text>
        </Animated.View>
      )}

      {!error && clients.length > 0 && (
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
            No clients match “{query.trim()}”.
          </Text>
        </View>
      )}
    </>
  );

  if (loading && clients.length === 0) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <AppHeader title="My Clients" />
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AppHeader title="My Clients" />
      <FlatList
        data={filteredClients}
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

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ClientCard = memo(function ClientCard({
  item,
  onPress,
}: {
  item: ClientSummary;
  onPress: (id: number) => void;
}) {
  const { colors } = useTheme();
  const initials = initialsFrom(item.full_name);
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
      <View
        style={[
          styles.avatar,
          { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
        ]}
      >
        <Text
          style={{
            color: colors.accent,
            fontFamily: fonts.sansBold,
            fontSize: 15,
            letterSpacing: 0.5,
          }}
        >
          {initials}
        </Text>
      </View>
      <View style={styles.clientBody}>
        <Text
          style={[
            styles.clientName,
            { color: colors.text, fontFamily: fonts.sansBold },
          ]}
          numberOfLines={1}
        >
          {item.full_name}
        </Text>
        <View style={styles.clientMetaRow}>
          {item.email ? (
            <View style={styles.clientMetaItem}>
              <Ionicons name="mail-outline" size={12} color={colors.textMuted} />
              <Text
                style={[
                  styles.clientMetaText,
                  { color: colors.textMuted, fontFamily: fonts.sansMedium },
                ]}
                numberOfLines={1}
              >
                {item.email}
              </Text>
            </View>
          ) : null}
          {item.state ? (
            <View style={styles.clientMetaItem}>
              <Ionicons name="location-outline" size={12} color={colors.textMuted} />
              <Text
                style={[
                  styles.clientMetaText,
                  { color: colors.textMuted, fontFamily: fonts.sansMedium },
                ]}
                numberOfLines={1}
              >
                {item.state}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View
        style={[
          styles.countPill,
          { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
        ]}
      >
        <Text
          style={{
            color: colors.accent,
            fontFamily: fonts.sansBold,
            fontSize: 13,
          }}
        >
          {item.case_count}
        </Text>
        <Text
          style={{
            color: colors.accent,
            fontFamily: fonts.sansMedium,
            fontSize: 10,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          {item.case_count === 1 ? 'case' : 'cases'}
        </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 5,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientBody: { flex: 1, gap: 4 },
  clientName: {
    fontSize: 15,
    lineHeight: 19,
  },
  clientMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  clientMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  clientMetaText: {
    fontSize: 12,
  },
  countPill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 56,
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
  emptyTitle: {
    fontSize: 16,
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
