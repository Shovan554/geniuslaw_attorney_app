import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { Easing, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  PracticeArea,
  ProntoRetainer,
  listProntoPracticeAreas,
  listProntoRetainers,
  uploadProntoRetainer,
} from '../../../lib/pronto';

type PickedFile = { uri: string; name: string; size?: number };

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

function formatDate(iso: string): string {
  try {
    const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
    const d = new Date(hasTz ? iso : `${iso}Z`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function RetainersScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [retainers, setRetainers] = useState<ProntoRetainer[] | null>(null);
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    const [paRes, retRes] = await Promise.all([listProntoPracticeAreas(), listProntoRetainers()]);
    if (!paRes.ok) {
      setError(paRes.message);
    } else {
      setPracticeAreas(paRes.data);
    }
    if (!retRes.ok) {
      setError((prev) => prev ?? retRes.message);
    } else {
      setRetainers(retRes.data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const handleUploaded = useCallback((retainer: ProntoRetainer) => {
    setShowUpload(false);
    setRetainers((prev) => {
      if (!prev) return [retainer];
      const others = prev.filter(
        (r) =>
          !(r.attorney_id === retainer.attorney_id && r.practice_area_id === retainer.practice_area_id),
      );
      return [retainer, ...others];
    });
  }, []);

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AppHeader eyebrow="Pronto" title="Retainers" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <Animated.View
          entering={FadeInDown.duration(500).easing(Easing.out(Easing.cubic))}
          style={styles.accentWrap}
        >
          <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
        </Animated.View>

        <Pressable
          onPress={() => setShowUpload(true)}
          disabled={practiceAreas.length === 0}
          style={({ pressed }) => [
            styles.uploadCta,
            {
              backgroundColor: colors.accent,
              opacity: practiceAreas.length === 0 ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Ionicons name="cloud-upload-outline" size={18} color={colors.background} />
          <Text
            style={[styles.uploadCtaLabel, { color: colors.background, fontFamily: fonts.sansBold }]}
          >
            Upload retainer
          </Text>
        </Pressable>

        {loading && !retainers ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : error && !retainers ? (
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
              {error}
            </Text>
            <Pressable onPress={() => load()} hitSlop={10}>
              <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>Retry</Text>
            </Pressable>
          </View>
        ) : !retainers || retainers.length === 0 ? (
          <Animated.View
            entering={FadeInUp.delay(120).duration(450)}
            style={[
              styles.emptyBox,
              { borderColor: colors.cardBorder, backgroundColor: colors.card },
            ]}
          >
            <Ionicons name="document-text-outline" size={28} color={colors.textMuted} />
            <Text
              style={[styles.emptyTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}
            >
              No retainers uploaded
            </Text>
            <Text
              style={[styles.emptyBody, { color: colors.textMuted, fontFamily: fonts.sans }]}
            >
              Upload one Word retainer (.docx) per practice area. Use the tags {'{{client_name}}'}, {'{{retainer_fee}}'}, {'{{date}}'}, and {'{{CLIENT_SIGNATURE}}'} where you want them filled in at signing time.
            </Text>
          </Animated.View>
        ) : (
          retainers.map((r, idx) => (
            <Animated.View
              key={r.id}
              entering={FadeInUp.delay(80 + idx * 40).duration(420)}
            >
              <Pressable
                onPress={() => router.push(`/(auth)/retainers/${r.id}`)}
                style={({ pressed }) => [
                  styles.retainerCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
              <View style={styles.retainerHeader}>
                <Text
                  style={[
                    styles.retainerService,
                    { color: colors.text, fontFamily: fonts.sansBold },
                  ]}
                >
                  {r.practice_area_name}
                </Text>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: r.active ? colors.accentTint : colors.cardBorder,
                      borderColor: r.active ? colors.accentBorder : colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      {
                        color: r.active ? colors.accent : colors.textMuted,
                        fontFamily: fonts.sansSemiBold,
                      },
                    ]}
                  >
                    {r.active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              </View>
              <Text
                style={[styles.retainerFee, { color: colors.text, fontFamily: fonts.sansSemiBold }]}
              >
                {formatMoney(r.fee_amount_cents, r.fee_currency)}
              </Text>
              <View style={styles.retainerMeta}>
                <Ionicons name="document-outline" size={14} color={colors.textMuted} />
                <Text
                  style={[
                    styles.retainerMetaText,
                    { color: colors.textMuted, fontFamily: fonts.sans },
                  ]}
                  numberOfLines={1}
                >
                  {r.retainer_filename ?? 'retainer.docx'}
                </Text>
              </View>
              <Text
                style={[styles.retainerDate, { color: colors.textMuted, fontFamily: fonts.sans }]}
              >
                Updated {formatDate(r.updated_at)}
              </Text>
              </Pressable>
            </Animated.View>
          ))
        )}
      </ScrollView>

      <UploadModal
        visible={showUpload}
        practiceAreas={practiceAreas}
        existing={retainers ?? []}
        onClose={() => setShowUpload(false)}
        onUploaded={handleUploaded}
      />
    </SafeAreaView>
  );
}

type UploadModalProps = {
  visible: boolean;
  practiceAreas: PracticeArea[];
  existing: ProntoRetainer[];
  onClose: () => void;
  onUploaded: (r: ProntoRetainer) => void;
};

function UploadModal({ visible, practiceAreas, existing, onClose, onUploaded }: UploadModalProps) {
  const { colors } = useTheme();
  const [practiceAreaId, setPracticeAreaId] = useState<number | null>(null);
  const [feeDollars, setFeeDollars] = useState('');
  const [active, setActive] = useState(true);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPracticeAreaId(null);
      setFeeDollars('');
      setActive(true);
      setFile(null);
      setSubmitting(false);
    }
  }, [visible]);

  const existingByPracticeArea = useMemo(() => {
    const map = new Map<number, ProntoRetainer>();
    existing.forEach((r) => map.set(r.practice_area_id, r));
    return map;
  }, [existing]);

  const pickFile = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset) return;
    setFile({ uri: asset.uri, name: asset.name, size: asset.size });
  }, []);

  const submit = useCallback(async () => {
    if (practiceAreaId == null) {
      Alert.alert('Pick a practice area', 'Choose which practice area this retainer is for.');
      return;
    }
    if (!file) {
      Alert.alert('Choose a file', 'Select the retainer Word (.docx) file to upload.');
      return;
    }
    const feeNum = Number(feeDollars);
    if (!Number.isFinite(feeNum) || feeNum < 0) {
      Alert.alert('Enter a valid fee', 'Fee must be a non-negative number.');
      return;
    }
    setSubmitting(true);
    const res = await uploadProntoRetainer({
      uri: file.uri,
      name: file.name,
      practiceAreaId,
      feeAmountCents: Math.round(feeNum * 100),
      feeCurrency: 'USD',
      active,
    });
    setSubmitting(false);
    if (!res.ok) {
      Alert.alert('Upload failed', res.message);
      return;
    }
    onUploaded(res.data);
  }, [practiceAreaId, file, feeDollars, active, onUploaded]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalRoot}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: colors.surface, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text
              style={[styles.modalTitle, { color: colors.text, fontFamily: fonts.heading }]}
            >
              Upload retainer
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.fieldLabel, { color: colors.textMuted, fontFamily: fonts.sansSemiBold }]}>
              Practice area
            </Text>
            <View style={styles.chips}>
              {practiceAreas.map((area) => {
                const selected = practiceAreaId === area.id;
                const replacing = existingByPracticeArea.has(area.id);
                return (
                  <Pressable
                    key={area.id}
                    onPress={() => setPracticeAreaId(area.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.accentTint : colors.card,
                        borderColor: selected ? colors.accentBorder : colors.cardBorder,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: selected ? colors.accent : colors.text,
                          fontFamily: fonts.sansSemiBold,
                        },
                      ]}
                    >
                      {area.name}
                    </Text>
                    {replacing ? (
                      <Text
                        style={[
                          styles.chipMeta,
                          { color: colors.textMuted, fontFamily: fonts.sans },
                        ]}
                      >
                        replaces current
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={[
                styles.fieldLabel,
                { color: colors.textMuted, fontFamily: fonts.sansSemiBold, marginTop: spacing.lg },
              ]}
            >
              Fee (USD)
            </Text>
            <View
              style={[
                styles.feeInputWrap,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
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
                placeholder="500"
                placeholderTextColor={colors.textMuted}
                style={[styles.feeInput, { color: colors.text, fontFamily: fonts.sansSemiBold }]}
              />
            </View>

            <Text
              style={[
                styles.fieldLabel,
                { color: colors.textMuted, fontFamily: fonts.sansSemiBold, marginTop: spacing.lg },
              ]}
            >
              File
            </Text>
            <Pressable
              onPress={pickFile}
              style={({ pressed }) => [
                styles.fileBox,
                {
                  backgroundColor: colors.card,
                  borderColor: file ? colors.accentBorder : colors.cardBorder,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons
                name={file ? 'document-text' : 'document-attach-outline'}
                size={20}
                color={file ? colors.accent : colors.textMuted}
              />
              <Text
                style={[
                  styles.fileLabel,
                  {
                    color: file ? colors.text : colors.textMuted,
                    fontFamily: fonts.sansSemiBold,
                  },
                ]}
                numberOfLines={1}
              >
                {file ? file.name : 'Choose Word document (.docx)…'}
              </Text>
            </Pressable>

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
              onPress={submit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitBtn,
                {
                  backgroundColor: colors.accent,
                  opacity: submitting ? 0.6 : pressed ? 0.85 : 1,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text
                  style={[styles.submitBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}
                >
                  Save retainer
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  accentWrap: { paddingVertical: spacing.md },
  accentBar: { width: 36, height: 3, borderRadius: 2 },
  uploadCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  uploadCtaLabel: { fontSize: 15, letterSpacing: 0.3 },
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
  emptyBox: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: { fontSize: 15, marginTop: spacing.sm },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  retainerCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  retainerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  retainerService: { fontSize: 16 },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, letterSpacing: 0.3 },
  retainerFee: { fontSize: 20, marginTop: spacing.xs },
  retainerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
  },
  retainerMetaText: { fontSize: 13, flexShrink: 1 },
  retainerDate: { fontSize: 12, marginTop: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  modalTitle: { fontSize: 20 },
  modalContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  fieldLabel: { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 2,
  },
  chipText: { fontSize: 14 },
  chipMeta: { fontSize: 11 },
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
  fileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  fileLabel: { fontSize: 14, flexShrink: 1 },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingVertical: spacing.xs,
  },
  activeLabel: { fontSize: 15 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  submitBtnLabel: { fontSize: 15, letterSpacing: 0.3 },
});
