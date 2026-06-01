import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignatureScreen, {
  type SignatureViewRef,
} from 'react-native-signature-canvas';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { DocumentViewerModal } from '../../../components/DocumentViewerModal';
import {
  cancelAttorneySigning,
  countersignSigning,
  getSigning,
  type AttorneyCancelReason,
  type PendingSigning,
} from '../../../lib/pronto';

const CANCEL_OPTIONS: Array<{ key: AttorneyCancelReason; label: string; description: string }> = [
  {
    key: 'payment_not_received',
    label: 'Client never paid',
    description: 'You counter-signed but payment never arrived.',
  },
  {
    key: 'client_unreachable',
    label: 'Client is unreachable',
    description: 'You cannot get in touch with the client.',
  },
  {
    key: 'conflict',
    label: 'Conflict of interest',
    description: 'You discovered a conflict and cannot continue.',
  },
  {
    key: 'other',
    label: 'Other',
    description: 'Add a short note below so the audit log is accurate.',
  },
];

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
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

const PAD_STYLE = `
.m-signature-pad { box-shadow: none; border: none; }
.m-signature-pad--body { border: none; }
.m-signature-pad--footer { display: none; }
body, html { background: #fff; width: 100%; height: 100%; margin: 0; padding: 0; }
.m-signature-pad { width: 100%; height: 100%; }
`;

