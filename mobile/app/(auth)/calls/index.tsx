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
  CallHistoryItem,
  deleteCall,
  getCallHistory,
  initiateCall,
} from '../../../lib/calls';

const POLL_INTERVAL_MS = 12000;

function initialsFrom(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

type CallStyle = {
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  labelColor: string;
};

function styleForCall(item: CallHistoryItem, colors: ReturnType<typeof useTheme>['colors']): CallStyle {
  const duration = formatDuration(item.duration_seconds);
  if (item.status === 'missed') {
    return {
      iconName: 'call-outline',
      iconColor: colors.danger,
      label: 'Missed call',
      labelColor: colors.danger,
    };
  }
  if (item.status === 'rejected') {
    return {
      iconName: 'close-circle-outline',
      iconColor: colors.textMuted,
      label: item.direction === 'incoming' ? 'Declined' : 'Client declined',
      labelColor: colors.textMuted,
    };
  }
  if (item.status === 'cancelled') {
    return {
      iconName: 'remove-circle-outline',
      iconColor: colors.textMuted,
      label: 'Cancelled',
      labelColor: colors.textMuted,
    };
  }
  if (item.status === 'failed') {
    return {
      iconName: 'warning-outline',
      iconColor: colors.danger,
      label: 'Call failed',
      labelColor: colors.danger,
    };
  }
  return {
    iconName: item.direction === 'incoming' ? 'arrow-down-outline' : 'arrow-up-outline',
    iconColor: colors.success,
    label: duration ?? (item.direction === 'incoming' ? 'Incoming' : 'Outgoing'),
    labelColor: colors.textMuted,
  };
}

export default function CallsScreen() {
  const { colors } = useTheme();
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callingUserId, setCallingUserId] = useState<number | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    const result = await getCallHistory();
    if (!mountedRef.current) return;
    if (result.ok) {
      setCalls(result.data.calls);
    } else {
      setError(result.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load(true);
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

  const handlePressItem = useCallback(
    async (item: CallHistoryItem) => {
      if (callingUserId !== null) return;
      setCallingUserId(item.other_party_user_id);
      const result = await initiateCall(item.other_party_user_id, item.case_id, item.is_video);
      if (!mountedRef.current) return;
      setCallingUserId(null);
      if (result.ok) {
        const { call_id, daily_room_url, daily_meeting_token, is_video } = result.data;
        router.push(
          `/(auth)/calls/${call_id}?url=${encodeURIComponent(daily_room_url)}&token=${encodeURIComponent(daily_meeting_token)}&name=${encodeURIComponent(item.other_party_name)}&video=${is_video ? '1' : '0'}` as never,
        );
      } else {
        Alert.alert('Could not start call', result.message);
      }
    },
    [callingUserId],
  );

  const handleLongPressItem = useCallback(
    (item: CallHistoryItem) => {
      Alert.alert(
        'Delete call record?',
        `Remove this call with ${item.other_party_name} from your history?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              const result = await deleteCall(item.id);
              if (result.ok) {
                setCalls((prev) => prev.filter((c) => c.id !== item.id));
              } else {
                Alert.alert('Could not delete', result.message);
              }
            },
          },
        ],
      );
    },
    [],
  );

  const handleNew = useCallback(() => {
    router.push('/(auth)/calls/new' as never);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: CallHistoryItem }) => (
      <CallCard
        item={item}
        onPress={handlePressItem}
        onLongPress={handleLongPressItem}
        pending={callingUserId === item.other_party_user_id}
      />
    ),
    [handlePressItem, handleLongPressItem, callingUserId],
  );

  const keyExtractor = useCallback((c: CallHistoryItem) => c.id, []);

  const ListEmpty = !loading && !error ? (
    <View
      style={[
        styles.emptyBox,
        { borderColor: colors.cardBorder, backgroundColor: colors.card },
      ]}
    >
      <Ionicons name="call-outline" size={28} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
        No calls yet
      </Text>
      <Text style={[styles.emptyBody, { color: colors.textMuted, fontFamily: fonts.sans }]}>
        Tap the call button to start your first call with a client.
      </Text>
    </View>
  ) : null;

  if (loading) {
    return (
      <SafeAreaView
        edges={['top']}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <AppHeader title="Calls" />
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        <NewCallFab onPress={handleNew} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AppHeader title="Calls" />
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
        data={calls}
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
      <NewCallFab onPress={handleNew} />
    </SafeAreaView>
  );
}

const CallCard = memo(function CallCard({
  item,
  onPress,
  onLongPress,
  pending,
}: {
  item: CallHistoryItem;
  onPress: (item: CallHistoryItem) => void;
  onLongPress: (item: CallHistoryItem) => void;
  pending: boolean;
}) {
  const { colors } = useTheme();
  const name = item.other_party_name || 'Unknown';
  const initials = initialsFrom(name);
  const callStyle = styleForCall(item, colors);
  const isMissed = item.status === 'missed';
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  const handleLongPress = useCallback(() => onLongPress(item), [onLongPress, item]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      disabled={pending}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isMissed ? colors.danger : colors.cardBorder,
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
        <Text style={[styles.avatarText, { color: colors.accent, fontFamily: fonts.sansSemiBold }]}>
          {initials}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.row}>
          <Text
            style={[
              styles.name,
              {
                color: isMissed ? colors.danger : colors.text,
                fontFamily: isMissed ? fonts.sansSemiBold : fonts.sansMedium,
              },
            ]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text style={[styles.time, { color: colors.textMuted, fontFamily: fonts.sans }]}>
            {formatRelativeTime(item.started_at)}
          </Text>
        </View>
        <View style={styles.row}>
          <Ionicons name={callStyle.iconName} size={14} color={callStyle.iconColor} />
          <Text
            style={[styles.subtitle, { color: callStyle.labelColor, fontFamily: fonts.sans }]}
            numberOfLines={1}
          >
            {callStyle.label}
            {item.case_title ? ` · ${item.case_title}` : ''}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={handlePress}
        hitSlop={10}
        disabled={pending}
        style={({ pressed }) => [
          styles.callBtn,
          {
            backgroundColor: colors.accentTint,
            borderColor: colors.accentBorder,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        {pending ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : (
          <Ionicons
            name={item.is_video ? 'videocam' : 'call'}
            size={16}
            color={colors.accent}
          />
        )}
      </Pressable>
    </Pressable>
  );
});

function ItemSeparator() {
  return <View style={{ height: spacing.sm }} />;
}

function NewCallFab({ onPress }: { onPress: () => void }) {
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
      <Ionicons name="call" size={22} color="#0B0F1A" />
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: { fontSize: 14, letterSpacing: 0.3 },
  body: { flex: 1, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: { flex: 1, fontSize: 15, lineHeight: 19 },
  time: { fontSize: 11, letterSpacing: 0.4 },
  subtitle: { flex: 1, fontSize: 13, lineHeight: 17 },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
