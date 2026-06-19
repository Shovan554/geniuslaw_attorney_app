import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import {
  ProntoActionSheet,
  ProntoOpenRequestCard,
  formatMoney,
  type ProntoRequestModalState,
} from '../../components/ProntoOpenRequest';
import { TestCallEntry } from '../../components/TestCallEntry';
import { fonts, radius, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getAttorneyMe } from '../../lib/attorney';
import { getOnboardingStatus, type OnboardingStatus } from '../../lib/onboarding';
import { parsePracticeAreas } from '../../lib/practiceAreas';
import {
  Availability,
  acceptProntoCall,
  acceptProntoRequest,
  acceptRetainerTerms,
  getProntoAvailability,
  getRetainerTerms,
  listOpenRequests,
  listProntoActiveCalls,
  setProntoAvailability,
  type OpenRequest,
  type ProntoActiveCall,
  type RetainerTerms,
} from '../../lib/pronto';

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
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [practiceAreas, setPracticeAreas] = useState<string[] | null>(null);
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([]);
  const [activeCalls, setActiveCalls] = useState<ProntoActiveCall[]>([]);
  const [modal, setModal] = useState<ProntoRequestModalState>(null);
  const [joiningCallId, setJoiningCallId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [terms, setTerms] = useState<RetainerTerms | null>(null);
  const [termsLoading, setTermsLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    const [availRes, openRes, activeRes, onboardingRes, meRes] = await Promise.all([
      getProntoAvailability(),
      listOpenRequests(),
      listProntoActiveCalls(),
      getOnboardingStatus(),
      getAttorneyMe(),
    ]);
    if (availRes.ok) setAvailability(availRes.data);
    else setError(availRes.message);
    if (onboardingRes.ok) setOnboarding(onboardingRes.data);
    if (meRes.ok) setPracticeAreas(parsePracticeAreas(meRes.data.practice_areas));
    if (openRes.ok) setOpenRequests(openRes.data);
    if (activeRes.ok) setActiveCalls(activeRes.data.calls);
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
        setModal({ kind: 'unavailable', message: res.message });
        setOpenRequests((prev) => prev.filter((r) => r.id !== req.id));
        return;
      }
      setOpenRequests((prev) => prev.filter((r) => r.id !== req.id));
      setModal({
        kind: 'accepted',
        clientName: res.data.client_name,
        practiceArea: res.data.practice_area_name,
        fee: formatMoney(req.fee_amount_cents, req.fee_currency),
      });
    },
    [acceptingId],
  );

  const handleAccept = useCallback((req: OpenRequest) => {
    setModal({ kind: 'confirm', req });
  }, []);

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

  const openTermsModal = useCallback(async () => {
    setTermsModalOpen(true);
    if (terms) return;
    setTermsLoading(true);
    const res = await getRetainerTerms();
    setTermsLoading(false);
    if (!res.ok) {
      setTermsModalOpen(false);
      Alert.alert('Could not load terms', res.message);
      return;
    }
    setTerms(res.data);
  }, [terms]);

  const handleAcceptTerms = useCallback(async () => {
    if (!terms) return;
    setAccepting(true);
    const res = await acceptRetainerTerms(terms.active_version);
    setAccepting(false);
    if (!res.ok) {
      Alert.alert('Could not accept', res.message);
      return;
    }
    setTermsModalOpen(false);
    setTerms(null);
    await load();
  }, [terms, load]);

  const handleToggle = useCallback(
    async (next: boolean) => {
      if (!availability || !availability.pronto_enabled) return;
      if (next && availability.retainer_acceptance_required) {
        openTermsModal();
        return;
      }
      setUpdating(true);
      const prev = availability;
      setAvailability({ ...availability, pronto_available: next });
      const res = await setProntoAvailability(next);
      if (!res.ok) {
        setAvailability(prev);
        await load();
        if (res.message?.startsWith('RETAINER_ACCEPTANCE_REQUIRED')) {
          openTermsModal();
        } else {
          Alert.alert('Could not update availability', res.message);
        }
      } else {
        setAvailability(res.data);
      }
      setUpdating(false);
    },
    [availability, openTermsModal, load],
  );

  const enrolled = availability?.pronto_enabled ?? false;
  const onboardingComplete =
    !!onboarding && onboarding.kyc_verified && onboarding.has_card && onboarding.terms_accepted;

  // Only surface requests in the attorney's selected practice areas. While the
  // profile is still loading (practiceAreas === null) we show everything to
  // avoid hiding the queue on first paint; once loaded we match by area name.
  const visibleRequests = useMemo(() => {
    if (!practiceAreas) return openRequests;
    const selected = new Set(practiceAreas.map((p) => p.trim().toLowerCase()));
    return openRequests.filter((r) => selected.has(r.practice_area_name.trim().toLowerCase()));
  }, [openRequests, practiceAreas]);
  const available = availability?.pronto_available ?? false;
  const mustAcceptTerms = enrolled && (availability?.retainer_acceptance_required ?? false);
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
        ) : !enrolled && onboardingComplete ? (
          <>
            <Animated.View
              entering={FadeInUp.delay(60).duration(500).easing(Easing.out(Easing.cubic))}
              style={[styles.allSetCard, { backgroundColor: colors.card, borderColor: colors.accentBorder }]}
            >
              <View
                style={[
                  styles.allSetBadge,
                  { backgroundColor: 'rgba(76,175,125,0.12)', borderColor: 'rgba(76,175,125,0.40)' },
                ]}
              >
                <Ionicons name="checkmark-circle" size={46} color={colors.success} />
              </View>
              <Text style={[styles.allSetTitle, { color: colors.text, fontFamily: fonts.heading }]}>
                You&apos;re all set
              </Text>
              <Text style={[styles.allSetHint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                Please wait for a staff member to enable Pronto access for you. You&apos;ll be able to
                go on duty here as soon as your account is enabled.
              </Text>
            </Animated.View>
            <View style={{ marginTop: spacing.md }}>
              <TestCallEntry />
            </View>
          </>
        ) : !enrolled ? (
          <>
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
                Get set up for Pronto: verify your identity, add a payment method, and accept the
                platform terms. A staff member enables your access once you&apos;re done.
              </Text>
              <Pressable
                onPress={() => router.push('/pronto-onboarding')}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1, marginTop: spacing.md },
                ]}
              >
                <Text style={[styles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                  Get Pronto access
                </Text>
              </Pressable>
            </Animated.View>
            <View style={{ marginTop: spacing.md }}>
              <TestCallEntry />
            </View>
          </>
        ) : (
          <>
            {mustAcceptTerms ? (
              <Animated.View
                entering={FadeInUp.delay(40).duration(500).easing(Easing.out(Easing.cubic))}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.accentBorder }]}
              >
                <View style={styles.rowHeader}>
                  <Ionicons name="document-text-outline" size={20} color={colors.accent} />
                  <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                    Review &amp; sign terms
                  </Text>
                </View>
                <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  The retainer agreement has been updated. Review and accept it before going on duty.
                </Text>
                <Pressable
                  onPress={openTermsModal}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1, marginTop: spacing.md },
                  ]}
                >
                  <Text style={[styles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                    Review &amp; sign
                  </Text>
                </Pressable>
              </Animated.View>
            ) : null}

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
                  disabled={updating || mustAcceptTerms}
                  trackColor={{ false: colors.cardBorder, true: colors.success }}
                  thumbColor={available ? colors.background : colors.textMuted}
                />
              </View>
              <Text style={[styles.status, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {statusLabel}
              </Text>
              {mustAcceptTerms ? (
                <Text style={[styles.hint, { color: colors.danger, fontFamily: fonts.sansMedium }]}>
                  Please review and accept the new retainer and terms changes before going online.
                </Text>
              ) : (
                <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  {available
                    ? 'Incoming requests appear below. First to accept gets the client.'
                    : 'Flip on when you are ready to take incoming Pronto clients.'}
                </Text>
              )}
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
                Open requests {visibleRequests.length > 0 ? `(${visibleRequests.length})` : ''}
              </Text>
              {visibleRequests.length === 0 ? (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                    {!available
                      ? 'Go on duty to see incoming requests.'
                      : practiceAreas && practiceAreas.length === 0
                        ? 'Add practice areas to your profile to start receiving matching requests.'
                        : 'No open requests in your practice areas right now. New ones show up here the moment a matching client pays.'}
                  </Text>
                </View>
              ) : (
                visibleRequests.map((req) => (
                  <ProntoOpenRequestCard
                    key={req.id}
                    req={req}
                    accepting={acceptingId === req.id}
                    disabled={acceptingId !== null}
                    colors={colors}
                    onAccept={handleAccept}
                  />
                ))
              )}
            </Animated.View>

            {/* Recent activity link */}
            <Pressable
              onPress={() => router.push('/(auth)/pronto-activity')}
              style={({ pressed }) => [
                styles.linkCard,
                { backgroundColor: colors.card, borderColor: colors.cardBorder, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={[styles.linkIcon, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
                <Ionicons name="time-outline" size={18} color={colors.accent} />
              </View>
              <View style={styles.linkBody}>
                <Text style={[styles.linkTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                  Recent Activity
                </Text>
                <Text style={[styles.linkSubtitle, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  Completed consultations, payments &amp; signed retainers
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>

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

      <ProntoActionSheet
        modal={modal}
        colors={colors}
        onDismiss={() => setModal(null)}
        onConfirmAccept={(req) => { setModal(null); doAccept(req); }}
      />

      <Modal visible={termsModalOpen} animationType="slide" transparent onRequestClose={() => setTermsModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, maxHeight: '85%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }]}>
            <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.heading, marginBottom: spacing.sm }]}>
              Review &amp; sign terms
            </Text>
            {termsLoading || !terms ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.xl }} />
            ) : (
              <ScrollView style={{ marginBottom: spacing.md }} showsVerticalScrollIndicator>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.cardBorder,
                    borderRadius: radius.md,
                    backgroundColor: colors.background,
                    padding: spacing.md,
                    marginBottom: spacing.md,
                  }}
                >
                  <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.heading, fontSize: 20, marginBottom: spacing.sm }]}>
                    Retainer agreement
                  </Text>
                  <Text style={[styles.hint, { color: colors.text, fontFamily: fonts.sans }]}>
                    {terms.retainer_body}
                  </Text>
                </View>
                {terms.attorney_terms ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: colors.cardBorder,
                      borderRadius: radius.md,
                      backgroundColor: colors.background,
                      padding: spacing.md,
                    }}
                  >
                    <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.heading, fontSize: 20, marginBottom: spacing.sm }]}>
                      Attorney terms
                    </Text>
                    <Text style={[styles.hint, { color: colors.text, fontFamily: fonts.sans }]}>
                      {terms.attorney_terms}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>
            )}
            <Pressable
              onPress={handleAcceptTerms}
              disabled={accepting || termsLoading || !terms}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.accent, opacity: accepting || termsLoading || !terms ? 0.6 : pressed ? 0.85 : 1 },
              ]}
            >
              {accepting ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={[styles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                  I accept
                </Text>
              )}
            </Pressable>
            <Pressable onPress={() => setTermsModalOpen(false)} style={{ marginTop: spacing.sm, marginBottom: spacing.xl, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontFamily: fonts.sansMedium }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  allSetCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl * 1.6,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  allSetBadge: {
    width: 84,
    height: 84,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  allSetTitle: { fontSize: 24, textAlign: 'center' },
  allSetHint: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
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
  reqClientRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  urgencyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  feePillText: { fontSize: 16 },
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
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.xs,
  },
  secondaryBtnLabel: { fontSize: 15, letterSpacing: 0.3 },
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

