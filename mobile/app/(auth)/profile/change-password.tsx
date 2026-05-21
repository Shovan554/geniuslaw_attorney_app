import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../../components/Card';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { changePassword } from '../../../lib/auth';

export default function ChangePasswordScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validate = (): string | null => {
    if (!current) return 'Enter your current password.';
    if (next.length < 8) return 'New password must be at least 8 characters.';
    if (next !== confirm) return 'New passwords do not match.';
    if (next === current) return 'New password must differ from current.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSaving(true);
    const res = await changePassword(current, next);
    setSaving(false);
    if (res.ok) {
      setSuccess(true);
      setTimeout(() => router.back(), 900);
    } else {
      setError(res.message);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
          Change Password
        </Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.duration(320)}>
            <Card>
              <PasswordField
                label="Current Password"
                value={current}
                onChangeText={setCurrent}
                visible={showCurrent}
                onToggleVisible={() => setShowCurrent((v) => !v)}
                colors={colors}
              />
              <PasswordField
                label="New Password"
                value={next}
                onChangeText={setNext}
                visible={showNext}
                onToggleVisible={() => setShowNext((v) => !v)}
                colors={colors}
              />
              <PasswordField
                label="Confirm New Password"
                value={confirm}
                onChangeText={setConfirm}
                visible={showConfirm}
                onToggleVisible={() => setShowConfirm((v) => !v)}
                colors={colors}
              />
              <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                At least 8 characters.
              </Text>
            </Card>
          </Animated.View>

          {error ? (
            <Text style={[styles.errorText, { color: colors.danger, fontFamily: fonts.sans }]}>
              {error}
            </Text>
          ) : null}
          {success ? (
            <Text style={[styles.successText, { color: colors.success, fontFamily: fonts.sansSemiBold }]}>
              Password updated.
            </Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: colors.btnBg, borderColor: colors.btnBg },
              (saving || success) && { opacity: 0.6 },
            ]}
            onPress={handleSubmit}
            disabled={saving || success}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={colors.btnText} />
            ) : (
              <Text style={[styles.saveText, { color: colors.btnText, fontFamily: fonts.sansBold }]}>
                Update Password
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type PasswordFieldProps = {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  colors: {
    inputBg: string;
    inputBorder: string;
    inputText: string;
    textMuted: string;
  };
};

function PasswordField({
  label,
  value,
  onChangeText,
  visible,
  onToggleVisible,
  colors,
}: PasswordFieldProps) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={[fieldStyles.label, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}>
        {label}
      </Text>
      <View
        style={[
          fieldStyles.inputRow,
          { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          style={[fieldStyles.input, { color: colors.inputText }]}
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity onPress={onToggleVisible} hitSlop={10} style={fieldStyles.eye}>
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color={colors.textMuted}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  hint: {
    fontSize: 12,
    marginTop: spacing.xs,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  successText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  saveBtn: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: {
    fontSize: 13,
    letterSpacing: 0.8,
  },
});

const fieldStyles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
  },
  eye: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
});
