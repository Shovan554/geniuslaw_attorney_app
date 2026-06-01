import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Animated, { Easing, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { DocumentViewerModal } from '../../components/DocumentViewerModal';
import { fonts, radius, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  Availability,
  acceptProntoCall,
  getProntoAvailability,
  listPendingSignings,
  listProntoActiveCalls,
  listSigningHistory,
  setProntoAvailability,
  setProntoEnrollment,
  type PendingSigning,
  type ProntoActiveCall,
  type SigningHistoryItem,
} from '../../lib/pronto';

const ATTORNEY_REASON_LABELS: Record<string, string> = {
  payment_not_received: 'Client never paid',
  client_unreachable: 'Client unreachable',
  conflict: 'Conflict of interest',
  other: 'Other',
};

const CLIENT_REASON_LABELS: Record<string, string> = {
  changed_mind: 'Changed mind',
  fee_too_high: 'Fee too high',
  found_another_attorney: 'Found another attorney',
  attorney_unresponsive: 'Attorney unresponsive',
  other: 'Other',
};

function formatHistoryDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
    const d = new Date(hasTz ? iso : `${iso}Z`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

function formatSince(iso: string | null): string {
  if (!iso) return '';
  try {
    const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
    const d = new Date(hasTz ? iso : `${iso}Z`);
    const h = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `On duty since ${h}`;
  } catch {
    return '';
  }
}

export default function ProntoScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [pending, setPending] = useState<PendingSigning[]>([]);
  const [history, setHistory] = useState<SigningHistoryItem[]>([]);
  const [activeCalls, setActiveCalls] = useState<ProntoActiveCall[]>([]);
  const [joiningCallId, setJoiningCallId] = useState<string | null>(null);
  const [viewerDoc, setViewerDoc] = useState<{ url: string; title: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);

    // Fast path: render as soon as availability/pending/active resolve.
    // History is unbounded and slow, so it must not gate the spinner.
    const [availRes, pendingRes, activeRes] = await Promise.all([
      getProntoAvailability(),
      listPendingSignings(),
      listProntoActiveCalls(),
    ]);
    if (availRes.ok) setAvailability(availRes.data);
    else setError(availRes.message);
    if (pendingRes.ok) setPending(pendingRes.data);
    if (activeRes.ok) setActiveCalls(activeRes.data.calls);
    setLoading(false);
    setRefreshing(false);

    const historyRes = await listSigningHistory();
    if (historyRes.ok) setHistory(historyRes.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll only the hot endpoints (active calls + pending signings) while the
  // screen is focused. History is refreshed via load()/pull-to-refresh only.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const tick = async () => {
        const [activeRes, pendingRes] = await Promise.all([
          listProntoActiveCalls(),
          listPendingSignings(),
        ]);
        if (cancelled) return;
        if (activeRes.ok) setActiveCalls(activeRes.data.calls);
        if (pendingRes.ok) setPending(pendingRes.data);
      };
      const handle = setInterval(tick, 3000);
      return () => {
        cancelled = true;
        clearInterval(handle);
      };
    }, []),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const handleJoinCall = useCallback(
    async (call: ProntoActiveCall) => {
      if (joiningCallId) return;
      setJoiningCallId(call.call_id);
      const res = await acceptProntoCall(call.call_id);
      setJoiningCallId(null);
      if (!res.ok) {
        Alert.alert('Could not join call', res.message);
        return;
      }
      router.push({
        pathname: '/(auth)/calls/[id]',
        params: {
          id: res.data.call_id,
          url: res.data.daily_room_url,
          token: res.data.daily_meeting_token,
          name: res.data.client_name,
          video: res.data.is_video ? '1' : '0',
          pronto: '1',
        },
      });
    },
    [joiningCallId, router],
  );

  const handleToggle = useCallback(
    async (next: boolean) => {
      if (!availability) return;
      if (!availability.pronto_enabled) return;
      setUpdating(true);
      const prev = availability;
      setAvailability({ ...availability, pronto_available: next });
      const res = await setProntoAvailability(next);
      if (!res.ok) {
        setAvailability(prev);
        Alert.alert('Could not update availability', res.message);
      } else {
        setAvailability(res.data);
      }
      setUpdating(false);
    },
    [availability],
  );

  const handleEnable = useCallback(async () => {
    setUpdating(true);
    const res = await setProntoEnrollment(true);
    if (!res.ok) {
      Alert.alert('Could not enable Pronto', res.message);
    } else {
      setAvailability(res.data);
    }
    setUpdating(false);
  }, []);

  const enrolled = availability?.pronto_enabled ?? false;
  const available = availability?.pronto_available ?? false;
  const statusLabel = available
    ? formatSince(availability?.pronto_available_since ?? null) || 'You are on duty'
    : 'You are offline';

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AppHeader
        eyebrow="On-demand intake"
        title="Pronto"
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
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
        <Animated.View
          entering={FadeInDown.duration(500).easing(Easing.out(Easing.cubic))}
          style={styles.accentWrap}
        >
          <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
        </Animated.View>

        {loading && !availability ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : error && !availability ? (
          <Animated.View
            entering={FadeInDown.duration(300)}
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
          </Animated.View>
        ) : !enrolled ? (
          <Animated.View
            entering={FadeInUp.delay(60).duration(500).easing(Easing.out(Easing.cubic))}
            style={[
              styles.toggleCard,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.toggleHeader}>
              <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
              <Text
                style={[
                  styles.toggleTitle,
                  { color: colors.text, fontFamily: fonts.sansSemiBold },
                ]}
              >
                Not enrolled
              </Text>
            </View>
            <Text
              style={[
                styles.toggleHint,
                { color: colors.textMuted, fontFamily: fonts.sans },
              ]}
            >
              Enable Pronto to start receiving on-demand client requests in the states you practice. You can go offline anytime.
            </Text>
            <Pressable
              onPress={handleEnable}
              disabled={updating}
              style={({ pressed }) => [
                styles.enableButton,
                {
                  backgroundColor: colors.accent,
                  opacity: updating ? 0.6 : pressed ? 0.85 : 1,
                },
              ]}
            >
              {updating ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Ionicons name="flash" size={16} color={colors.background} />
                  <Text
                    style={[
                      styles.enableButtonLabel,
                      { color: colors.background, fontFamily: fonts.sansBold },
                    ]}
                  >
                    Enable Pronto
                  </Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        ) : (
          <>
            <Animated.View
              entering={FadeInUp.delay(60).duration(500).easing(Easing.out(Easing.cubic))}
              style={[
                styles.toggleCard,
                {
                  backgroundColor: colors.card,
                  borderColor: available ? colors.success : colors.cardBorder,
                },
              ]}
            >
              <View style={styles.toggleHeader}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: available ? colors.success : colors.textMuted },
                  ]}
                />
                <Text
                  style={[
                    styles.toggleTitle,
                    { color: colors.text, fontFamily: fonts.sansSemiBold },
                  ]}
                >
                  {available ? 'Available' : 'Offline'}
                </Text>
                <Switch
                  value={available}
                  onValueChange={handleToggle}
                  disabled={updating}
                  trackColor={{ false: colors.cardBorder, true: colors.success }}
                  thumbColor={available ? colors.background : colors.textMuted}
                />
              </View>
              <Text
                style={[
                  styles.toggleStatus,
                  { color: colors.textMuted, fontFamily: fonts.sans },
                ]}
              >
                {statusLabel}
              </Text>
              <Text
                style={[
                  styles.toggleHint,
                  { color: colors.textMuted, fontFamily: fonts.sans },
                ]}
              >
                {available
                  ? 'New Pronto clients in your states can request you. Keep the app open to receive calls.'
                  : 'Flip on when you are ready to take incoming Pronto clients.'}
              </Text>
            </Animated.View>

            <Animated.View
              entering={FadeInUp.delay(110).duration(500).easing(Easing.out(Easing.cubic))}
            >
              <Pressable
                onPress={() => router.push('/(auth)/retainers')}
                style={({ pressed }) => [
                  styles.linkCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.linkIcon,
                    { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
                  ]}
                >
                  <Ionicons name="document-text-outline" size={18} color={colors.accent} />
                </View>
                <View style={styles.linkBody}>
                  <Text
                    style={[
                      styles.linkTitle,
                      { color: colors.text, fontFamily: fonts.sansSemiBold },
                    ]}
                  >
                    Retainers
                  </Text>
                  <Text
                    style={[
                      styles.linkSubtitle,
                      { color: colors.textMuted, fontFamily: fonts.sans },
                    ]}
                  >
                    Upload and manage retainer PDFs per service.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            </Animated.View>

            <Animated.View
              entering={FadeInUp.delay(120).duration(500).easing(Easing.out(Easing.cubic))}
            >
              <Pressable
                onPress={() => router.push('/pronto-transactions')}
                style={({ pressed }) => [
                  styles.linkCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.linkIcon,
                    { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
                  ]}
                >
                  <Ionicons name="receipt-outline" size={18} color={colors.accent} />
                </View>
                <View style={styles.linkBody}>
                  <Text
                    style={[
                      styles.linkTitle,
                      { color: colors.text, fontFamily: fonts.sansSemiBold },
                    ]}
                  >
                    Payment History
                  </Text>
                  <Text
                    style={[
                      styles.linkSubtitle,
                      { color: colors.textMuted, fontFamily: fonts.sans },
                    ]}
                  >
                    Pronto payments from your clients
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            </Animated.View>

            {(() => {
              const awaitingSig = pending.filter((p) => p.status === 'client_signed');
              const awaitingPay = pending.filter((p) => p.status === 'attorney_signed');

              const renderGroup = (
                items: typeof pending,
                title: string,
                subtitle: string,
                iconName: React.ComponentProps<typeof Ionicons>['name'],
                tint: string,
                tintBorder: string,
                tintAccent: string,
              ) => (
                <Animated.View
                  entering={FadeInUp.delay(130).duration(500).easing(Easing.out(Easing.cubic))}
                >
                  <View style={styles.pendingHeader}>
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: colors.text, fontFamily: fonts.sansBold },
                      ]}
                    >
                      {title}
                    </Text>
                    <View
                      style={[
                        styles.pendingBadge,
                        { backgroundColor: tint, borderColor: tintBorder },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pendingBadgeText,
                          { color: tintAccent, fontFamily: fonts.sansBold },
                        ]}
                      >
                        {items.length}
                      </Text>
                    </View>
                  </View>
                  {items.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => router.push(`/(auth)/signings/${p.id}`)}
                      style={({ pressed }) => [
                        styles.pendingCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: tintBorder,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.pendingIcon,
                          { backgroundColor: tint, borderColor: tintBorder },
                        ]}
                      >
                        <Ionicons name={iconName} size={18} color={tintAccent} />
                      </View>
                      <View style={styles.pendingBody}>
                        <Text
                          style={[
                            styles.pendingTitle,
                            { color: colors.text, fontFamily: fonts.sansSemiBold },
                          ]}
                          numberOfLines={1}
                        >
                          {p.client_name ?? 'Client'} • {p.practice_area_name}
                        </Text>
                        <Text
                          style={[
                            styles.pendingMeta,
                            { color: colors.textMuted, fontFamily: fonts.sans },
                          ]}
                          numberOfLines={1}
                        >
                          {subtitle}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </Animated.View>
              );

              return (
                <>
                  {awaitingSig.length > 0
                    ? renderGroup(
                        awaitingSig,
                        'Awaiting your signature',
                        'Client signed — tap to counter-sign',
                        'create-outline',
                        colors.accentTint,
                        colors.accentBorder,
                        colors.accent,
                      )
                    : null}
                  {awaitingPay.length > 0
                    ? renderGroup(
                        awaitingPay,
                        'Awaiting client payment',
                        'You counter-signed — waiting for client to pay',
                        'cash-outline',
                        'rgba(184,146,74,0.12)',
                        'rgba(184,146,74,0.4)',
                        '#B8924A',
                      )
                    : null}
                </>
              );
            })()}

            {activeCalls.length > 0 ? (
              <Animated.View
                entering={FadeInDown.duration(360).easing(Easing.out(Easing.cubic))}
              >
                <View style={styles.sectionHeader}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, fontFamily: fonts.sansBold },
                    ]}
                  >
                    Incoming call
                  </Text>
                </View>
                {activeCalls.map((c) => {
                  const joining = joiningCallId === c.call_id;
                  return (
                    <View
                      key={c.call_id}
                      style={[
                        styles.activeCallCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.accent,
                        },
                      ]}
                    >
                      <View style={styles.activeCallRow}>
                        <View
                          style={[
                            styles.activeCallIconWrap,
                            { backgroundColor: colors.accentTint },
                          ]}
                        >
                          <Ionicons name="call" size={20} color={colors.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.activeCallTitle,
                              { color: colors.text, fontFamily: fonts.sansBold },
                            ]}
                            numberOfLines={1}
                          >
                            {c.client_name}
                          </Text>
                          <Text
                            style={[
                              styles.activeCallMeta,
                              { color: colors.textMuted, fontFamily: fonts.sans },
                            ]}
                            numberOfLines={1}
                          >
                            {c.signing_id === null ? 'Direct call • ' : ''}
                            {c.practice_area_name
                              ? `${c.practice_area_name} • `
                              : ''}
                            {c.status === 'answered'
                              ? 'In progress'
                              : 'Calling you now'}
                          </Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => handleJoinCall(c)}
                        disabled={joining}
                        style={({ pressed }) => [
                          styles.joinCallBtn,
                          {
                            backgroundColor: colors.accent,
                            opacity: joining ? 0.6 : pressed ? 0.85 : 1,
                          },
                        ]}
                      >
                        <Ionicons
                          name="call"
                          size={16}
                          color={colors.background}
                        />
                        <Text
                          style={[
                            styles.joinCallLabel,
                            { color: colors.background, fontFamily: fonts.sansBold },
                          ]}
                        >
                          {joining ? 'Joining…' : 'Join call'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </Animated.View>
            ) : null}

            <Animated.View
              entering={FadeInUp.delay(140).duration(500).easing(Easing.out(Easing.cubic))}
              style={styles.sectionHeader}
            >
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.text, fontFamily: fonts.sansBold },
                ]}
              >
                Recent activity
              </Text>
            </Animated.View>

            {history.length === 0 ? (
              <Animated.View
                entering={FadeInUp.delay(180).duration(450)}
                style={[
                  styles.emptyBox,
                  { borderColor: colors.cardBorder, backgroundColor: colors.card },
                ]}
              >
                <Ionicons name="time-outline" size={28} color={colors.textMuted} />
                <Text
                  style={[
                    styles.emptyTitle,
                    { color: colors.text, fontFamily: fonts.sansSemiBold },
                  ]}
                >
                  No Pronto activity yet
                </Text>
                <Text
                  style={[
                    styles.emptyBody,
                    { color: colors.textMuted, fontFamily: fonts.sans },
                  ]}
                >
                  Recent client requests, retainers, and calls will appear here once you start receiving Pronto traffic.
                </Text>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInUp.delay(180).duration(450)}>
                {history.map((h) => {
                  const isCancelled = h.status === 'cancelled';
                  const byClient = h.cancelled_by === 'client';
                  const reasonLabel = h.cancellation_reason
                    ? (byClient ? CLIENT_REASON_LABELS : ATTORNEY_REASON_LABELS)[
                        h.cancellation_reason
                      ] ?? h.cancellation_reason
                    : null;
                  const stamp = formatHistoryDate(
                    h.cancelled_at ?? h.attorney_signed_at ?? h.signed_at,
                  );
                  return (
                    <View
                      key={h.id}
                      style={[
                        styles.historyCard,
                        { backgroundColor: colors.card, borderColor: colors.cardBorder },
                      ]}
                    >
                      <View style={styles.historyTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.historyTitle,
                              { color: colors.text, fontFamily: fonts.sansBold },
                            ]}
                            numberOfLines={1}
                          >
                            {h.client_name ?? 'Client'} • {h.practice_area_name}
                          </Text>
                          <Text
                            style={[
                              styles.historyMeta,
                              { color: colors.textMuted, fontFamily: fonts.sans },
                            ]}
                          >
                            {formatMoney(h.fee_amount_cents, h.fee_currency)} • {stamp}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.historyBadge,
                            {
                              backgroundColor: isCancelled
                                ? 'rgba(224,82,82,0.10)'
                                : colors.accentTint,
                              borderColor: isCancelled ? colors.danger : colors.accent,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.historyBadgeText,
                              {
                                color: isCancelled ? colors.danger : colors.accent,
                                fontFamily: fonts.sansBold,
                              },
                            ]}
                          >
                            {isCancelled ? 'Cancelled' : h.status}
                          </Text>
                        </View>
                      </View>

                      {isCancelled ? (
                        <View style={styles.historyReasonBlock}>
                          <Text
                            style={[
                              styles.historyReasonLabel,
                              { color: colors.textMuted, fontFamily: fonts.sansSemiBold },
                            ]}
                          >
                            {byClient ? 'Client cancelled' : 'You cancelled'}
                            {reasonLabel ? ` — ${reasonLabel}` : ''}
                          </Text>
                          {h.cancellation_note ? (
                            <Text
                              style={[
                                styles.historyReasonNote,
                                { color: colors.text, fontFamily: fonts.sans },
                              ]}
                            >
                              "{h.cancellation_note}"
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      {h.doc_url ? (
                        <Pressable
                          onPress={() =>
                            setViewerDoc({
                              url: h.doc_url!,
                              title: `${h.client_name ?? 'Client'} • ${h.practice_area_name}`,
                            })
                          }
                          style={({ pressed }) => [
                            styles.historyDocBtn,
                            {
                              borderColor: colors.cardBorder,
                              opacity: pressed ? 0.7 : 1,
                            },
                          ]}
                        >
                          <Ionicons
                            name="document-text-outline"
                            size={16}
                            color={colors.accent}
                          />
                          <Text
                            style={[
                              styles.historyDocLabel,
                              { color: colors.accent, fontFamily: fonts.sansBold },
                            ]}
                          >
                            Open document
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>
      <DocumentViewerModal
        visible={viewerDoc !== null}
        url={viewerDoc?.url ?? null}
        title={viewerDoc?.title}
        onClose={() => setViewerDoc(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  accentWrap: {
    paddingVertical: spacing.md,
  },
  accentBar: {
    width: 36,
    height: 3,
    borderRadius: 2,
  },
  toggleCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  toggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  toggleTitle: {
    fontSize: 18,
    flex: 1,
  },
  toggleStatus: {
    fontSize: 14,
  },
  toggleHint: {
    fontSize: 13,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  enableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  enableButtonLabel: {
    fontSize: 14,
    letterSpacing: 0.3,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBody: { flex: 1, gap: 2 },
  linkTitle: { fontSize: 15 },
  linkSubtitle: { fontSize: 12, lineHeight: 16 },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  pendingBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    minWidth: 28,
    alignItems: 'center',
  },
  pendingBadgeText: { fontSize: 12, letterSpacing: 0.4 },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  pendingIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBody: { flex: 1, gap: 2 },
  pendingTitle: { fontSize: 14 },
  pendingMeta: { fontSize: 12 },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
  },
  activeCallCard: {
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  activeCallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  activeCallIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCallTitle: { fontSize: 15 },
  activeCallMeta: { fontSize: 12, marginTop: 2 },
  joinCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  joinCallLabel: { fontSize: 14, letterSpacing: 0.2 },
  emptyBox: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 15,
    marginTop: spacing.sm,
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  historyCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  historyTitle: { fontSize: 14 },
  historyMeta: { fontSize: 12, marginTop: 2 },
  historyBadge: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  historyBadgeText: {
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  historyReasonBlock: {
    gap: 2,
  },
  historyReasonLabel: { fontSize: 12, letterSpacing: 0.2 },
  historyReasonNote: { fontSize: 13, lineHeight: 18 },
  historyDocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  historyDocLabel: { fontSize: 13, letterSpacing: 0.3 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
  },
});
