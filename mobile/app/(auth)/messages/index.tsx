import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  ConversationSummary,
  deleteConversation,
  getConversations,
} from '../../../lib/messages';

const POLL_INTERVAL_MS = 8000;

function initialsFrom(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelative(ts: number | null): string {
  if (!ts) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - ts);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  const d = new Date(ts * 1000);
  return d.toLocaleDateString();
}

function ItemSeparator() {
  return <View style={{ height: spacing.sm }} />;
}

export default function MessagesScreen() {
  const { colors } = useTheme();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    const result = await getConversations();
    if (!mountedRef.current) return;
    if (result.ok) {
      setConversations(result.data.conversations);
    } else {
      setError(result.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(() => {
        load(true);
      }, POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const handlePressItem = useCallback((item: ConversationSummary) => {
    const name = item.client_name ?? '';
    router.push(
      `/(auth)/messages/${item.id}?name=${encodeURIComponent(name)}` as never,
    );
  }, []);

  const handleLongPressItem = useCallback((item: ConversationSummary) => {
    const name = item.client_name || 'this conversation';
    Alert.alert(
      'Delete conversation?',
      `This will permanently delete the conversation with ${name} and all of its messages. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setConversations((prev) => prev.filter((c) => c.id !== item.id));
            const result = await deleteConversation(item.id);
            if (!result.ok) {
              setError(result.message);
              load();
            }
          },
        },
      ],
    );
  }, [load]);

  const handleNew = useCallback(() => {
    router.push('/(auth)/messages/new' as never);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ConversationSummary }) => (
      <ConversationCard
        item={item}
        onPress={handlePressItem}
        onLongPress={handleLongPressItem}
      />
    ),
    [handlePressItem, handleLongPressItem],
  );

  const keyExtractor = useCallback((c: ConversationSummary) => c.id, []);

  const ListEmpty = !loading && !error ? (
    <View
      style={[
        styles.emptyBox,
        { borderColor: colors.cardBorder, backgroundColor: colors.card },
      ]}
    >
      <Ionicons name="chatbubbles-outline" size={28} color={colors.textMuted} />
      <Text
        style={[styles.emptyTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}
      >
        No conversations yet
      </Text>
      <Text
        style={[styles.emptyBody, { color: colors.textMuted, fontFamily: fonts.sans }]}
      >
        Tap the + button to start a new conversation with one of your clients.
      </Text>
    </View>
  ) : null;

  if (loading && conversations.length === 0) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Messages" />
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        <NewConversationFab onPress={handleNew} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Messages" />
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
          <Pressable onPress={() => load()} hitSlop={10}>
            <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={conversations}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={ItemSeparator}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
      />
      <NewConversationFab onPress={handleNew} />
    </SafeAreaView>
  );
}

const ConversationCard = memo(function ConversationCard({
  item,
  onPress,
  onLongPress,
}: {
  item: ConversationSummary;
  onPress: (item: ConversationSummary) => void;
  onLongPress: (item: ConversationSummary) => void;
}) {
  const { colors } = useTheme();
  const name = item.client_name || 'Unknown client';
  const initials = initialsFrom(name);
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  const handleLongPress = useCallback(() => onLongPress(item), [onLongPress, item]);
  const unread = item.unread_count > 0;

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: unread ? colors.accentBorder : colors.cardBorder,
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
      <View style={styles.body}>
        <View style={styles.row}>
          <Text
            style={[styles.name, { color: colors.text, fontFamily: fonts.sansBold }]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text
            style={[styles.time, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
          >
            {formatRelative(item.last_message_at ?? item.updated_at)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text
            style={[
              styles.preview,
              {
                color: unread ? colors.text : colors.textMuted,
                fontFamily: unread ? fonts.sansSemiBold : fonts.sans,
              },
            ]}
            numberOfLines={1}
          >
            {item.last_message_preview || 'Start the conversation…'}
          </Text>
          {unread ? (
            <View style={[styles.badge, { backgroundColor: colors.accent }]}>
              <Text
                style={{
                  color: colors.background,
                  fontFamily: fonts.sansBold,
                  fontSize: 11,
                }}
              >
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

function NewConversationFab({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: colors.accent,
          shadowColor: colors.cardShadow,
          transform: [{ scale: pressed ? 0.95 : 1 }],
          opacity: pressed ? 0.92 : 1,
        },
      ]}
      hitSlop={8}
    >
      <Ionicons name="add" size={28} color={colors.background} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 3,
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
  body: { flex: 1, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: { flex: 1, fontSize: 15, lineHeight: 19 },
  time: { fontSize: 11, letterSpacing: 0.4 },
  preview: { flex: 1, fontSize: 13, lineHeight: 17 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
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
  emptyTitle: { fontSize: 16 },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
});
