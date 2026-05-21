import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import { fonts, radius, spacing } from '../constants/theme';
import type { AppColors } from '../constants/theme';
import { signIn, verifyTotp } from '../lib/auth';

type Step = 'credentials' | 'totp';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const { toast } = useLocalSearchParams<{ toast?: string }>();
  const [banner, setBanner] = useState<string | null>(null);

  React.useEffect(() => {
    if (toast === 'password_updated') {
      setBanner('Password updated. Please sign in with your new password.');
    }
  }, [toast]);

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const TERMS_KEY = 'gla_terms_accepted_v1';

  React.useEffect(() => {
    AsyncStorage.getItem(TERMS_KEY).then((val) => {
      if (val === 'true') setTermsAccepted(true);
    });
  }, []);

  const toggleTerms = () => {
    setTermsAccepted((prev) => {
      const next = !prev;
      AsyncStorage.setItem(TERMS_KEY, next ? 'true' : 'false').catch(() => {});
      return next;
    });
  };

  const cardTranslateY = useSharedValue(0);
  const entranceY = useSharedValue(600);

  React.useEffect(() => {
    entranceY.value = withDelay(500, withTiming(0, { duration: 750, easing: Easing.out(Easing.cubic) }));
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value + entranceY.value }],
  }));

  const showTotp = () => {
    cardTranslateY.value = 40;
    setStep('totp');
    cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 200 });
  };

  const handleSignIn = async () => {
    setError('');
    if (!termsAccepted) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.');
      return;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);

    if (result.status === 'error') {
      setError(result.message);
    } else if (result.status === 'requires_2fa') {
      showTotp();
    } else {
      if (result.mustChangePassword) {
        router.replace('/(auth)/dashboard');
        return;
      }
      router.replace('/(auth)/dashboard');
    }
  };

  const handleVerifyTotp = async (code: string) => {
    setError('');
    setLoading(true);
    const result = await verifyTotp(code);
    setLoading(false);

    if (result.status === 'error') {
      setError(result.message);
    } else if (result.status === 'success') {
      router.replace('/(auth)/dashboard');
    }
  };

  const onTotpChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 6);
    setTotpCode(clean);
    if (clean.length === 6) handleVerifyTotp(clean);
  };

  const s = styles(colors);

  return (
    <View style={s.root}>
      <LinearGradient
        colors={[colors.bgGradientEnd, colors.bgGradientStart]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={s.container}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
          activeOpacity={0.6}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={s.backBtnIcon}>←</Text>
        </TouchableOpacity>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[s.card, cardStyle]}>
              <Image source={require('../assets/logo.png')} style={s.logo} resizeMode="contain" />

              {step === 'totp' && (
                <Text style={s.cardTitle}>Two-Factor Verification</Text>
              )}

              {banner !== null && (
                <View style={s.successBanner}>
                  <Text style={s.successText}>{banner}</Text>
                </View>
              )}

              {error !== '' && (
                <View style={s.errorBanner}>
                  <View style={s.errorIconWrap}>
                    <Text style={s.errorIcon}>!</Text>
                  </View>
                  <Text style={s.errorText} numberOfLines={3}>{error}</Text>
                </View>
              )}

              {step === 'credentials' ? (
                <>
                  <TextInput
                    style={s.input}
                    placeholder="Email address"
                    placeholderTextColor={colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View style={s.passwordWrap}>
                    <TextInput
                      style={s.passwordInput}
                      placeholder="Password"
                      placeholderTextColor={colors.textMuted}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={s.eyeBtn}
                      onPress={() => setShowPassword((v) => !v)}
                      activeOpacity={0.6}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  <View style={s.btnWrap}>
                    <TouchableOpacity
                      style={[s.btn, { borderColor: colors.sidebarBorder, backgroundColor: colors.sidebarBg }, loading && s.btnDisabled]}
                      onPress={handleSignIn}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      {loading
                        ? <ActivityIndicator color={colors.sidebarText} size="small" />
                        : <Text style={[s.btnText, { color: colors.sidebarText, fontFamily: fonts.sansBold }]}>Sign In</Text>
                      }
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={s.forgotWrap}
                    onPress={() => router.push('/forgot-password')}
                    activeOpacity={0.6}
                  >
                    <Text style={s.forgotText}>Forgot password?</Text>
                  </TouchableOpacity>
                  <View style={s.legalRow}>
                    <TouchableOpacity
                      onPress={() => Linking.openURL('https://www.geniuslaw.com/privacyPolicy')}
                      activeOpacity={0.6}
                    >
                      <Text style={s.legalLink}>Privacy Policy</Text>
                    </TouchableOpacity>
                    <Text style={s.legalSep}>·</Text>
                    <TouchableOpacity
                      onPress={() => Linking.openURL('https://www.geniuslaw.com/terms')}
                      activeOpacity={0.6}
                    >
                      <Text style={s.legalLink}>Terms of Service</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={s.termsRow}
                    onPress={toggleTerms}
                    activeOpacity={0.7}
                  >
                    <View style={[s.checkbox, termsAccepted && s.checkboxChecked]}>
                      {termsAccepted && <Text style={s.checkMark}>✓</Text>}
                    </View>
                    <Text style={s.termsLabel}>I accept the Terms of Service and Privacy Policy</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={s.totpHint}>Enter the 6-digit code from your authenticator app.</Text>
                  <TextInput
                    style={[s.input, s.totpInput]}
                    placeholder="000000"
                    placeholderTextColor={colors.textMuted}
                    value={totpCode}
                    onChangeText={onTotpChange}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                  {loading && <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.md }} />}
                  <TouchableOpacity
                    style={s.backLink}
                    onPress={() => { setStep('credentials'); setTotpCode(''); setError(''); }}
                  >
                    <Text style={s.backLinkText}>← Back</Text>
                  </TouchableOpacity>
                </>
              )}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={s.supportWrap}>
          <Text style={s.supportText}>
            For support, please email{' '}
            <Text style={s.supportEmail}>dev@geniuslaw.com</Text>
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = (colors: AppColors) =>
  StyleSheet.create({
    root: { flex: 1 },
    container: { flex: 1 },
    backBtn: {
      position: 'absolute',
      top: 60,
      left: 20,
      zIndex: 10,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    backBtnIcon: { color: colors.text, fontSize: 20, fontWeight: '400', marginTop: -2 },
    scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
    logo: { width: 180, height: 120, alignSelf: 'center', marginBottom: spacing.lg },
    card: {
      backgroundColor: colors.card,
      borderRadius: 28,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl + spacing.md,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 20,
      elevation: 8,
      width: '88%',
      alignSelf: 'center',
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, fontFamily: fonts.heading, marginBottom: spacing.lg },
    successBanner: {
      backgroundColor: 'rgba(76,175,125,0.12)',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: 'rgba(76,175,125,0.35)',
    },
    successText: { color: colors.success, fontSize: 13, fontWeight: '500' },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(224,82,82,0.10)',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: 'rgba(224,82,82,0.35)',
    },
    errorIconWrap: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    errorIcon: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', marginTop: -1 },
    errorText: { color: colors.danger, fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },
    input: {
      backgroundColor: colors.inputBg,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: 14,
      fontFamily: fonts.sans,
      letterSpacing: 0,
      color: colors.inputText,
      marginBottom: spacing.sm,
    },
    passwordWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBg,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    passwordInput: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 14,
      fontFamily: fonts.sans,
      letterSpacing: 0,
      color: colors.inputText,
    },
    eyeBtn: {
      paddingLeft: spacing.sm,
      paddingVertical: 4,
    },
    btnWrap: { alignItems: 'center', marginTop: spacing.md },
    btn: {
      borderWidth: 1,
      borderRadius: radius.md,
      paddingVertical: 12,
      alignItems: 'center',
      alignSelf: 'stretch',
    },
    btnDisabled: { opacity: 0.6 },
    btnText: { fontSize: 13, lineHeight: 18, letterSpacing: 0.8 },
    forgotWrap: { alignItems: 'center', marginTop: spacing.md },
    forgotText: { color: colors.textMuted, fontSize: 13 },
    legalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    legalLink: { color: colors.textMuted, fontSize: 12, textDecorationLine: 'underline' },
    legalSep: { color: colors.textSubtle, fontSize: 12, marginHorizontal: 8 },
    termsRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'center',
      marginTop: spacing.sm + 4,
      paddingHorizontal: spacing.sm,
    },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
      marginTop: 1,
    },
    checkboxChecked: {
      backgroundColor: colors.gold,
      borderColor: colors.gold,
    },
    checkMark: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', marginTop: -1 },
    termsLabel: { color: colors.textMuted, fontSize: 12, flexShrink: 1, textAlign: 'center' },
    totpHint: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
    totpInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '700' },
    backLink: { alignItems: 'center', marginTop: spacing.md },
    backLinkText: { color: colors.gold, fontSize: 13, fontWeight: '600' },
    supportWrap: {
      position: 'absolute',
      bottom: spacing.lg,
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    supportText: {
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    supportEmail: {
      fontWeight: '700',
      color: colors.text,
    },
  });
