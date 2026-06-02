import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useStripeIdentity } from '@stripe/stripe-identity-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  acceptProntoTerms,
  createKycSession,
  getOnboardingStatus,
  refreshKycStatus,
  type OnboardingStatus,
} from '../../lib/onboarding';
import { createSetupBundle, getSavedCard } from '../../lib/vault';

const PLATFORM_FEE = '$39.95';

const TERMS_BODY =
  'GeniusLaw Pronto connects you with clients seeking immediate consultations. ' +
  'To keep your account active you agree to the Pronto platform fee of ' +
  `${PLATFORM_FEE}/month, billed to the card you have on file once a staff member ` +
  'enables your access. You can cancel anytime from your profile. ' +
  'No charge is made today — accepting only confirms you agree to the fee going forward.';

type Step = 'loading' | 'kyc' | 'payment' | 'terms' | 'waiting';

const STEPS: { key: Exclude<Step, 'loading' | 'waiting'>; label: string }[] = [
  { key: 'kyc', label: 'Identity' },
  { key: 'payment', label: 'Payment' },
  { key: 'terms', label: 'Terms' },
];

function stepFromStatus(s: OnboardingStatus): Step {
  if (!s.kyc_verified) return 'kyc';
  if (!s.has_card) return 'payment';
  if (!s.terms_accepted) return 'terms';
  return 'waiting';
}

function currentIndex(step: Step): number {
  if (step === 'kyc') return 0;
  if (step === 'payment') return 1;
  if (step === 'terms') return 2;
  return 3; // waiting → all complete
}

export default function ProntoOnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [step, setStep] = useState<Step>('loading');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
    setStep(stepFromStatus(res.data));
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

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
            body: "You're verified. Add a card we'll keep on file for the Pronto platform fee.",
            points: [
              `${PLATFORM_FEE} / month platform fee`,
              'No charge today — card saved on file',
              'Stored securely by Stripe',
            ],
            cta: 'Add card',
            onPress: addCard,
            busy: false,
          }
        : {
            icon: 'document-text-outline' as const,
            title: 'Accept the platform terms',
            body: TERMS_BODY,
            points: [],
            cta: `I agree to ${PLATFORM_FEE}/month`,
            onPress: agree,
            busy: false,
          };

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
                  <View style={[styles.feePill, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
                    <Text style={[styles.feePillText, { color: colors.accent, fontFamily: fonts.sansBold }]}>
                      {PLATFORM_FEE} / month
                    </Text>
                  </View>
                  <View style={[styles.termsBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                    <Text style={[styles.termsText, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                      {hero.body}
                    </Text>
                  </View>
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
              disabled={working || hero.busy}
              onPress={hero.onPress}
              style={[styles.cta, { backgroundColor: colors.accent, opacity: working || hero.busy ? 0.6 : 1 }]}
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
  feePill: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  feePillText: { fontSize: 14, letterSpacing: 0.3 },
  termsBox: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  termsText: { fontSize: 13, lineHeight: 20 },

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
