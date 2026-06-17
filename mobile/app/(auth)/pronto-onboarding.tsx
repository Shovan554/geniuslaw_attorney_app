import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useStripeIdentity } from '@stripe/stripe-identity-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PracticeAreaPicker } from '../../components/PracticeAreaPicker';
import { fonts, radius, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getAttorneyMe } from '../../lib/attorney';
import {
  acceptProntoTerms,
  connectRefresh,
  connectStart,
  createKycSession,
  getOnboardingStatus,
  refreshKycStatus,
  type OnboardingStatus,
} from '../../lib/onboarding';
import {
  listPracticeAreas,
  parsePracticeAreas,
  savePracticeAreas,
  type PracticeArea,
} from '../../lib/practiceAreas';
import { createSetupBundle, getSavedCard } from '../../lib/vault';

const PLATFORM_FEE = '$39.95';

// Value props shown on the terms step — the subscription unlocks both products.
const TERMS_BENEFITS = [
  'GeniusLaw Premium for case management — included',
  'Instant Pronto consultations, paid upfront',
  'Cancel anytime from your profile',
];

const TERMS_BODY =
  'Pronto!, a service of GeniusLaw, connects you with clients seeking immediate ' +
  'legal consultation. By agreeing, you authorize a recurring platform fee of ' +
  `${PLATFORM_FEE}/month charged to the card on file. Your subscription begins ` +
  'immediately and renews monthly until canceled. You may cancel at any time from ' +
  'your profile settings. No refunds are issued for partial billing periods.';

type Step = 'loading' | 'kyc' | 'payment' | 'terms' | 'practices' | 'connect' | 'waiting';

const STEPS: { key: Exclude<Step, 'loading' | 'waiting'>; label: string }[] = [
  { key: 'kyc', label: 'Identity' },
  { key: 'payment', label: 'Payment' },
  { key: 'terms', label: 'Terms' },
  { key: 'practices', label: 'Practice' },
  { key: 'connect', label: 'Payouts' },
];

function stepFromStatus(s: OnboardingStatus): Step {
  if (!s.kyc_verified) return 'kyc';
  if (!s.has_card) return 'payment';
  if (!s.terms_accepted) return 'terms';
  if (!s.practices_selected) return 'practices';
  // Payouts is the last step. It renders either "set up" or "already set for your
  // firm — you're good" based on the firm's Connect readiness.
  return 'connect';
}

function currentIndex(step: Step): number {
  if (step === 'kyc') return 0;
  if (step === 'payment') return 1;
  if (step === 'terms') return 2;
  if (step === 'practices') return 3;
  if (step === 'connect') return 4;
  return 5; // waiting → all complete
}

