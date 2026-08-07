import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInLeft,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { RetainerSummary, getRetainerById } from '../../../lib/retainers';
import {
  formatAmount,
  formatPaymentTerms,
  formatRetainerDate,
  formatSlug,
  retainerStatusMeta,
} from '../../../lib/retainerStatus';
import { screenEdges } from '../../../lib/safeAreaEdges';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export default function RetainerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const retainerId = typeof id === 'string' ? id : '';
  const { colors } = useTheme();

  const [retainer, setRetainer] = useState<RetainerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!retainerId) {
        setLoading(false);
        return;
      }
      if (!isRefresh) setLoading(true);
      setError(null);
      const result = await getRetainerById(retainerId);
      if (result.ok) {
        setRetainer(result.data);
      } else {
        setError(result.message);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [retainerId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const paymentTerms = useMemo(
    () => formatPaymentTerms(retainer?.payment_terms),
    [retainer?.payment_terms],
  );

  if (!retainerId) {
    return (
      <SafeAreaView
        edges={screenEdges}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <BackBar />
        <View style={styles.centered}>
          <Text
            style={[styles.muted, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
          >
            Retainer not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const meta = retainer ? retainerStatusMeta(retainer.envelope_status, colors) : null;

  return (
    <SafeAreaView
      edges={screenEdges}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <BackBar />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {loading && !retainer ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : !retainer || !meta ? (
          <View style={styles.centered}>
            <Text
              style={[styles.muted, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}
            >
              {error ?? 'Retainer not found.'}
            </Text>
          </View>
        ) : (
          <>
            <Animated.View
              entering={FadeInDown.duration(500).easing(Easing.out(Easing.cubic))}
              style={styles.hero}
            >
              <View
                style={[
                  styles.heroIcon,
                  { backgroundColor: meta.bg, borderColor: colors.cardBorder },
                ]}
              >
                <Ionicons name={meta.icon} size={26} color={meta.fg} />
              </View>

              <Text
                style={[styles.heroName, { color: colors.text, fontFamily: fonts.sansBold }]}
                numberOfLines={2}
              >
                {retainer.name}
              </Text>

              <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                <Text
                  style={[
                    styles.statusText,
                    { color: meta.fg, fontFamily: fonts.sansSemiBold },
                  ]}
                >
                  {meta.label}
                </Text>
              </View>

              <Text
                style={[
                  styles.heroSub,
                  { color: colors.textMuted, fontFamily: fonts.sansMedium },
                ]}
              >
                {formatSlug(retainer.matter_type)
                  ? `${formatSlug(retainer.matter_type)} · Sent ${formatRetainerDate(retainer.created_at)}`
                  : `Sent ${formatRetainerDate(retainer.created_at)}`}
              </Text>

              <View style={[styles.accentBar, { backgroundColor: colors.accent }]} />
            </Animated.View>

            <Animated.View
              entering={FadeInLeft.delay(80).duration(500).easing(Easing.out(Easing.cubic))}
              style={[
                styles.amountCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                  shadowColor: colors.cardShadow,
                },
              ]}
            >
              <Text
                style={[
                  styles.amountLabel,
                  { color: colors.textMuted, fontFamily: fonts.sansMedium },
                ]}
              >
                Amount
              </Text>
              <Text
                style={[
                  styles.amountValue,
                  {
                    color: retainer.flat_fee != null ? colors.gold : colors.textMuted,
                    fontFamily: fonts.sansBold,
                  },
                ]}
              >
                {formatAmount(retainer.flat_fee)}
              </Text>
            </Animated.View>

            <Animated.View
              entering={FadeInLeft.delay(140).duration(500).easing(Easing.out(Easing.cubic))}
              style={[
                styles.detailCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.cardBorder,
                  shadowColor: colors.cardShadow,
                },
              ]}
            >
              <PaymentTermsRow lines={paymentTerms} />
              <Divider />
              <DetailRow
                icon="briefcase-outline"
                label="Representation"
                value={formatSlug(retainer.rep_type)}
              />
              <Divider />
              <DetailRow icon="location-outline" label="State" value={retainer.state} />
              <Divider />
              <DetailRow
                icon="business-outline"
                label="Law Firm"
                value={retainer.firm_name}
              />
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BackBar() {
  const { colors } = useTheme();
  return (
    <View style={styles.backBar}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={[styles.backText, { color: colors.text, fontFamily: fonts.sansMedium }]}>
          Back
        </Text>
      </Pressable>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: IoniconsName;
  label: string;
  value: string | null;
}) {
  const { colors } = useTheme();
  const display = value && value.trim().length > 0 ? value : null;

  return (
    <View style={styles.detailRow}>
      <View
        style={[
          styles.detailIcon,
          { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
        ]}
      >
        <Ionicons name={icon} size={15} color={colors.accent} />
      </View>
      <View style={styles.detailText}>
        <Text
          style={[
            styles.detailLabel,
            { color: colors.textMuted, fontFamily: fonts.sansMedium },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.detailValue,
            {
              color: display ? colors.text : colors.textMuted,
              fontFamily: fonts.sansSemiBold,
            },
          ]}
        >
          {display ?? '—'}
        </Text>
      </View>
    </View>
  );
}

/**
 * Payment terms get their own row shape because the column is a jsonb that can
 * expand to several labelled lines, not the single value the other rows show.
 */
function PaymentTermsRow({
  lines,
}: {
  lines: { label: string | null; value: string }[];
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.detailRow}>
      <View
        style={[
          styles.detailIcon,
          { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
        ]}
      >
        <Ionicons name="card-outline" size={15} color={colors.accent} />
      </View>
      <View style={styles.detailText}>
        <Text
          style={[
            styles.detailLabel,
            { color: colors.textMuted, fontFamily: fonts.sansMedium },
          ]}
        >
          Payment Terms
        </Text>
        {lines.length === 0 ? (
          <Text
            style={[
              styles.detailValue,
              { color: colors.textMuted, fontFamily: fonts.sansSemiBold },
            ]}
          >
            —
          </Text>
        ) : (
          <View style={styles.termList}>
            {lines.map((line, idx) => (
              <View key={`${line.label ?? ''}-${line.value}-${idx}`} style={styles.termRow}>
                {line.label ? (
                  <Text
                    style={[
                      styles.termLabel,
                      { color: colors.textMuted, fontFamily: fonts.sansMedium },
                    ]}
                    numberOfLines={2}
                  >
                    {line.label}
                  </Text>
                ) : null}
                <Text
                  style={[
                    line.label ? styles.termValue : styles.detailValue,
                    { color: colors.text, fontFamily: fonts.sansSemiBold },
                  ]}
                >
                  {line.value}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  backBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 12,
    gap: 2,
  },
  backText: { fontSize: 15 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  muted: { fontSize: 14 },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heroName: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heroSub: {
    fontSize: 13,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  accentBar: {
    width: 48,
    height: 3,
    borderRadius: 2,
    marginTop: spacing.xs,
  },
  amountCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: 2,
    marginBottom: spacing.md,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },
  amountLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  amountValue: {
    fontSize: 30,
    lineHeight: 38,
  },
  detailCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailText: { flex: 1, gap: 3 },
  detailLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 15,
    lineHeight: 20,
  },
  termList: {
    gap: 6,
    marginTop: 2,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  termLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  termValue: {
    fontSize: 14,
    lineHeight: 19,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
