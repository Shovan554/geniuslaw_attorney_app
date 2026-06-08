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
import { DocumentViewerModal } from '../../components/DocumentViewerModal';
import { AppColors, fonts, radius, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getAttorneyMe } from '../../lib/attorney';
import { getOnboardingStatus, type OnboardingStatus } from '../../lib/onboarding';
import { parsePracticeAreas } from '../../lib/practiceAreas';
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

type ModalState =
  | { kind: 'confirm'; req: OpenRequest }
  | { kind: 'accepted'; clientName: string; practiceArea: string; fee: string }
  | { kind: 'unavailable'; message: string }
  | null;

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

function ProntoActionSheet({
  modal,
  colors,
  onDismiss,
  onConfirmAccept,
}: {
  modal: ModalState;
  colors: AppColors;
  onDismiss: () => void;
  onConfirmAccept: (req: OpenRequest) => void;
}) {
  if (!modal) return null;

  const dangerTint = 'rgba(224,82,82,0.12)';
  const dangerBorder = 'rgba(224,82,82,0.35)';
  const successTint = 'rgba(76,175,125,0.12)';
  const successBorder = 'rgba(76,175,125,0.35)';

  const iconName =
    modal.kind === 'confirm'
      ? ('document-text-outline' as const)
      : modal.kind === 'accepted'
        ? ('checkmark-circle' as const)
        : ('alert-circle-outline' as const);
  const badgeBg =
    modal.kind === 'confirm'
      ? colors.accentTint
      : modal.kind === 'accepted'
        ? successTint
        : dangerTint;
  const badgeBorder =
    modal.kind === 'confirm'
      ? colors.accentBorder
      : modal.kind === 'accepted'
        ? successBorder
        : dangerBorder;
  const iconColor =
    modal.kind === 'confirm'
      ? colors.accent
      : modal.kind === 'accepted'
        ? colors.success
        : colors.danger;
  const title =
    modal.kind === 'confirm'
      ? 'Accept & sign retainer?'
      : modal.kind === 'accepted'
        ? 'Retainer signed'
        : 'Request unavailable';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
          onPress={onDismiss}
        />
        <Animated.View
          entering={FadeInUp.duration(280)}
          style={[sheetStyles.sheet, { backgroundColor: colors.card, borderTopColor: colors.cardBorder }]}
        >
          <View style={[sheetStyles.handle, { backgroundColor: colors.cardBorder }]} />

          <View style={[sheetStyles.badge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
            <Ionicons name={iconName} size={32} color={iconColor} />
          </View>

          <Text style={[sheetStyles.title, { color: colors.text, fontFamily: fonts.heading }]}>
            {title}
          </Text>

          {modal.kind === 'confirm' ? (
            <>
              <View style={[sheetStyles.infoBox, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                <View style={sheetStyles.infoRow}>
                  <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                  <Text style={[sheetStyles.infoText, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                    {modal.req.client_name}
                  </Text>
                </View>
                <View style={[sheetStyles.infoDivider, { backgroundColor: colors.cardBorder }]} />
                <View style={sheetStyles.infoRow}>
                  <Ionicons name="briefcase-outline" size={14} color={colors.textMuted} />
                  <Text style={[sheetStyles.infoText, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                    {modal.req.practice_area_name}
                  </Text>
                  <Text style={[sheetStyles.infoFee, { color: colors.accent, fontFamily: fonts.sansBold }]}>
                    {formatMoney(modal.req.fee_amount_cents, modal.req.fee_currency)}
                  </Text>
                </View>
              </View>
              <Text style={[sheetStyles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                First to accept wins — the client will be charged once you sign.
              </Text>
              <View style={sheetStyles.btnRow}>
                <Pressable
                  onPress={onDismiss}
                  style={({ pressed }) => [
                    sheetStyles.btnOutlined,
                    { borderColor: colors.cardBorder, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[sheetStyles.btnOutlinedLabel, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onConfirmAccept(modal.req)}
                  style={({ pressed }) => [
                    sheetStyles.btnFilled,
                    { backgroundColor: colors.accent, flex: 1, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Ionicons name="pencil-outline" size={16} color={colors.background} />
                  <Text style={[sheetStyles.btnFilledLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                    Accept & Sign
                  </Text>
                </Pressable>
              </View>
            </>
          ) : modal.kind === 'accepted' ? (
            <>
              <View style={[sheetStyles.infoBox, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                <View style={sheetStyles.infoRow}>
                  <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                  <Text style={[sheetStyles.infoText, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                    {modal.clientName}
                  </Text>
                </View>
                <View style={[sheetStyles.infoDivider, { backgroundColor: colors.cardBorder }]} />
                <View style={sheetStyles.infoRow}>
                  <Ionicons name="briefcase-outline" size={14} color={colors.textMuted} />
                  <Text style={[sheetStyles.infoText, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                    {modal.practiceArea}
                  </Text>
                </View>
                <View style={[sheetStyles.infoDivider, { backgroundColor: colors.cardBorder }]} />
                <View style={sheetStyles.infoRow}>
                  <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
                  <Text style={[sheetStyles.infoText, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                    Earned
                  </Text>
                  <Text style={[sheetStyles.infoFee, { color: colors.accent, fontFamily: fonts.sansBold }]}>
                    {modal.fee}
                  </Text>
                </View>
              </View>
              <View style={[sheetStyles.noticeBox, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
                <Ionicons name="notifications-outline" size={15} color={colors.accent} />
                <Text style={[sheetStyles.noticeText, { color: colors.text, fontFamily: fonts.sans }]}>
                  Keep the app open — they&apos;ll call you once payment clears.
                </Text>
              </View>
              <Pressable
                onPress={onDismiss}
                style={({ pressed }) => [
                  sheetStyles.btnFilled,
                  { backgroundColor: colors.success, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name="checkmark" size={18} color={colors.background} />
                <Text style={[sheetStyles.btnFilledLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                  Got it
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[sheetStyles.body, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {modal.message}
              </Text>
              <Pressable
                onPress={onDismiss}
                style={({ pressed }) => [
                  sheetStyles.btnOutlined,
                  { borderColor: colors.cardBorder, alignSelf: 'stretch', opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[sheetStyles.btnOutlinedLabel, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                  OK
                </Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function ProntoScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [practiceAreas, setPracticeAreas] = useState<string[] | null>(null);
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([]);
  const [activeCalls, setActiveCalls] = useState<ProntoActiveCall[]>([]);
  const [completed, setCompleted] = useState<AttorneyRequestItem[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
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
    const [availRes, openRes, activeRes, mineRes, onboardingRes, meRes] = await Promise.all([
      getProntoAvailability(),
      listOpenRequests(),
      listProntoActiveCalls(),
      listMyProntoRequests(),
      getOnboardingStatus(),
      getAttorneyMe(),
    ]);
    if (availRes.ok) setAvailability(availRes.data);
    else setError(availRes.message);
    if (onboardingRes.ok) setOnboarding(onboardingRes.data);
    if (meRes.ok) setPracticeAreas(parsePracticeAreas(meRes.data.practice_areas));
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
          <Animated.View
            entering={FadeInUp.delay(60).duration(500).easing(Easing.out(Easing.cubic))}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.accentBorder }]}
          >
            <View style={styles.rowHeader}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                You&apos;re all set
              </Text>
            </View>
            <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
              Please wait for a staff member to enable Pronto access for you. You&apos;ll be able to
              go on duty here as soon as your account is enabled.
            </Text>
            <Pressable
              onPress={() => router.push('/(auth)/profile/practice-areas')}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: colors.cardBorder, opacity: pressed ? 0.7 : 1, marginTop: spacing.md },
              ]}
            >
              <Ionicons name="briefcase-outline" size={16} color={colors.text} />
              <Text style={[styles.secondaryBtnLabel, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                Set practice areas
              </Text>
            </Pressable>
          </Animated.View>
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
                  <View
                    key={req.id}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.accentBorder }]}
                  >
                    <View style={styles.reqHeader}>
                      <View style={{ flex: 1, gap: spacing.xs }}>
                        <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                          {req.practice_area_name}
                        </Text>
                        <View style={styles.reqClientRow}>
                          <Ionicons name="person-outline" size={12} color={colors.textMuted} />
                          <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                            {req.client_name}
                            {req.attempt_count > 0 ? ' · re-listed' : ''}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.feePill, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
                        <Text style={[styles.feePillText, { color: colors.accent, fontFamily: fonts.sansBold }]}>
                          {formatMoney(req.fee_amount_cents, req.fee_currency)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.urgencyRow}>
                      <Ionicons name="flash-outline" size={12} color={colors.textMuted} />
                      <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                        First to accept wins
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
                        <>
                          <Ionicons name="pencil-outline" size={15} color={colors.background} />
                          <Text style={[styles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                            Accept &amp; Sign
                          </Text>
                        </>
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

      <ProntoActionSheet
        modal={modal}
        colors={colors}
        onDismiss={() => setModal(null)}
        onConfirmAccept={(req) => { setModal(null); doAccept(req); }}
      />

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
  reqClientRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  urgencyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  feePillText: { fontSize: 16 },
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

const sheetStyles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 44,
    gap: spacing.md,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    marginBottom: spacing.xs,
  },
  badge: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 21, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: spacing.sm },
  hint: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: spacing.sm },
  infoBox: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  infoDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.md },
  infoText: { flex: 1, fontSize: 14 },
  infoFee: { fontSize: 17 },
  noticeBox: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  btnRow: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  btnFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: radius.md,
    alignSelf: 'stretch',
  },
  btnFilledLabel: { fontSize: 15, letterSpacing: 0.4 },
  btnOutlined: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  btnOutlinedLabel: { fontSize: 15, letterSpacing: 0.3 },
});
