import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { AppColors, fonts, radius, spacing } from '../constants/theme';
import type { OpenRequest } from '../lib/pronto';

export type ProntoRequestModalState =
  | { kind: 'confirm'; req: OpenRequest }
  | { kind: 'accepted'; clientName: string; practiceArea: string; fee: string }
  | { kind: 'unavailable'; message: string }
  | null;

export function formatMoney(cents: number, currency: string): string {
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

export function ProntoActionSheet({
  modal,
  colors,
  onDismiss,
  onConfirmAccept,
}: {
  modal: ProntoRequestModalState;
  colors: AppColors;
  onDismiss: () => void;
  onConfirmAccept: (req: OpenRequest) => void;
}) {
  if (!modal) return null;

  const dangerTint = 'rgba(224,82,82,0.12)';
  const dangerBorder = 'rgba(224,82,82,0.35)';
  const successTint = 'rgba(76,175,125,0.12)';
  const successBorder = 'rgba(76,175,125,0.35)';

  const iconName =
    modal.kind === 'confirm'
      ? ('document-text-outline' as const)
      : modal.kind === 'accepted'
        ? ('checkmark-circle' as const)
        : ('alert-circle-outline' as const);
  const badgeBg =
    modal.kind === 'confirm'
      ? colors.accentTint
      : modal.kind === 'accepted'
        ? successTint
        : dangerTint;
  const badgeBorder =
    modal.kind === 'confirm'
      ? colors.accentBorder
      : modal.kind === 'accepted'
        ? successBorder
        : dangerBorder;
  const iconColor =
    modal.kind === 'confirm'
      ? colors.accent
      : modal.kind === 'accepted'
        ? colors.success
        : colors.danger;
  const title =
    modal.kind === 'confirm'
      ? 'Accept & sign retainer?'
      : modal.kind === 'accepted'
        ? 'Retainer signed'
        : 'Request unavailable';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
          onPress={onDismiss}
        />
        <Animated.View
          entering={FadeInUp.duration(280)}
          style={[sheetStyles.sheet, { backgroundColor: colors.card, borderTopColor: colors.cardBorder }]}
        >
          <View style={[sheetStyles.handle, { backgroundColor: colors.cardBorder }]} />

          <View style={[sheetStyles.badge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
            <Ionicons name={iconName} size={32} color={iconColor} />
          </View>

          <Text style={[sheetStyles.title, { color: colors.text, fontFamily: fonts.heading }]}>
            {title}
          </Text>

          {modal.kind === 'confirm' ? (
            <>
              <View style={[sheetStyles.infoBox, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                <View style={sheetStyles.infoRow}>
                  <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                  <Text style={[sheetStyles.infoText, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                    {modal.req.client_name}
                  </Text>
                </View>
                <View style={[sheetStyles.infoDivider, { backgroundColor: colors.cardBorder }]} />
                <View style={sheetStyles.infoRow}>
                  <Ionicons name="briefcase-outline" size={14} color={colors.textMuted} />
                  <Text style={[sheetStyles.infoText, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                    {modal.req.practice_area_name}
                  </Text>
                  <Text style={[sheetStyles.infoFee, { color: colors.accent, fontFamily: fonts.sansBold }]}>
                    {formatMoney(modal.req.fee_amount_cents, modal.req.fee_currency)}
                  </Text>
                </View>
              </View>
              <Text style={[sheetStyles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                First to accept wins — the client will be charged once you sign.
              </Text>
              <View style={sheetStyles.btnRow}>
                <Pressable
                  onPress={onDismiss}
                  style={({ pressed }) => [
                    sheetStyles.btnOutlined,
                    { borderColor: colors.cardBorder, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[sheetStyles.btnOutlinedLabel, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onConfirmAccept(modal.req)}
                  style={({ pressed }) => [
                    sheetStyles.btnFilled,
                    { backgroundColor: colors.accent, flex: 1, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Ionicons name="pencil-outline" size={16} color={colors.background} />
                  <Text style={[sheetStyles.btnFilledLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                    Accept & Sign
                  </Text>
                </Pressable>
              </View>
            </>
          ) : modal.kind === 'accepted' ? (
            <>
              <View style={[sheetStyles.infoBox, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                <View style={sheetStyles.infoRow}>
                  <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                  <Text style={[sheetStyles.infoText, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                    {modal.clientName}
                  </Text>
                </View>
                <View style={[sheetStyles.infoDivider, { backgroundColor: colors.cardBorder }]} />
                <View style={sheetStyles.infoRow}>
                  <Ionicons name="briefcase-outline" size={14} color={colors.textMuted} />
                  <Text style={[sheetStyles.infoText, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                    {modal.practiceArea}
                  </Text>
                </View>
                <View style={[sheetStyles.infoDivider, { backgroundColor: colors.cardBorder }]} />
                <View style={sheetStyles.infoRow}>
                  <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
                  <Text style={[sheetStyles.infoText, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                    Earned
                  </Text>
                  <Text style={[sheetStyles.infoFee, { color: colors.accent, fontFamily: fonts.sansBold }]}>
                    {modal.fee}
                  </Text>
                </View>
              </View>
              <View style={[sheetStyles.noticeBox, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
                <Ionicons name="notifications-outline" size={15} color={colors.accent} />
                <Text style={[sheetStyles.noticeText, { color: colors.text, fontFamily: fonts.sans }]}>
                  Keep the app open — they&apos;ll call you once payment clears.
                </Text>
              </View>
              <Pressable
                onPress={onDismiss}
                style={({ pressed }) => [
                  sheetStyles.btnFilled,
                  { backgroundColor: colors.success, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name="checkmark" size={18} color={colors.background} />
                <Text style={[sheetStyles.btnFilledLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                  Got it
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[sheetStyles.body, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {modal.message}
              </Text>
              <Pressable
                onPress={onDismiss}
                style={({ pressed }) => [
                  sheetStyles.btnOutlined,
                  { borderColor: colors.cardBorder, alignSelf: 'stretch', opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={[sheetStyles.btnOutlinedLabel, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                  OK
                </Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

export function ProntoOpenRequestCard({
  req,
  accepting,
  disabled,
  colors,
  onAccept,
}: {
  req: OpenRequest;
  accepting: boolean;
  disabled: boolean;
  colors: AppColors;
  onAccept: (req: OpenRequest) => void;
}) {
  return (
    <View
      key={req.id}
      style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.accentBorder }]}
    >
      <View style={cardStyles.reqHeader}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={[cardStyles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
            {req.practice_area_name}
          </Text>
          <View style={cardStyles.reqClientRow}>
            <Ionicons name="person-outline" size={12} color={colors.textMuted} />
            <Text style={[cardStyles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
              {req.client_name}
              {req.attempt_count > 0 ? ' · re-listed' : ''}
            </Text>
          </View>
          {req.client_state ? (
            <View style={cardStyles.reqClientRow}>
              <Ionicons name="location-outline" size={12} color={colors.textMuted} />
              <Text style={[cardStyles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {req.client_state}
              </Text>
            </View>
          ) : null}
          {req.client_email ? (
            <View style={cardStyles.reqClientRow}>
              <Ionicons name="mail-outline" size={12} color={colors.textMuted} />
              <Text
                style={[cardStyles.hint, { color: colors.textMuted, fontFamily: fonts.sans, flex: 1 }]}
                numberOfLines={1}
              >
                {req.client_email}
              </Text>
            </View>
          ) : null}
          {req.client_phone ? (
            <View style={cardStyles.reqClientRow}>
              <Ionicons name="call-outline" size={12} color={colors.textMuted} />
              <Text style={[cardStyles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {req.client_phone}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={[cardStyles.feePill, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
          <Text style={[cardStyles.feePillText, { color: colors.accent, fontFamily: fonts.sansBold }]}>
            {formatMoney(req.fee_amount_cents, req.fee_currency)}
          </Text>
        </View>
      </View>
      <View style={cardStyles.urgencyRow}>
        <Ionicons name="flash-outline" size={12} color={colors.textMuted} />
        <Text style={[cardStyles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
          First to accept wins
        </Text>
      </View>
      <Pressable
        onPress={() => onAccept(req)}
        disabled={disabled}
        style={({ pressed }) => [
          cardStyles.primaryBtn,
          {
            backgroundColor: colors.accent,
            opacity:
              disabled && !accepting ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        {accepting ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <>
            <Ionicons name="pencil-outline" size={15} color={colors.background} />
            <Text style={[cardStyles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
              Accept &amp; Sign
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: 16, flex: 1 },
  hint: { fontSize: 13, lineHeight: 18 },
  reqHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reqClientRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  urgencyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feePill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  feePillText: { fontSize: 16 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  primaryBtnLabel: { fontSize: 15, letterSpacing: 0.4 },
});

const sheetStyles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 44,
    gap: spacing.md,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    marginBottom: spacing.xs,
  },
  badge: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 21, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: spacing.sm },
  hint: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: spacing.sm },
  infoBox: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  infoDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.md },
  infoText: { flex: 1, fontSize: 14 },
  infoFee: { fontSize: 17 },
  noticeBox: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  btnRow: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  btnFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: radius.md,
    alignSelf: 'stretch',
  },
  btnFilledLabel: { fontSize: 15, letterSpacing: 0.4 },
  btnOutlined: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  btnOutlinedLabel: { fontSize: 15, letterSpacing: 0.3 },
});