export default function CountersignScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const signingId = useMemo(() => Number(id), [id]);

  const [signing, setSigning] = useState<PendingSigning | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const signatureRef = useRef<SignatureViewRef>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<AttorneyCancelReason | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelDoneOpen, setCancelDoneOpen] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(signingId)) {
      setError('Invalid id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await getSigning(signingId);
    if (!res.ok) setError(res.message);
    else setSigning(res.data);
    setLoading(false);
  }, [signingId]);

  useEffect(() => {
    load();
  }, [load]);

  const openClientSigned = useCallback(() => {
    if (!signing) return;
    setViewerOpen(true);
  }, [signing]);

  const ready = hasStrokes && !submitting;

  const requestSign = useCallback(() => {
    if (!ready) return;
    signatureRef.current?.readSignature();
  }, [ready]);

  const onSignatureRead = useCallback(
    async (dataUrl: string) => {
      if (!signing) return;
      const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '').trim();
      if (!b64) {
        Alert.alert('Please sign', 'Draw your signature in the box before continuing.');
        return;
      }
      setSubmitting(true);
      const res = await countersignSigning(signing.id, b64);
      setSubmitting(false);
      if (!res.ok) {
        Alert.alert('Could not save', res.message);
        return;
      }
      router.back();
    },
    [signing, router],
  );

  const submitCancel = useCallback(async () => {
    if (!signing) return;
    if (!cancelReason) {
      Alert.alert('Pick a reason', 'Choose a reason so we know why.');
      return;
    }
    if (cancelReason === 'other' && !cancelNote.trim()) {
      Alert.alert('Add a note', 'Tell us a little about why you are cancelling.');
      return;
    }
    setCancelling(true);
    const res = await cancelAttorneySigning(signing.id, cancelReason, cancelNote);
    setCancelling(false);
    if (!res.ok) {
      Alert.alert('Could not cancel', res.message);
      return;
    }
    setCancelOpen(false);
    setCancelDoneOpen(true);
  }, [signing, cancelReason, cancelNote]);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text style={[styles.backLabel, { color: colors.text, fontFamily: fonts.sansBold }]}>
            Pending signatures
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : error || !signing ? (
          <View style={[styles.errorBox, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger, fontFamily: fonts.sansMedium }]}>
              {error ?? 'Signing not found'}
            </Text>
            <Pressable onPress={load} hitSlop={10}>
              <Text style={[styles.linkPrimary, { color: colors.accent }]}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.eyebrow, { color: colors.textMuted, fontFamily: fonts.sansSemiBold }]}>
              {signing.practice_area_name}
            </Text>
            <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
              Counter-sign
            </Text>

            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.textMuted, fontFamily: fonts.sansSemiBold }]}>
                  Client
                </Text>
                <Text style={[styles.value, { color: colors.text, fontFamily: fonts.sans }]}>
                  {signing.client_name ?? '—'}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.textMuted, fontFamily: fonts.sansSemiBold }]}>
                  Practice area
                </Text>
                <Text style={[styles.value, { color: colors.text, fontFamily: fonts.sans }]}>
                  {signing.practice_area_name}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.textMuted, fontFamily: fonts.sansSemiBold }]}>
                  Fee
                </Text>
                <Text style={[styles.value, { color: colors.text, fontFamily: fonts.sansBold }]}>
                  {formatMoney(signing.fee_amount_cents, signing.fee_currency)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, { color: colors.textMuted, fontFamily: fonts.sansSemiBold }]}>
                  Client signed
                </Text>
                <Text style={[styles.value, { color: colors.text, fontFamily: fonts.sans }]}>
                  {formatDate(signing.signed_at)}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={openClientSigned}
              style={({ pressed }) => [
                styles.openBtn,
                {
                  borderColor: colors.cardBorder,
                  backgroundColor: colors.background,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.accent} />
              <Text style={[styles.openBtnLabel, { color: colors.accent, fontFamily: fonts.sansBold }]}>
                Open client-signed document
              </Text>
            </Pressable>

            {signing.status === 'attorney_signed' ? (
              <View
                style={[
                  styles.waitCard,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <View style={styles.waitRow}>
                  <Ionicons name="time-outline" size={20} color={colors.gold} />
                  <Text
                    style={[styles.waitTitle, { color: colors.text, fontFamily: fonts.sansBold }]}
                  >
                    Awaiting client payment
                  </Text>
                </View>
                <Text
                  style={[styles.waitBody, { color: colors.textMuted, fontFamily: fonts.sans }]}
                >
                  You've counter-signed. The client now sees the payment step. You can keep this
                  open, or cancel below if payment doesn't come through.
                </Text>
              </View>
            ) : (
              <>
                <Text
                  style={[styles.sectionLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}
                >
                  Your signature
                </Text>
                <View style={[styles.padWrap, { borderColor: colors.cardBorder }]}>
                  <SignatureScreen
                    ref={signatureRef}
                    onOK={onSignatureRead}
                    onBegin={() => setHasStrokes(true)}
                    onClear={() => setHasStrokes(false)}
                    webStyle={PAD_STYLE}
                    backgroundColor="#FFFFFF"
                    penColor="#000000"
                    descriptionText=""
                  />
                </View>
                <View style={styles.padActions}>
                  <Pressable
                    onPress={() => {
                      signatureRef.current?.clearSignature();
                      setHasStrokes(false);
                    }}
                    hitSlop={10}
                  >
                    <Text
                      style={[styles.clearLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}
                    >
                      Clear
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={requestSign}
                  disabled={!ready}
                  style={({ pressed }) => [
                    styles.signBtn,
                    {
                      backgroundColor: colors.accent,
                      opacity: !ready ? 0.4 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <Text style={[styles.signBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                      Counter-sign retainer
                    </Text>
                  )}
                </Pressable>
              </>
            )}

            <Pressable
              onPress={() => setCancelOpen(true)}
              style={({ pressed }) => [
                styles.cancelBtn,
                { borderColor: colors.cardBorder, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.cancelBtnLabel, { color: colors.danger, fontFamily: fonts.sansBold }]}>
                Cancel request
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal
        visible={cancelOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCancelOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !cancelling && setCancelOpen(false)}
          />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text, fontFamily: fonts.heading }]}>
                Cancel request
              </Text>
              <Pressable onPress={() => !cancelling && setCancelOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.modalSubtitle, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                Pick a reason so the audit log stays accurate.
              </Text>
              {CANCEL_OPTIONS.map((opt) => {
                const selected = cancelReason === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setCancelReason(opt.key)}
                    style={({ pressed }) => [
                      styles.reasonRow,
                      {
                        borderColor: selected ? colors.accent : colors.cardBorder,
                        backgroundColor: selected ? colors.accentTint : colors.background,
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        { borderColor: selected ? colors.accent : colors.cardBorder },
                      ]}
                    >
                      {selected ? <View style={[styles.radioInner, { backgroundColor: colors.accent }]} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reasonLabel, { color: colors.text, fontFamily: fonts.sansBold }]}>
                        {opt.label}
                      </Text>
                      <Text style={[styles.reasonDesc, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                        {opt.description}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}

              <Text style={[styles.noteLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
                Optional note {cancelReason === 'other' ? '(required)' : ''}
              </Text>
              <TextInput
                value={cancelNote}
                onChangeText={setCancelNote}
                placeholder="Add details (optional)"
                placeholderTextColor={colors.textSubtle}
                multiline
                style={[
                  styles.noteInput,
                  { borderColor: colors.cardBorder, color: colors.text, fontFamily: fonts.sans },
                ]}
              />

              <Pressable
                onPress={submitCancel}
                disabled={cancelling}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  {
                    backgroundColor: colors.danger,
                    opacity: cancelling ? 0.6 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                {cancelling ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={[styles.confirmBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                    Cancel request
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => !cancelling && setCancelOpen(false)}
                disabled={cancelling}
                style={({ pressed }) => [styles.dismissBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.dismissBtnLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
                  Keep going
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DocumentViewerModal
        visible={viewerOpen}
        url={signing?.client_signed_doc_url ?? null}
        title="Client-signed retainer"
        onClose={() => setViewerOpen(false)}
      />

      <Modal
        visible={cancelDoneOpen}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setCancelDoneOpen(false);
          router.back();
        }}
      >
        <View style={styles.doneRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              setCancelDoneOpen(false);
              router.back();
            }}
          />
          <View
            style={[
              styles.doneCard,
              { backgroundColor: colors.surface, borderColor: colors.cardBorder },
            ]}
          >
            <View
              style={[
                styles.doneIconWrap,
                { backgroundColor: colors.accentTint, borderColor: colors.accent },
              ]}
            >
              <Ionicons name="checkmark" size={26} color={colors.accent} />
            </View>
            <Text style={[styles.doneTitle, { color: colors.text, fontFamily: fonts.heading }]}>
              Request cancelled
            </Text>
            <Text style={[styles.doneBody, { color: colors.textMuted, fontFamily: fonts.sans }]}>
              The client has been notified. Pronto will remove this from their flow.
            </Text>
            <Pressable
              onPress={() => {
                setCancelDoneOpen(false);
                router.back();
              }}
              style={({ pressed }) => [
                styles.doneBtn,
                { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.doneBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                OK
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backLabel: { fontSize: 15 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  eyebrow: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { fontSize: 26, marginTop: 4 },
  summaryCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  value: { fontSize: 14 },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  openBtnLabel: { fontSize: 14, letterSpacing: 0.3 },
  sectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  padWrap: {
    height: 220,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#FFF',
  },
  padActions: { alignItems: 'flex-end' },
  clearLabel: { fontSize: 13 },
  signBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  signBtnLabel: { fontSize: 15, letterSpacing: 0.5 },
  waitCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  waitTitle: { fontSize: 15 },
  waitBody: { fontSize: 13, lineHeight: 18 },
  cancelBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  cancelBtnLabel: { fontSize: 14, letterSpacing: 0.3 },
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
    gap: spacing.sm,
  },
  modalSubtitle: { fontSize: 13, marginBottom: spacing.xs },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioInner: { width: 10, height: 10, borderRadius: radius.full },
  reasonLabel: { fontSize: 14 },
  reasonDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  noteLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
  },
  noteInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  confirmBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  confirmBtnLabel: { fontSize: 14, letterSpacing: 0.3 },
  dismissBtn: { paddingVertical: spacing.sm, alignItems: 'center' },
  dismissBtnLabel: { fontSize: 13 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: 13 },
  linkPrimary: { fontSize: 14, fontFamily: fonts.sansBold },
  doneRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  doneCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  doneIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  doneTitle: { fontSize: 20, textAlign: 'center' },
  doneBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  doneBtn: {
    alignSelf: 'stretch',
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  doneBtnLabel: { fontSize: 14, letterSpacing: 0.3 },
});
