import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { DocumentViewerModal } from '../../../components/DocumentViewerModal';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  getProntoRequestDetail,
  getProntoRetainerDocUrl,
  type ProntoRequestDetail,
} from '../../../lib/pronto';

function formatMoney(cents: number, currency = 'USD'): string {
  const sym = currency.toUpperCase() === 'USD' ? '$' : `${currency} `;
  return `${sym}${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const d = new Date(hasTz ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Local-timezone clock time, e.g. "10:14 AM".
function formatTime(iso: string | null): string {
  if (!iso) return '';
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const d = new Date(hasTz ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function ProntoActivityDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const requestId = Number(id);

  const [detail, setDetail] = useState<ProntoRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingDoc, setOpeningDoc] = useState(false);
  const [docUrl, setDocUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getProntoRequestDetail(requestId);
    if (res.ok) setDetail(res.data);
    else setError(res.message);
    setLoading(false);
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  const openRetainer = useCallback(async () => {
    if (!detail || openingDoc) return;
    if (!detail.has_retainer_doc) return;
    setOpeningDoc(true);
    const res = await getProntoRetainerDocUrl(detail.id);
    setOpeningDoc(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setDocUrl(res.data.url);
  }, [detail, openingDoc]);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        eyebrow="Recent activity"
        title={detail?.practice_area_name || 'Consultation'}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : error && !detail ? (
          <View style={[styles.errorBox, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger, fontFamily: fonts.sansMedium }]}>
              {error}
            </Text>
            <Pressable onPress={load} hitSlop={10}>
              <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>Retry</Text>
            </Pressable>
          </View>
        ) : detail ? (
          <>
            {/* Client */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
                Client
              </Text>
              <Text style={[styles.clientName, { color: colors.text, fontFamily: fonts.heading }]}>
                {detail.client_name}
              </Text>
              {detail.client_email ? (
                <Pressable
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(`mailto:${detail.client_email}`)}
                >
                  <Ionicons name="mail-outline" size={15} color={colors.textMuted} />
                  <Text style={[styles.contactText, { color: colors.accent, fontFamily: fonts.sansMedium }]}>
                    {detail.client_email}
                  </Text>
                </Pressable>
              ) : null}
              {detail.client_phone ? (
                <Pressable
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(`tel:${detail.client_phone}`)}
                >
                  <Ionicons name="call-outline" size={15} color={colors.textMuted} />
                  <Text style={[styles.contactText, { color: colors.accent, fontFamily: fonts.sansMedium }]}>
                    {detail.client_phone}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {/* Payment — only retainer-gated calls collect a fee */}
            {detail.pre_retainer_required ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.cardLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
                Payment
              </Text>
              {detail.payment ? (
                <>
                  <View style={styles.payRow}>
                    <Text style={[styles.payAmount, { color: colors.text, fontFamily: fonts.heading }]}>
                      {formatMoney(detail.payment.net_cents, detail.fee_currency)}
                    </Text>
                    <View
                      style={[
                        styles.statusPill,
                        detail.payment.status === 'refunded'
                          ? { backgroundColor: 'rgba(224,82,82,0.12)', borderColor: 'rgba(224,82,82,0.35)' }
                          : { backgroundColor: 'rgba(76,175,125,0.12)', borderColor: 'rgba(76,175,125,0.35)' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          {
                            color: detail.payment.status === 'refunded' ? colors.danger : colors.success,
                            fontFamily: fonts.sansBold,
                          },
                        ]}
                      >
                        {detail.payment.status === 'refunded' ? 'Refunded' : 'Completed'}
                      </Text>
                    </View>
                  </View>
                  {detail.payment.refund_cents > 0 ? (
                    <Text style={[styles.subtle, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                      {formatMoney(detail.payment.amount_cents, detail.fee_currency)} charged ·{' '}
                      {formatMoney(detail.payment.refund_cents, detail.fee_currency)} refunded
                    </Text>
                  ) : null}
                  {detail.payment.paid_at ? (
                    <Text style={[styles.subtle, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                      {formatDate(detail.payment.paid_at)}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={[styles.subtle, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  Payment processing.
                </Text>
              )}
            </View>
            ) : null}

            {/* Timeline */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.timelineHeader}>
                <Text style={[styles.cardLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
                  Timeline
                </Text>
                <Text style={[styles.timelineDate, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                  {formatDate(detail.completed_at ?? detail.accepted_at ?? detail.in_call_at)}
                </Text>
              </View>
              {[
                { label: 'Accepted', iso: detail.accepted_at },
                { label: 'In call', iso: detail.in_call_at },
                { label: 'Completed', iso: detail.completed_at },
              ]
                .filter((t) => !!t.iso)
                .map((t) => (
                  <View key={t.label} style={styles.timelineRow}>
                    <Text style={[styles.timelineLabel, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                      {t.label}
                    </Text>
                    <Text style={[styles.timelineValue, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                      {formatTime(t.iso)}
                    </Text>
                  </View>
                ))}
            </View>

            {/* Retainer — only retainer-gated calls produce a signed doc */}
            {detail.pre_retainer_required ? (
            <>
            <Pressable
              onPress={openRetainer}
              disabled={!detail.has_retainer_doc || openingDoc}
              style={({ pressed }) => [
                styles.retainerBtn,
                {
                  backgroundColor: colors.accent,
                  opacity: !detail.has_retainer_doc ? 0.5 : openingDoc ? 0.7 : pressed ? 0.85 : 1,
                },
              ]}
            >
              {openingDoc ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={16} color={colors.background} />
                  <Text style={[styles.retainerBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                    View signed retainer
                  </Text>
                </>
              )}
            </Pressable>
            {!detail.has_retainer_doc ? (
              <Text style={[styles.subtle, { color: colors.textMuted, fontFamily: fonts.sans, textAlign: 'center' }]}>
                The signed retainer is still being prepared.
              </Text>
            ) : null}
            </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <DocumentViewerModal
        visible={docUrl !== null}
        url={docUrl}
        title={detail ? `Retainer — ${detail.practice_area_name}` : 'Retainer'}
        onClose={() => setDocUrl(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  clientName: { fontSize: 22 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  contactText: { fontSize: 14 },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payAmount: { fontSize: 24 },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 12, letterSpacing: 0.3 },
  subtle: { fontSize: 13, lineHeight: 18 },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timelineDate: { fontSize: 13 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timelineLabel: { fontSize: 13 },
  timelineValue: { fontSize: 13 },
  retainerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  retainerBtnLabel: { fontSize: 15, letterSpacing: 0.4 },
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
});
