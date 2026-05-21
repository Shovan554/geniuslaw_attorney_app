import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SearchBar } from '../../../components/SearchBar';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  MessageableClient,
  createConversation,
  getMessageableClients,
} from '../../../lib/messages';

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ItemSeparator() {
  return <View style={{ height: spacing.sm }} />;
}

export default function NewConversationScreen() {
  const { colors } = useTheme();
  const [clients, setClients] = useState<MessageableClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const query = useDebouncedValue(input, 150);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getMessageableClients();
    if (result.ok) {
      setClients(result.data.clients);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const indexed = useMemo(
    () =>
      clients.map((c) => ({
        item: c,
        search: [c.full_name, c.email, c.state, c.phone].filter(Boolean).join(' ').toLowerCase(),
      })),
    [clients],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    const out: MessageableClient[] = [];
    for (const entry of indexed) {
      if (entry.search.includes(q)) out.push(entry.item);
    }
    return out;
  }, [indexed, clients, query]);

  const handlePick = useCallback(async (client: MessageableClient) => {
    if (creatingFor !== null) return;
    setCreatingFor(client.id);
    const result = await createConversation(client.id);
    setCreatingFor(null);
    if (result.ok) {
      const name = encodeURIComponent(result.data.client_name ?? client.full_name);
      router.replace(`/(auth)/messages/${result.data.id}?name=${name}` as never);
    } else {
      setError(result.message);
    }
  }, [creatingFor]);

  const renderItem = useCallback(
    ({ item }: { item: MessageableClient }) => (
      <ClientRow item={item} onPress={handlePick} pending={creatingFor === item.id} />
    ),
    [handlePick, creatingFor],
  );

  const keyExtractor = useCallback((c: MessageableClient) => String(c.id), []);

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text
          style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}
          numberOfLines={1}
        >
          New conversation
        </Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.searchWrap}>
        <SearchBar
          value={input}
          onChangeText={setInput}
          placeholder="Search your clients"
        />
      </View>

      {error ? (
        <View
          style={[
            styles.errorBox,
            { borderColor: colors.cardBorder, backgroundColor: colors.card },
          ]}
        >
          <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger, fontFamily: fonts.sansMedium }]}>
            {error}
          </Text>
          <Pressable onPress={load} hitSlop={10}>
            <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={ItemSeparator}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View
              style={[
                styles.emptyBox,
                { borderColor: colors.cardBorder, backgroundColor: colors.card },
              ]}
            >
              <Ionicons name="people-outline" size={28} color={colors.textMuted} />
              <Text
                style={[styles.emptyTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}
              >
                {clients.length === 0 ? 'No clients with the app yet' : 'No matches'}
              </Text>
              <Text
                style={[styles.emptyBody, { color: colors.textMuted, fontFamily: fonts.sans }]}
              >
                {clients.length === 0
                  ? 'You can only start conversations with clients who have signed into the mobile app.'
                  : `No clients match "${query.trim()}".`}
              </Text>
            </View>
          }
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </SafeAreaView>
  );
}

const ClientRow = memo(function ClientRow({
  item,
  onPress,
  pending,
}: {
  item: MessageableClient;
  onPress: (c: MessageableClient) => void;
  pending: boolean;
}) {
  const { colors } = useTheme();
  const initials = initialsFrom(item.full_name);
  const handlePress = useCallback(() => onPress(item), [onPress, item]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={pending}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          shadowColor: colors.cardShadow,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          opacity: pending ? 0.6 : pressed ? 0.94 : 1,
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
      <View style={styles.rowBody}>
        <Text
          style={[styles.rowName, { color: colors.text, fontFamily: fonts.sansBold }]}
          numberOfLines={1}
        >
          {item.full_name}
        </Text>
        {item.email ? (
          <Text
            style={[styles.rowMeta, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
            numberOfLines={1}
          >
            {item.email}
          </Text>
        ) : null}
      </View>
      {pending ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.accent} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, lineHeight: 19 },
  rowMeta: { fontSize: 12 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  errorText: { flex: 1, fontSize: 13 },
  emptyBox: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  emptyTitle: { fontSize: 16, textAlign: 'center' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
