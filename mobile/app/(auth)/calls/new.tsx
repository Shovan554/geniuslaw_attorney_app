import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  CallableClient,
  getCallableClients,
  initiateCall,
} from '../../../lib/calls';

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function initialsFrom(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function NewCallScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ prefill?: string }>();
  const [clients, setClients] = useState<CallableClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callingFor, setCallingFor] = useState<number | null>(null);
  const [input, setInput] = useState(params.prefill ?? '');
  const query = useDebouncedValue(input, 150);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getCallableClients();
    if (!mountedRef.current) return;
    if (result.ok) {
      setClients(result.data.clients);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const indexed = useMemo(
    () =>
      clients.map((c) => ({
        item: c,
        search: [c.full_name, c.email, c.state, c.phone]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      })),
    [clients],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    const out: CallableClient[] = [];
    for (const entry of indexed) {
      if (entry.search.includes(q)) out.push(entry.item);
    }
    return out;
  }, [indexed, clients, query]);

  const handlePick = useCallback(
    async (client: CallableClient, isVideo: boolean) => {
      if (callingFor !== null) return;
      setCallingFor(client.user_id);
      const result = await initiateCall(client.user_id, null, isVideo);
      if (!mountedRef.current) return;
      setCallingFor(null);
      if (result.ok) {
        const { call_id, daily_room_url, daily_meeting_token, is_video } = result.data;
        router.replace(
          `/(auth)/calls/${call_id}?url=${encodeURIComponent(daily_room_url)}&token=${encodeURIComponent(daily_meeting_token)}&name=${encodeURIComponent(client.full_name)}&video=${is_video ? '1' : '0'}` as never,
        );
      } else {
        Alert.alert('Could not start call', result.message);
      }
    },
    [callingFor],
  );

  const renderItem = useCallback(
    ({ item }: { item: CallableClient }) => (
      <ClientRow item={item} onPress={handlePick} pending={callingFor === item.user_id} />
    ),
    [handlePick, callingFor],
  );

  const keyExtractor = useCallback((c: CallableClient) => String(c.user_id), []);

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
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
          New call
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
          ListEmptyComponent={
            !error ? (
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
                  {query ? 'No matches' : 'No callable clients'}
                </Text>
                <Text
                  style={[styles.emptyBody, { color: colors.textMuted, fontFamily: fonts.sans }]}
                >
                  {query
                    ? 'Try a different name, email, or phone number.'
                    : 'Clients appear here once they have signed into the mobile app.'}
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          initialNumToRender={14}
          maxToRenderPerBatch={14}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
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
  item: CallableClient;
  onPress: (item: CallableClient, isVideo: boolean) => void;
  pending: boolean;
}) {
  const { colors } = useTheme();
  const initials = initialsFrom(item.full_name);
  const handleAudio = useCallback(() => onPress(item, false), [onPress, item]);
  const handleVideo = useCallback(() => onPress(item, true), [onPress, item]);
  const subtitle = [item.email, item.state].filter(Boolean).join(' · ');

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          shadowColor: colors.cardShadow,
          opacity: pending ? 0.6 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.avatar,
          { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
        ]}
      >
        <Text style={[styles.avatarText, { color: colors.accent, fontFamily: fonts.sansSemiBold }]}>
          {initials}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text
          style={[styles.rowName, { color: colors.text, fontFamily: fonts.sansSemiBold }]}
          numberOfLines={1}
        >
          {item.full_name}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.rowSubtitle, { color: colors.textMuted, fontFamily: fonts.sans }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {pending ? (
        <View
          style={[
            styles.callBtn,
            { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
          ]}
        >
          <ActivityIndicator color={colors.accent} size="small" />
        </View>
      ) : (
        <View style={styles.btnGroup}>
          <Pressable
            onPress={handleAudio}
            hitSlop={8}
            style={({ pressed }) => [
              styles.callBtn,
              {
                backgroundColor: colors.accentTint,
                borderColor: colors.accentBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="call" size={16} color={colors.accent} />
          </Pressable>
          <Pressable
            onPress={handleVideo}
            hitSlop={8}
            style={({ pressed }) => [
              styles.callBtn,
              {
                backgroundColor: colors.accentTint,
                borderColor: colors.accentBorder,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="videocam" size={16} color={colors.accent} />
          </Pressable>
        </View>
      )}
    </View>
  );
});

function ItemSeparator() {
  return <View style={{ height: spacing.sm }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, letterSpacing: 0.2 },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: { fontSize: 13, letterSpacing: 0.3 },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, lineHeight: 19 },
  rowSubtitle: { fontSize: 12, lineHeight: 16 },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 13 },
  emptyBox: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  emptyTitle: { fontSize: 16 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
