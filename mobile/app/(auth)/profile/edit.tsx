import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import {
  AttorneyProfile,
  AttorneyProfileUpdate,
  getAttorneyMe,
  updateAttorneyMe,
} from '../../../lib/attorney';

type FormState = {
  full_name: string;
  email: string;
  phone: string;
  address: string;
  bar_number: string;
  bio: string;
};

const EMPTY: FormState = {
  full_name: '',
  email: '',
  phone: '',
  address: '',
  bar_number: '',
  bio: '',
};

function buildDiff(original: AttorneyProfile, form: FormState): AttorneyProfileUpdate {
  const out: AttorneyProfileUpdate = {};
  const map: Array<[keyof FormState, keyof AttorneyProfileUpdate]> = [
    ['full_name', 'full_name'],
    ['email', 'email'],
    ['phone', 'phone'],
    ['address', 'address'],
    ['bar_number', 'bar_number'],
    ['bio', 'bio'],
  ];
  for (const [fk, ok] of map) {
    const next = form[fk].trim();
    const prev = ((original[fk] as string | null) ?? '').trim();
    if (next !== prev) {
      (out as any)[ok] = next;
    }
  }
  return out;
}

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [original, setOriginal] = useState<AttorneyProfile | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await getAttorneyMe();
      if (res.ok) {
        setOriginal(res.data);
        setForm({
          full_name: res.data.full_name ?? '',
          email: res.data.email ?? '',
          phone: res.data.phone ?? '',
          address: res.data.address ?? '',
          bar_number: res.data.bar_number ?? '',
          bio: res.data.bio ?? '',
        });
      } else {
        setError(res.message);
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!original) return;
    const updates = buildDiff(original, form);
    if (Object.keys(updates).length === 0) {
      router.back();
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updateAttorneyMe(updates);
    setSaving(false);
    if (res.ok) {
      router.back();
    } else {
      setError(res.message);
    }
  };

  const setField = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const inputStyle = {
    backgroundColor: colors.inputBg,
    borderColor: colors.inputBorder,
    color: colors.inputText,
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
          Edit Profile
        </Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : (
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
                <Field
                  label="Full Name"
                  value={form.full_name}
                  onChangeText={setField('full_name')}
                  inputStyle={inputStyle}
                  colors={colors}
                />
                <Field
                  label="Email"
                  value={form.email}
                  onChangeText={setField('email')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  inputStyle={inputStyle}
                  colors={colors}
                />
                <Field
                  label="Phone"
                  value={form.phone}
                  onChangeText={setField('phone')}
                  keyboardType="phone-pad"
                  inputStyle={inputStyle}
                  colors={colors}
                />
                <Field
                  label="Address"
                  value={form.address}
                  onChangeText={setField('address')}
                  inputStyle={inputStyle}
                  colors={colors}
                />
                <Field
                  label="Bar Number"
                  value={form.bar_number}
                  onChangeText={setField('bar_number')}
                  autoCapitalize="characters"
                  inputStyle={inputStyle}
                  colors={colors}
                />
                <Field
                  label="Bio"
                  value={form.bio}
                  onChangeText={setField('bio')}
                  multiline
                  inputStyle={inputStyle}
                  colors={colors}
                />
              </Card>
            </Animated.View>

            {error ? (
              <Text style={[styles.errorText, { color: colors.danger, fontFamily: fonts.sans }]}>
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: colors.btnBg, borderColor: colors.btnBg },
                saving && { opacity: 0.6 },
              ]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={colors.btnText} />
              ) : (
                <Text style={[styles.saveText, { color: colors.btnText, fontFamily: fonts.sansBold }]}>
                  Save Changes
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
  inputStyle: { backgroundColor: string; borderColor: string; color: string };
  colors: { textMuted: string };
};

function Field({
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
  autoCapitalize,
  inputStyle,
  colors,
}: FieldProps) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={[fieldStyles.label, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[
          fieldStyles.input,
          inputStyle,
          multiline && { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 },
        ]}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        multiline={multiline}
        placeholderTextColor={colors.textMuted}
      />
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
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
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
});
