import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import { requestPasswordReset, resetPassword, verifyResetOtp } from '../lib/auth';

type Step = 'email' | 'otp' | 'password';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const cardTranslateY = useSharedValue(0);
  const entranceY = useSharedValue(600);

  React.useEffect(() => {
    entranceY.value = withDelay(300, withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value + entranceY.value }],
  }));

  const animateStepChange = (next: Step) => {
    cardTranslateY.value = 40;
    setStep(next);
    cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 200 });
  };

  const handleSendCode = async () => {
    setError('');
    setInfo('');
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    const result = await requestPasswordReset(email);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setInfo('If an account exists for that email, a 6-digit code has been sent.');
    animateStepChange('otp');
  };

  const handleVerifyOtp = async () => {
    setError('');
    setInfo('');
    if (otp.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    const result = await verifyResetOtp(email, otp);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    animateStepChange('password');
  };

  const handleResendOtp = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    const result = await requestPasswordReset(email);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOtp('');
    setInfo('A new code has been sent to your email.');
  };

  const handleResetPassword = async () => {
    setError('');
    setInfo('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const result = await resetPassword(email, otp, newPassword);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace({ pathname: '/login', params: { toast: 'password_updated' } });
  };

  const onOtpChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 6);
    setOtp(clean);
  };

  const goBack = () => {
    setError('');
    setInfo('');
    if (step === 'otp') {
      setOtp('');
      animateStepChange('email');
    } else if (step === 'password') {
      setNewPassword('');
      setConfirmPassword('');
      animateStepChange('otp');
    } else {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  };

  const s = styles(colors);

  const titleByStep: Record<Step, string> = {
    email: 'Forgot password',
    otp: 'Enter verification code',
    password: 'Set new password',
  };

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
          onPress={goBack}
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

              <Text style={s.cardTitle}>{titleByStep[step]}</Text>

              {info !== '' && (
                <View style={s.successBanner}>
                  <Text style={s.successText}>{info}</Text>
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

              {step === 'email' && (
                <>
                  <Text style={s.helperText}>
                    Enter the email associated with your GeniusLaw attorney account and we'll send you a 6-digit code.
                  </Text>
                  <TextInput
                    style={s.input}
                    placeholder="Email address"
                    placeholderTextColor={colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                  <View style={s.btnWrap}>
                    <TouchableOpacity
                      style={[s.btn, { backgroundColor: colors.btnBg, borderColor: colors.btnBg }, loading && s.btnDisabled]}
                      onPress={handleSendCode}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      {loading
                        ? <ActivityIndicator color={colors.btnText} size="small" />
                        : <Text style={[s.btnText, { color: colors.btnText, fontFamily: fonts.sansBold }]}>Send Code</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {step === 'otp' && (
                <>
                  <Text style={s.helperText}>
                    We sent a 6-digit code to <Text style={s.helperEmphasis}>{email}</Text>. Enter it below to continue.
                  </Text>
                  <TextInput
                    style={[s.input, s.otpInput]}
                    placeholder="000000"
                    placeholderTextColor={colors.textMuted}
                    value={otp}
                    onChangeText={onOtpChange}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                  <View style={s.btnWrap}>
                    <TouchableOpacity
                      style={[s.btn, { backgroundColor: colors.btnBg, borderColor: colors.btnBg }, loading && s.btnDisabled]}
                      onPress={handleVerifyOtp}
                      disabled={loading || otp.length !== 6}
                      activeOpacity={0.8}
                    >
                      {loading
                        ? <ActivityIndicator color={colors.btnText} size="small" />
                        : <Text style={[s.btnText, { color: colors.btnText, fontFamily: fonts.sansBold }]}>Verify Code</Text>
                      }
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={handleResendOtp} disabled={loading} style={s.resendWrap}>
                    <Text style={s.resendText}>Didn't get it? Resend code</Text>
                  </TouchableOpacity>
                </>
              )}

              {step === 'password' && (
                <>
                  <Text style={s.helperText}>
                    Choose a new password (at least 8 characters).
                  </Text>
                  <View style={s.passwordWrap}>
                    <TextInput
                      style={s.passwordInput}
                      placeholder="New password"
                      placeholderTextColor={colors.textMuted}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <View style={s.passwordWrap}>
                    <TextInput
                      style={s.passwordInput}
                      placeholder="Confirm password"
                      placeholderTextColor={colors.textMuted}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <TouchableOpacity
                    style={s.toggleRow}
                    onPress={() => setShowPassword((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={16}
                      color={colors.textMuted}
                    />
                    <Text style={s.toggleText}>
                      {showPassword ? 'Hide passwords' : 'Show passwords'}
                    </Text>
                  </TouchableOpacity>
                  <View style={s.btnWrap}>
                    <TouchableOpacity
                      style={[s.btn, { backgroundColor: colors.btnBg, borderColor: colors.btnBg }, loading && s.btnDisabled]}
                      onPress={handleResetPassword}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      {loading
                        ? <ActivityIndicator color={colors.btnText} size="small" />
                        : <Text style={[s.btnText, { color: colors.btnText, fontFamily: fonts.sansBold }]}>Reset Password</Text>
                      }
                    </TouchableOpacity>
                  </View>
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
    cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text, fontFamily: fonts.heading, marginBottom: spacing.md, textAlign: 'center' },
    helperText: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 19 },
    helperEmphasis: { color: colors.text, fontWeight: '600' },
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
    otpInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '700', fontFamily: fonts.sansBold },
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
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
      marginBottom: spacing.sm,
    },
    toggleText: {
      color: colors.textMuted,
      fontSize: 12,
      marginLeft: 6,
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
    resendWrap: { alignItems: 'center', marginTop: spacing.md },
    resendText: { color: colors.gold, fontSize: 13, fontWeight: '600' },
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
    },
    supportEmail: {
      fontWeight: '700',
      color: colors.text,
    },
  });