export default function ProntoOnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [step, setStep] = useState<Step>('loading');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // --- Practice areas step ---
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [selectedPractices, setSelectedPractices] = useState<Set<string>>(new Set());
  const [practicesLoading, setPracticesLoading] = useState(false);
  const [connectStatus, setConnectStatus] = useState<'unknown' | 'ready' | 'pending'>('unknown');

  const reload = useCallback(async () => {
    const res = await getOnboardingStatus();
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    if (res.data.pronto_enabled) {
      router.replace('/pronto');
      return;
    }
    const next = stepFromStatus(res.data);
    setStep(next);
    if (next === 'connect') {
      if (res.data.connect_ready) {
        setConnectStatus('ready');
      } else {
        const r = await connectRefresh();
        if (r.ok) setConnectStatus(r.data.status === 'ready' ? 'ready' : 'pending');
        else setMessage(r.message);
      }
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // The Connect (payouts) step sends the attorney to a Stripe-hosted page in an
  // external browser. useFocusEffect does NOT re-fire on app foreground (the
  // screen never lost navigation focus), so re-check status whenever the app
  // becomes active — that's when they return from Stripe, and it promotes the
  // firm to payout-ready.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload();
    });
    return () => sub.remove();
  }, [reload]);

  // --- KYC step (Stripe Identity native sheet) ---
  const fetchIdentityOptions = useCallback(async () => {
    const res = await createKycSession();
    if (!res.ok) throw new Error(res.message);
    return {
      sessionId: res.data.session_id,
      ephemeralKeySecret: res.data.ephemeral_key_secret,
      brandLogo: Image.resolveAssetSource(require('../../assets/icon.png')),
    };
  }, []);

  const {
    status: identityStatus,
    present: presentIdentity,
    loading: identityLoading,
  } = useStripeIdentity(fetchIdentityOptions);

  useEffect(() => {
    if (identityStatus === 'FlowCompleted') {
      setWorking(true);
      setMessage('Reviewing your ID…');
      refreshKycStatus()
        .then((r) => {
          if (r.ok && !r.data.kyc_verified) {
            setMessage("We're still reviewing your ID. Check back shortly.");
          } else if (!r.ok) {
            setMessage(r.message);
          }
        })
        .finally(() => {
          setWorking(false);
          reload();
        });
    }
  }, [identityStatus, reload]);

  // --- Payment step (reuse vault PaymentSheet) ---
  const addCard = useCallback(async () => {
    setWorking(true);
    setMessage(null);
    const bundleRes = await createSetupBundle();
    if (!bundleRes.ok) {
      setMessage(bundleRes.message);
      setWorking(false);
      return;
    }
    const b = bundleRes.data;
    const init = await initPaymentSheet({
      merchantDisplayName: 'Genius Law',
      customerId: b.customer_id,
      customerEphemeralKeySecret: b.ephemeral_key,
      setupIntentClientSecret: b.setup_intent_client_secret,
      returnURL: 'geniuslawattorney://stripe-redirect',
    });
    if (init.error) {
      setMessage(init.error.message);
      setWorking(false);
      return;
    }
    const { error } = await presentPaymentSheet();
    if (error) {
      if (error.code !== 'Canceled') setMessage(error.message);
      setWorking(false);
      return;
    }
    // Persist the just-attached card (brand/last4) to the attorney row before
    // re-reading onboarding status — otherwise has_card stays false.
    await getSavedCard();
    setWorking(false);
    await reload();
  }, [initPaymentSheet, presentPaymentSheet, reload]);

  // --- Terms step ---
  const agree = useCallback(async () => {
    setWorking(true);
    setMessage(null);
    const res = await acceptProntoTerms();
    if (!res.ok) setMessage(res.message);
    setWorking(false);
    await reload();
  }, [reload]);

  // --- Practice areas step ---
  // Load the catalog + the attorney's existing selections when this step opens.
  useEffect(() => {
    if (step !== 'practices') return;
    let cancelled = false;
    setPracticesLoading(true);
    Promise.all([listPracticeAreas(), getAttorneyMe()])
      .then(([catalog, me]) => {
        if (cancelled) return;
        if (catalog.ok) setPracticeAreas(catalog.data);
        else setMessage(catalog.message);
        if (me.ok) setSelectedPractices(new Set(parsePracticeAreas(me.data.practice_areas)));
      })
      .finally(() => {
        if (!cancelled) setPracticesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  const togglePractice = useCallback((name: string) => {
    setSelectedPractices((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const savePractices = useCallback(async () => {
    if (selectedPractices.size === 0) return;
    setWorking(true);
    setMessage(null);
    const res = await savePracticeAreas([...selectedPractices]);
    setWorking(false);
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    // Practices saved → advance to the payouts step (reload computes 'connect'
    // and checks the firm's Connect readiness).
    await reload();
  }, [selectedPractices, reload]);

  const setupPayouts = useCallback(async () => {
    setWorking(true);
    setMessage(null);
    const res = await connectStart();
    setWorking(false);
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    if (res.data.status === 'ready') {
      setConnectStatus('ready');
      return;
    }
    if (res.data.url) {
      // Opens Stripe-hosted onboarding. On return to the app, useFocusEffect →
      // reload() → connectRefresh() promotes the firm once payouts are enabled.
      await Linking.openURL(res.data.url);
    } else {
      setMessage('Could not open Stripe payouts. Please try again.');
    }
  }, []);

  const activeIndex = currentIndex(step);
  const successTint = 'rgba(76,175,125,0.12)';
  const successBorder = 'rgba(76,175,125,0.40)';

  // --- Per-step hero content ---
  const hero =
    step === 'kyc'
      ? {
          icon: 'shield-checkmark-outline' as const,
          title: 'Verify your identity',
          body: 'Scan your government photo ID and take a quick selfie. This confirms you are who you say you are.',
          points: ['Government photo ID', 'Live selfie check', 'Takes about a minute'],
          cta: 'Start verification',
          onPress: () => presentIdentity(),
          busy: identityLoading,
        }
      : step === 'payment'
        ? {
            icon: 'card-outline' as const,
            title: 'Add a payment method',
            body: "You're verified. Add a card we'll keep on file for the Pronto platform fee. Your card is stored securely by Stripe — GeniusLaw never saves your card information.",
            points: [
              `${PLATFORM_FEE}/month platform fee, billed immediately`,
              'Stored securely by Stripe — GeniusLaw never sees your card details',
              'Cancel anytime from your profile',
            ],
            cta: 'Add card',
            onPress: addCard,
            busy: false,
          }
        : step === 'terms'
          ? {
              icon: 'document-text-outline' as const,
              title: 'Accept the platform terms',
              body: TERMS_BODY,
              points: [],
              cta: `I agree to ${PLATFORM_FEE}/month`,
              onPress: agree,
              busy: false,
            }
          : step === 'practices'
            ? {
                icon: 'briefcase-outline' as const,
                title: 'Choose your practice areas',
                body: 'Please select your practice areas.',
                points: [],
                cta: 'Save & continue',
                onPress: savePractices,
                busy: false,
              }
            : connectStatus === 'ready'
              ? {
                  icon: 'cash-outline' as const,
                  title: 'Payouts ready',
                  body: "Stripe payouts are already set up for your firm — you're good to go.",
                  points: [],
                  cta: 'Continue',
                  onPress: () => router.replace('/pronto'),
                  busy: false,
                }
              : {
                  icon: 'cash-outline' as const,
                  title: 'Set up firm payouts',
                  body: "Connect your firm's bank account through Stripe so client payments can reach you. Stripe securely collects your bank and verification details — it only takes a couple of minutes.",
                  points: [],
                  cta: 'Set up payouts',
                  onPress: setupPayouts,
                  busy: false,
                };

  const ctaDisabled =
    working || hero.busy || (step === 'practices' && selectedPractices.size === 0);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={[styles.eyebrow, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}>
            Pronto onboarding
          </Text>
          <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
            Get Pronto access
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Progress bar */}
      {step !== 'loading' ? (
        <View style={styles.stepperWrap}>
          <View style={styles.stepperRow}>
            {STEPS.map((s, i) => {
              const done = i < activeIndex;
              const active = i === activeIndex;
              return (
                <Fragment key={s.key}>
                  <View
                    style={[
                      styles.bead,
                      done
                        ? { backgroundColor: colors.accent, borderColor: colors.accent }
                        : active
                          ? { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }
                          : { backgroundColor: 'transparent', borderColor: colors.cardBorder },
                    ]}
                  >
                    {done ? (
                      <Ionicons name="checkmark" size={16} color={colors.background} />
                    ) : (
                      <Text
                        style={[
                          styles.beadNum,
                          {
                            color: active ? colors.accent : colors.textMuted,
                            fontFamily: fonts.sansBold,
                          },
                        ]}
                      >
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  {i < STEPS.length - 1 ? (
                    <View
                      style={[
                        styles.connector,
                        { backgroundColor: i < activeIndex ? colors.accent : colors.cardBorder },
                      ]}
                    />
                  ) : null}
                </Fragment>
              );
            })}
          </View>
          <View style={styles.labelRow}>
            {STEPS.map((s, i) => {
              const reached = i <= activeIndex;
              return (
                <Text
                  key={s.key}
                  style={[
                    styles.stepLabel,
                    {
                      color: reached ? colors.text : colors.textMuted,
                      fontFamily: i === activeIndex ? fonts.sansSemiBold : fonts.sans,
                      textAlign: i === 0 ? 'left' : i === STEPS.length - 1 ? 'right' : 'center',
                    },
                  ]}
                >
                  {s.label}
                </Text>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Body */}
      {step === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : step === 'waiting' ? (
        <Animated.View entering={FadeIn.duration(380)} style={styles.waitingWrap}>
          <View style={[styles.badge, { backgroundColor: successTint, borderColor: successBorder }]}>
            <Ionicons name="checkmark-circle" size={44} color={colors.success} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text, fontFamily: fonts.heading }]}>
            You&apos;re all set
          </Text>
          <Text style={[styles.heroBody, { color: colors.textMuted, fontFamily: fonts.sans }]}>
            A staff member will give you access to Pronto shortly. You&apos;ll land on the Pronto
            dashboard automatically as soon as your account is enabled.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/pronto')}
            style={[styles.secondaryBtn, { borderColor: colors.cardBorder }]}
          >
            <Text style={[styles.secondaryLabel, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
              Back to Pronto
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View key={step} entering={FadeInDown.duration(340)} style={styles.heroWrap}>
              <View
                style={[styles.badge, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}
              >
                <Ionicons name={hero.icon} size={36} color={colors.accent} />
              </View>
              <Text style={[styles.heroTitle, { color: colors.text, fontFamily: fonts.heading }]}>
                {hero.title}
              </Text>

              {step === 'terms' ? (
                <>
                  <Text style={[styles.heroBody, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                    One subscription unlocks Pronto and your full GeniusLaw workspace.
                  </Text>

                  <View style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <View style={styles.planPriceRow}>
                      <Text style={[styles.planPrice, { color: colors.text, fontFamily: fonts.heading }]}>
                        {PLATFORM_FEE}
                      </Text>
                      <Text style={[styles.planPeriod, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                        /month
                      </Text>
                    </View>

                    <View style={[styles.planDivider, { backgroundColor: colors.cardBorder }]} />

                    {TERMS_BENEFITS.map((b) => (
                      <View key={b} style={styles.benefitRow}>
                        <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                        <Text style={[styles.benefitText, { color: colors.text, fontFamily: fonts.sans }]}>
                          {b}
                        </Text>
                      </View>
                    ))}

                    <View style={[styles.planDivider, { backgroundColor: colors.cardBorder }]} />

                    <Text style={[styles.finePrint, { color: colors.text, fontFamily: fonts.sans }]}>
                      {hero.body}
                    </Text>
                  </View>
                </>
              ) : step === 'practices' ? (
                <>
                  <Text style={[styles.heroBody, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                    {hero.body}
                  </Text>
                  {practicesLoading ? (
                    <ActivityIndicator color={colors.textMuted} style={{ marginTop: spacing.xl }} />
                  ) : (
                    <View style={styles.practicesWrap}>
                      <PracticeAreaPicker
                        areas={practiceAreas}
                        selected={selectedPractices}
                        onToggle={togglePractice}
                        preRetainerOnly
                      />
                    </View>
                  )}
                </>
              ) : (
                <Text style={[styles.heroBody, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  {hero.body}
                </Text>
              )}

              {hero.points.length > 0 ? (
                <View style={styles.points}>
                  {hero.points.map((p) => (
                    <View key={p} style={styles.pointRow}>
                      <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                      <Text style={[styles.pointText, { color: colors.text, fontFamily: fonts.sans }]}>
                        {p}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Animated.View>
          </ScrollView>

          {/* Sticky footer CTA */}
          <View style={[styles.footer, { borderTopColor: colors.cardBorder }]}>
            {message ? (
              <Text style={[styles.status, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {message}
              </Text>
            ) : null}
            <TouchableOpacity
              disabled={ctaDisabled}
              onPress={hero.onPress}
              style={[styles.cta, { backgroundColor: colors.accent, opacity: ctaDisabled ? 0.6 : 1 }]}
            >
              {working ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={[styles.ctaText, { color: colors.background, fontFamily: fonts.sansBold }]}>
                  {hero.cta}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
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
  eyebrow: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 20 },

  // Progress bar
  stepperWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  stepperRow: { flexDirection: 'row', alignItems: 'center' },
  bead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beadNum: { fontSize: 13 },
  connector: { flex: 1, height: 2, marginHorizontal: spacing.xs, borderRadius: 1 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  stepLabel: { fontSize: 12, flex: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Hero
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexGrow: 1 },
  heroWrap: { alignItems: 'center', paddingTop: spacing.lg },
  badge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  heroTitle: { fontSize: 23, textAlign: 'center' },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },

  // Terms-specific
  planCard: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  planPriceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  planPrice: { fontSize: 34, letterSpacing: 0.2 },
  planPeriod: { fontSize: 15, marginLeft: 4 },
  planDivider: { height: 1, alignSelf: 'stretch', marginVertical: spacing.lg },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  benefitText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  finePrint: {
    alignSelf: 'stretch',
    fontSize: 15.5,
    lineHeight: 23,
    textAlign: 'left',
  },

  // Practice areas
  practicesWrap: { alignSelf: 'stretch', marginTop: spacing.xl },

  // Points
  points: { alignSelf: 'stretch', marginTop: spacing.xl, gap: spacing.md },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pointText: { fontSize: 15 },

  // Footer
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
  },
  status: { fontSize: 13, textAlign: 'center', marginBottom: spacing.sm },
  cta: { borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  ctaText: { fontSize: 16, letterSpacing: 0.4 },

  // Waiting
  waitingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  secondaryBtn: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  secondaryLabel: { fontSize: 15 },
});
