import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { Easing, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { DocumentViewerModal } from '../../../components/DocumentViewerModal';
import {
  ProntoRetainer,
  getProntoRetainer,
  getProntoRetainerUrl,
  updateProntoRetainer,
  uploadProntoRetainer,
} from '../../../lib/pronto';

function formatDate(iso: string): string {
  try {
    const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
    const d = new Date(hasTz ? iso : `${iso}Z`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function RetainerDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const retainerId = useMemo(() => Number(id), [id]);

  const [retainer, setRetainer] = useState<ProntoRetainer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [feeDollars, setFeeDollars] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(retainerId)) {
      setError('Invalid retainer id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await getProntoRetainer(retainerId);
    if (!res.ok) {
      setError(res.message);
    } else {
      setRetainer(res.data);
      setFeeDollars(String((res.data.fee_amount_cents / 100).toFixed(0)));
      setActive(res.data.active);
    }
    setLoading(false);
  }, [retainerId]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!retainer) return false;
    const feeNum = Number(feeDollars);
    if (!Number.isFinite(feeNum)) return false;
    const newCents = Math.round(feeNum * 100);
    return newCents !== retainer.fee_amount_cents || active !== retainer.active;
  }, [retainer, feeDollars, active]);

  const saveChanges = useCallback(async () => {
    if (!retainer) return;
    const feeNum = Number(feeDollars);
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      Alert.alert('Invalid fee', 'Fee must be a non-negative number.');
      return;
    }
    setSaving(true);
    const res = await updateProntoRetainer(retainer.id, {
      feeAmountCents: Math.round(feeNum * 100),
      active,
    });
    setSaving(false);
    if (!res.ok) {
      Alert.alert('Could not save', res.message);
      return;
    }
    setRetainer(res.data);
  }, [retainer, feeDollars, active]);

  const previewPdf = useCallback(async () => {
    if (!retainer) return;
    setPreviewing(true);
    const res = await getProntoRetainerUrl(retainer.id);
    setPreviewing(false);
    if (!res.ok) {
      Alert.alert('Could not open document', res.message);
      return;
    }
    setViewerUrl(res.data.url);
  }, [retainer]);

  const replaceFile = useCallback(async () => {
    if (!retainer) return;
    const pick = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (pick.canceled) return;
    const asset = pick.assets[0];
    if (!asset) return;

    setReplacing(true);
    const feeNum = Number(feeDollars);
    const res = await uploadProntoRetainer({
      uri: asset.uri,
      name: asset.name,
      practiceAreaId: retainer.practice_area_id,
      feeAmountCents: Number.isFinite(feeNum) ? Math.round(feeNum * 100) : retainer.fee_amount_cents,
      feeCurrency: retainer.fee_currency,
      active,
    });
    setReplacing(false);
    if (!res.ok) {
      Alert.alert('Replace failed', res.message);
      return;
    }
    setRetainer(res.data);
    setFeeDollars(String((res.data.fee_amount_cents / 100).toFixed(0)));
    setActive(res.data.active);
  }, [retainer, feeDollars, active]);

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text style={[styles.backLabel, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
            Retainers
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : error || !retainer ? (
          <View
            style={[
              styles.errorBox,
              { borderColor: colors.cardBorder, backgroundColor: colors.card },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
            <Text
              style={[styles.errorText, { color: colors.danger, fontFamily: fonts.sansMedium }]}
            >
              {error ?? 'Retainer not found'}
            </Text>
            <Pressable onPress={load} hitSlop={10}>
              <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.duration(420).easing(Easing.out(Easing.cubic))}>
              <Text style={[styles.eyebrow, { color: colors.textMuted, fontFamily: fonts.sansSemiBold }]}>
                Practice area
              </Text>
              <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
                {retainer.practice_area_name}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                Updated {formatDate(retainer.updated_at)}
              </Text>
            </Animated.View>

            <Animated.View
              entering={FadeInUp.delay(80).duration(420)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: fonts.sansSemiBold }]}>
                Fee ({retainer.fee_currency})
              </Text>
              <View
                style={[
                  styles.feeInputWrap,
                  { backgroundColor: colors.background, borderColor: colors.cardBorder },
                ]}
              >
                <Text
                  style={[styles.feePrefix, { color: colors.textMuted, fontFamily: fonts.sansSemiBold }]}
                >
                  $
                </Text>
                <TextInput
                  value={feeDollars}
                  onChangeText={setFeeDollars}
                  keyboardType="numeric"
                  style={[styles.feeInput, { color: colors.text, fontFamily: fonts.sansSemiBold }]}
                />
              </View>

              <View style={styles.activeRow}>
                <Text style={[styles.activeLabel, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                  Active
                </Text>
                <Switch
                  value={active}
                  onValueChange={setActive}
                  trackColor={{ false: colors.cardBorder, true: colors.success }}
                  thumbColor={active ? colors.background : colors.textMuted}
                />
              </View>

              <Pressable
                onPress={saveChanges}
                disabled={!dirty || saving}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.accent,
                    opacity: !dirty || saving ? 0.4 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text
                    style={[styles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}
                  >
                    Save changes
                  </Text>
                )}
              </Pressable>
            </Animated.View>

            <Animated.View
              entering={FadeInUp.delay(140).duration(420)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: fonts.sansSemiBold }]}>
                File
              </Text>
              <View style={styles.fileRow}>
                <Ionicons name="document-text" size={22} color={colors.accent} />
                <Text
                  style={[styles.fileName, { color: colors.text, fontFamily: fonts.sansSemiBold }]}
                  numberOfLines={1}
                >
                  {retainer.retainer_filename ?? 'retainer.docx'}
                </Text>
              </View>

              <View style={styles.fileBtnRow}>
                <Pressable
                  onPress={previewPdf}
                  disabled={previewing}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    {
                      borderColor: colors.accentBorder,
                      backgroundColor: colors.accentTint,
                      opacity: previewing ? 0.6 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  {previewing ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <>
                      <Ionicons name="eye-outline" size={16} color={colors.accent} />
                      <Text
                        style={[styles.secondaryBtnLabel, { color: colors.accent, fontFamily: fonts.sansSemiBold }]}
                      >
                        Preview
                      </Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  onPress={replaceFile}
                  disabled={replacing}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    {
                      borderColor: colors.cardBorder,
                      backgroundColor: colors.background,
                      opacity: replacing ? 0.6 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  {replacing ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <>
                      <Ionicons name="swap-horizontal" size={16} color={colors.text} />
                      <Text
                        style={[styles.secondaryBtnLabel, { color: colors.text, fontFamily: fonts.sansSemiBold }]}
                      >
                        Replace
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>
      <DocumentViewerModal
        visible={viewerUrl !== null}
        url={viewerUrl}
        title={retainer?.retainer_filename ?? retainer?.practice_area_name ?? 'Retainer'}
        onClose={() => setViewerUrl(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backLabel: { fontSize: 15 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  eyebrow: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 28, marginTop: 4 },
  subtitle: { fontSize: 13, marginTop: 4 },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fieldLabel: { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  feeInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: spacing.xs,
  },
  feePrefix: { fontSize: 16 },
  feeInput: { flex: 1, fontSize: 16, padding: 0 },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  activeLabel: { fontSize: 15 },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  primaryBtnLabel: { fontSize: 15, letterSpacing: 0.3 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fileName: { fontSize: 14, flex: 1 },
  fileBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  secondaryBtnLabel: { fontSize: 14, letterSpacing: 0.3 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: 13 },
});
