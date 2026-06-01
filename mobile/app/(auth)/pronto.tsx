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
  acceptProntoRequest,
  getProntoAvailability,
  getProntoRetainerDocUrl,
  listMyProntoRequests,
  listOpenRequests,
  listProntoActiveCalls,
  setProntoAvailability,
  type AttorneyRequestItem,
  type OpenRequest,
  type ProntoActiveCall,
} from '../../lib/pronto';

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

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
    const d = new Date(hasTz ? iso : `${iso}Z`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
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
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([]);
  const [activeCalls, setActiveCalls] = useState<ProntoActiveCall[]>([]);
  const [completed, setCompleted] = useState<AttorneyRequestItem[]>([]);
  const [joiningCallId, setJoiningCallId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [openingDocId, setOpeningDocId] = useState<number | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState<string>('Retainer');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    const [availRes, openRes, activeRes, mineRes] = await Promise.all([
      getProntoAvailability(),
      listOpenRequests(),
      listProntoActiveCalls(),
      listMyProntoRequests(),
    ]);
    if (availRes.ok) setAvailability(availRes.data);
    else setError(availRes.message);
    if (openRes.ok) setOpenRequests(openRes.data);
    if (activeRes.ok) setActiveCalls(activeRes.data.calls);
    if (mineRes.ok) {
      setCompleted(mineRes.data.filter((r) => r.status === 'completed'));
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll the hot endpoints (open requests + active calls) while focused so the
  // first-come queue stays fresh and a client's call surfaces immediately.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const tick = async () => {
        const [openRes, activeRes] = await Promise.all([
          listOpenRequests(),
          listProntoActiveCalls(),
        ]);
        if (cancelled) return;
        if (openRes.ok) setOpenRequests(openRes.data);
        if (activeRes.ok) setActiveCalls(activeRes.data.calls);
      };
      // One-shot refresh of completed consultations on focus (e.g. returning
      // from a call that just wrapped up) — not part of the 3s hot poll.
      listMyProntoRequests().then((res) => {
        if (!cancelled && res.ok) {
          setCompleted(res.data.filter((r) => r.status === 'completed'));
        }
      });
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

  const doAccept = useCallback(
    async (req: OpenRequest) => {
      if (acceptingId !== null) return;
      setAcceptingId(req.id);
      const res = await acceptProntoRequest(req.id);
      setAcceptingId(null);
      if (!res.ok) {
        // 409 = someone else grabbed it first.
        Alert.alert('Request unavailable', res.message);
        setOpenRequests((prev) => prev.filter((r) => r.id !== req.id));
        return;
      }
      setOpenRequests((prev) => prev.filter((r) => r.id !== req.id));
      Alert.alert(
        'Accepted & signed',
        `You've signed the retainer for ${res.data.client_name}'s ${res.data.practice_area_name} request. They'll pay, then call you — keep the app open.`,
      );
    },
    [acceptingId],
  );

  const handleAccept = useCallback(
    (req: OpenRequest) => {
      // Accepting IS signing the retainer (first-come-first-serve). Confirm so
      // it's an explicit, deliberate signature.
      Alert.alert(
        'Accept & sign retainer?',
        `You'll sign the retainer for ${req.client_name}'s ${req.practice_area_name} request (${formatMoney(req.fee_amount_cents, req.fee_currency)}). First to accept wins, and the client will be charged once you do.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Accept & Sign', onPress: () => doAccept(req) },
        ],
      );
    },
    [doAccept],
  );

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
      if (!availability || !availability.pronto_enabled) return;
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

  const openRetainer = useCallback(
    async (req: AttorneyRequestItem) => {
      if (openingDocId !== null) return;
      if (!req.has_retainer_doc) {
        Alert.alert('Not ready', 'The signed retainer for this consultation is still being prepared.');
        return;
      }
      setOpeningDocId(req.id);
      const res = await getProntoRetainerDocUrl(req.id);
      setOpeningDocId(null);
      if (!res.ok) {
        Alert.alert('Could not open retainer', res.message);
        return;
      }
      setDocTitle(`Retainer — ${req.practice_area_name}`);
      setDocUrl(res.data.url);
    },
    [openingDocId],
  );

  const enrolled = availability?.pronto_enabled ?? false;
  const available = availability?.pronto_available ?? false;
  const statusLabel = available
    ? formatSince(availability?.pronto_available_since ?? null) || 'You are on duty'
    : 'You are offline';

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader eyebrow="On-demand intake" title="Pronto!" onRefresh={onRefresh} refreshing={refreshing} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {loading && !availability ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : error && !availability ? (
          <View style={[styles.errorBox, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger, fontFamily: fonts.sansMedium }]}>
              {error}
            </Text>
            <Pressable onPress={() => load()} hitSlop={10}>
              <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>Retry</Text>
            </Pressable>
          </View>
        ) : !enrolled ? (
          <Animated.View
            entering={FadeInUp.delay(60).duration(500).easing(Easing.out(Easing.cubic))}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          >
            <View style={styles.rowHeader}>
              <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
              <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                Not enrolled
              </Text>
            </View>
            <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
              Pronto access is granted by GeniusLaw. Please reach out to GeniusLaw to get
              enrolled — automatic enrollment is coming soon.
            </Text>
          </Animated.View>
        ) : (
          <>
            {/* Availability toggle */}
            <Animated.View
              entering={FadeInUp.delay(60).duration(500).easing(Easing.out(Easing.cubic))}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: available ? colors.success : colors.cardBorder },
              ]}
            >
              <View style={styles.rowHeader}>
                <View style={[styles.dot, { backgroundColor: available ? colors.success : colors.textMuted }]} />
                <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
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
              <Text style={[styles.status, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {statusLabel}
              </Text>
              <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {available
                  ? 'Incoming requests appear below. First to accept gets the client.'
                  : 'Flip on when you are ready to take incoming Pronto clients.'}
              </Text>
            </Animated.View>

            {/* Active calls — join */}
            {activeCalls.length > 0 ? (
              <Animated.View entering={FadeInDown.duration(400)} style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
                  Incoming call
                </Text>
                {activeCalls.map((call) => (
                  <View
                    key={call.call_id}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.success }]}
                  >
                    <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                      {call.client_name}
                    </Text>
                    <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                      {call.practice_area_name || 'Pronto consultation'}
                    </Text>
                    <Pressable
                      onPress={() => handleJoinCall(call)}
                      disabled={joiningCallId !== null}
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        { backgroundColor: colors.success, opacity: joiningCallId ? 0.6 : pressed ? 0.85 : 1 },
                      ]}
                    >
                      {joiningCallId === call.call_id ? (
                        <ActivityIndicator color={colors.background} />
                      ) : (
                        <>
                          <Ionicons name="call" size={16} color={colors.background} />
                          <Text style={[styles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                            Join call
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                ))}
              </Animated.View>
            ) : null}

            {/* Open requests — first-come accept */}
            <Animated.View entering={FadeInUp.delay(110).duration(500)} style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
                Open requests {openRequests.length > 0 ? `(${openRequests.length})` : ''}
              </Text>
              {openRequests.length === 0 ? (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                    {available
                      ? 'No open requests right now. New ones show up here the moment a client pays.'
                      : 'Go on duty to see incoming requests.'}
                  </Text>
                </View>
              ) : (
                openRequests.map((req) => (
                  <View
                    key={req.id}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                  >
                    <View style={styles.reqHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                          {req.practice_area_name}
                        </Text>
                        <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                          {req.client_name}
                          {req.attempt_count > 0 ? ' • re-listed' : ''}
                        </Text>
                      </View>
                      <Text style={[styles.fee, { color: colors.text, fontFamily: fonts.sansBold }]}>
                        {formatMoney(req.fee_amount_cents, req.fee_currency)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleAccept(req)}
                      disabled={acceptingId !== null}
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        {
                          backgroundColor: colors.accent,
                          opacity:
                            acceptingId !== null && acceptingId !== req.id ? 0.5 : pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      {acceptingId === req.id ? (
                        <ActivityIndicator color={colors.background} />
                      ) : (
                        <Text style={[styles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                          Accept &amp; Sign
                        </Text>
                      )}
                    </Pressable>
                  </View>
                ))
              )}
            </Animated.View>

            {/* Completed consultations — tap to view the signed retainer */}
            {completed.length > 0 ? (
              <Animated.View entering={FadeInUp.delay(160).duration(500)} style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
                  Completed consultations
                </Text>
                {completed.map((req) => (
                  <Pressable
                    key={req.id}
                    onPress={() => openRetainer(req)}
                    disabled={openingDocId !== null}
                    style={({ pressed }) => [
                      styles.card,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.cardBorder,
                        opacity: openingDocId !== null && openingDocId !== req.id ? 0.5 : pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View style={styles.reqHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                          {req.practice_area_name}
                        </Text>
                        <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                          {req.client_name}
                          {req.completed_at ? ` • ${formatDate(req.completed_at)}` : ''}
                        </Text>
                      </View>
                      {openingDocId === req.id ? (
                        <ActivityIndicator color={colors.accent} />
                      ) : (
                        <View style={styles.docHint}>
                          <Ionicons
                            name={req.has_retainer_doc ? 'document-text-outline' : 'time-outline'}
                            size={18}
                            color={req.has_retainer_doc ? colors.accent : colors.textMuted}
                          />
                          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))}
              </Animated.View>
            ) : null}

            {/* Payment history link */}
            <Pressable
              onPress={() => router.push('/pronto-transactions')}
              style={({ pressed }) => [
                styles.linkCard,
                { backgroundColor: colors.card, borderColor: colors.cardBorder, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.linkIcon, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
                <Ionicons name="receipt-outline" size={18} color={colors.accent} />
              </View>
              <View style={styles.linkBody}>
                <Text style={[styles.linkTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                  Payment History
                </Text>
                <Text style={[styles.linkSubtitle, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  Pronto payments from your clients
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </>
        )}
      </ScrollView>

      <DocumentViewerModal
        visible={docUrl !== null}
        url={docUrl}
        title={docTitle}
        onClose={() => setDocUrl(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radius.full },
  cardTitle: { fontSize: 16, flex: 1 },
  status: { fontSize: 13 },
  hint: { fontSize: 13, lineHeight: 18 },
  section: { gap: spacing.sm },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
  },
  reqHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  docHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  fee: { fontSize: 18 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  primaryBtnLabel: { fontSize: 15, letterSpacing: 0.4 },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBody: { flex: 1, gap: 2 },
  linkTitle: { fontSize: 15 },
  linkSubtitle: { fontSize: 12 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorText: { flex: 1, fontSize: 13 },
});
