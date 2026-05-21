import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { getUserId } from '../../../lib/auth';
import {
  MessageItem,
  getMessages,
  markRead,
  sendMessage,
} from '../../../lib/messages';

const POLL_INTERVAL_MS = 8000;

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a * 1000);
  const db = new Date(b * 1000);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatDay(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date();
  if (isSameDay(Math.floor(today.getTime() / 1000), ts)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(Math.floor(yesterday.getTime() / 1000), ts)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

type Row = { kind: 'msg'; msg: MessageItem; showHeader: boolean } | { kind: 'day'; ts: number };

function buildRows(messages: MessageItem[]): Row[] {
  const rows: Row[] = [];
  let prev: MessageItem | null = null;
  for (const m of messages) {
    if (!prev || !isSameDay(prev.created_at, m.created_at)) {
      rows.push({ kind: 'day', ts: m.created_at });
    }
    const showHeader =
      !prev ||
      prev.sender_user_id !== m.sender_user_id ||
      m.created_at - prev.created_at > 300 ||
      !isSameDay(prev.created_at, m.created_at);
    rows.push({ kind: 'msg', msg: m, showHeader });
    prev = m;
  }
  return rows;
}

export default function ConversationThreadScreen() {
  const { colors } = useTheme();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const conversationId = String(id);
  const headerTitle = name && name.length > 0 ? String(name) : 'Conversation';

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const listRef = useRef<FlatList<Row>>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    getUserId().then((id) => {
      if (mountedRef.current) setUserId(id);
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (isPoll = false) => {
      if (!isPoll) setLoading(true);
      const result = await getMessages(conversationId, { limit: 50 });
      if (!mountedRef.current) return;
      if (result.ok) {
        setMessages(result.data.messages);
        setError(null);
        markRead(conversationId).catch(() => undefined);
      } else if (!isPoll) {
        setError(result.message);
      }
      setLoading(false);
    },
    [conversationId],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(() => {
        load(true);
      }, POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [load]),
  );

  const rows = useMemo(() => buildRows(messages), [messages]);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    const result = await sendMessage(conversationId, body);
    if (!mountedRef.current) return;
    if (result.ok) {
      setMessages((prev) => [...prev, result.data]);
      setError(null);
    } else {
      setError(result.message);
      setText(body);
    }
    setSending(false);
  }, [text, sending, conversationId]);

  const keyExtractor = useCallback((row: Row, idx: number) => {
    if (row.kind === 'day') return `day-${row.ts}-${idx}`;
    return row.msg.id;
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'day') {
        return (
          <View style={styles.daySeparator}>
            <Text
              style={[
                styles.dayText,
                { color: colors.textMuted, fontFamily: fonts.sansMedium },
              ]}
            >
              {formatDay(item.ts)}
            </Text>
          </View>
        );
      }
      const m = item.msg;
      const mine = userId !== null && m.sender_user_id === userId;
      return (
        <View
          style={[
            styles.bubbleRow,
            mine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
          ]}
        >
          <View
            style={[
              styles.bubble,
              mine
                ? {
                    backgroundColor: colors.accent,
                    borderColor: colors.accentBorder,
                    borderBottomRightRadius: 4,
                  }
                : {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                    borderBottomLeftRadius: 4,
                  },
            ]}
          >
            {!mine && item.showHeader && m.sender_name ? (
              <Text
                style={[
                  styles.senderName,
                  { color: colors.accent, fontFamily: fonts.sansSemiBold },
                ]}
              >
                {m.sender_name}
              </Text>
            ) : null}
            <Text
              style={[
                styles.body,
                {
                  color: mine ? colors.background : colors.text,
                  fontFamily: fonts.sans,
                },
              ]}
            >
              {m.body_text}
            </Text>
            <Text
              style={[
                styles.time,
                {
                  color: mine ? colors.background : colors.textMuted,
                  fontFamily: fonts.sansMedium,
                  opacity: mine ? 0.7 : 1,
                },
              ]}
            >
              {formatTime(m.created_at)}
            </Text>
          </View>
        </View>
      );
    },
    [colors, userId],
  );

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
          {headerTitle}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {loading && messages.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.scroll}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            windowSize={9}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
          />
        )}

        {error ? (
          <View
            style={[
              styles.errorBox,
              { borderColor: colors.cardBorder, backgroundColor: colors.card },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text
              style={[styles.errorText, { color: colors.danger, fontFamily: fonts.sansMedium }]}
              numberOfLines={2}
            >
              {error}
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.composer,
            { borderTopColor: colors.cardBorder, backgroundColor: colors.surface },
          ]}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            multiline
            style={[
              styles.input,
              {
                color: colors.inputText,
                backgroundColor: colors.inputBg,
                borderColor: colors.inputBorder,
                fontFamily: fonts.sans,
              },
            ]}
          />
          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: text.trim() ? colors.accent : colors.btnBg,
                opacity: !text.trim() || sending ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
            hitSlop={8}
          >
            {sending ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Ionicons
                name="send"
                size={20}
                color={text.trim() ? colors.background : colors.textMuted}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  daySeparator: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  dayText: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  senderName: {
    fontSize: 11,
    letterSpacing: 0.3,
  },
  body: { fontSize: 15, lineHeight: 20 },
  time: {
    fontSize: 10,
    letterSpacing: 0.4,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  errorText: { flex: 1, fontSize: 12 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
