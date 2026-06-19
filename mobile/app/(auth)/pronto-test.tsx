import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ProntoActionSheet,
  ProntoOpenRequestCard,
  formatMoney,
  type ProntoRequestModalState,
} from '../../components/ProntoOpenRequest';
import { fonts, radius, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { startProntoTest, type OpenRequest, type TestCallStart } from '../../lib/pronto';
import { displayTestIncomingCall, markTestCall } from '../../lib/testCall';

// Guided walkthrough phases:
//   idle         → before "Start test call"
//   requesting   → 3s pause explaining that a client request arrives as a push
//   request      → the (shared) open-request card is shown; attorney Accepts & Signs
//   awaitingCall → 10s pause explaining the client now pays, then a call comes
//   ringing      → the local CallKit ring has been triggered
type Phase = 'idle' | 'requesting' | 'request' | 'awaitingCall' | 'ringing';

// How long each guided pause lasts (ms).
const REQUEST_DELAY_MS = 6000;
const PAYMENT_DELAY_MS = 10000;

export default function ProntoTestScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [starting, setStarting] = useState(false);
  const [start, setStart] = useState<TestCallStart | null>(null);
  const [modal, setModal] = useState<ProntoRequestModalState>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Reset to a clean state whenever the screen regains focus (e.g. returning
  // from the test call) so the demo is re-runnable.
  useFocusEffect(
    useCallback(() => {
      setPhase('idle');
      setStart(null);
      setStarting(false);
      setModal(null);
      return () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
      };
    }, []),
  );

  const onStart = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    const res = await startProntoTest();
    setStarting(false);
    if (!res.ok) {
      Alert.alert('Could not start test', res.message);
      return;
    }
    setStart(res.data);
    // The push banner has already fired from /test/start. Pause briefly while we
    // explain that a client request arrives as a notification, then reveal it.
    setPhase('requesting');
    const t = setTimeout(() => setPhase('request'), REQUEST_DELAY_MS);
    timers.current.push(t);
  }, [starting]);

  const onConfirmAccept = useCallback(
    (req: OpenRequest) => {
      if (!start) return;
      // Show the real "Retainer signed" success sheet, then hold on a payment
      // explainer before the client "calls" — mirrors the real money flow.
      setPhase('awaitingCall');
      setModal({
        kind: 'accepted',
        clientName: req.client_name,
        practiceArea: req.practice_area_name,
        fee: formatMoney(req.fee_amount_cents, req.fee_currency),
      });
      markTestCall(start.call_id, { isVideo: start.is_video, clientName: start.client_name });
      const t = setTimeout(() => {
        displayTestIncomingCall(start.call_id, start.client_name, start.is_video);
        setPhase('ringing');
      }, PAYMENT_DELAY_MS);
      timers.current.push(t);
    },
    [start],
  );

  const dummyReq: OpenRequest | null = start
    ? {
        id: -1,
        client_name: start.client_name,
        client_state: 'California',
        client_email: 'john.doe@example.com',
        client_phone: '(555) 010-1234',
        practice_area_name: start.practice_area_name,
        fee_amount_cents: start.fee_amount_cents,
        fee_currency: start.fee_currency,
        signed_at: null,
        paid_at: null,
        attempt_count: 0,
      }
    : null;

  const statusText =
    phase === 'requesting'
      ? 'Waiting for a client request…'
      : phase === 'request'
        ? 'A request just came in below — tap to review.'
        : phase === 'awaitingCall'
          ? 'Retainer signed — waiting on the client’s payment…'
          : 'Calling you now — answer the incoming call.';

  const showInfo = phase === 'requesting' || phase === 'awaitingCall';

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={[styles.eyebrow, { color: colors.accent, fontFamily: fonts.sansBold }]}>
            TEST MODE
          </Text>
          <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
            Try a test call
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Replica of the "you're all set" card */}
        <Animated.View
          entering={FadeInUp.duration(400)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.accentBorder }]}
        >
          <View
            style={[
              styles.badge,
              { backgroundColor: 'rgba(76,175,125,0.12)', borderColor: 'rgba(76,175,125,0.40)' },
            ]}
          >
            <Ionicons name="call" size={40} color={colors.success} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.heading }]}>
            Preview a Pronto call
          </Text>
          <Text style={[styles.cardHint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
            This is a safe walkthrough — no real client is involved. You&apos;ll get a
            notification, an incoming request, and a real call you can join.
          </Text>

          {phase === 'idle' ? (
            <Pressable
              onPress={onStart}
              disabled={starting}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.accent, opacity: starting ? 0.6 : pressed ? 0.85 : 1 },
              ]}
            >
              {starting ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={[styles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                  Start test call
                </Text>
              )}
            </Pressable>
          ) : (
            <Text style={[styles.waiting, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}>
              {statusText}
            </Text>
          )}
        </Animated.View>

        {/* Guided info step — what's happening behind the scenes during each pause */}
        {showInfo ? (
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.accentBorder }]}
          >
            <View style={[styles.infoIcon, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
              <Ionicons
                name={phase === 'requesting' ? 'notifications-outline' : 'card-outline'}
                size={22}
                color={colors.accent}
              />
            </View>
            <View style={styles.infoTextWrap}>
              <Text style={[styles.infoTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                {phase === 'requesting' ? 'How requests reach you' : 'Payment in progress'}
              </Text>
              <Text style={[styles.infoText, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {phase === 'requesting'
                  ? 'When a client submits a request, it pops up as a notification for you — tap it to review and accept the consultation.'
                  : 'Now the client pays. As soon as the payment goes through, you’ll receive a call from the client — get ready to answer.'}
              </Text>
            </View>
            <ActivityIndicator color={colors.accent} />
          </Animated.View>
        ) : null}

        {/* Shared open-request card — identical to the real Pronto screen */}
        {phase === 'request' && dummyReq ? (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
              Open request (1)
            </Text>
            <ProntoOpenRequestCard
              req={dummyReq}
              accepting={false}
              disabled={false}
              colors={colors}
              onAccept={(r) => setModal({ kind: 'confirm', req: r })}
            />
          </Animated.View>
        ) : null}
      </ScrollView>

      <ProntoActionSheet
        modal={modal}
        colors={colors}
        onDismiss={() => setModal(null)}
        onConfirmAccept={onConfirmAccept}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, alignItems: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.5 },
  title: { fontSize: 20 },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: { fontSize: 18, textAlign: 'center' },
  cardHint: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  waiting: { fontSize: 14, textAlign: 'center', marginTop: spacing.sm },
  primaryBtn: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  primaryBtnLabel: { fontSize: 15 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextWrap: { flex: 1, gap: 4 },
  infoTitle: { fontSize: 15 },
  infoText: { fontSize: 13, lineHeight: 18 },
  section: { gap: spacing.sm },
  sectionLabel: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
});
