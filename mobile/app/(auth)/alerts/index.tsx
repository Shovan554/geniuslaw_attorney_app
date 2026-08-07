import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../../components/AppHeader';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useAlerts } from '../../../contexts/AlertsContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { resolveCtaRoutes } from '../../../lib/alertRouting';
import {
  ALERT_ACCENT,
  ctaForLink,
  formatRelativeTime,
  iconForGenre,
} from '../../../lib/alerts';
import { screenEdges } from '../../../lib/safeAreaEdges';

const MAX_SHOWN = 30;

export default function AlertsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { items, loading, error, markRead, refresh } = useAlerts();
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  // Unread-only: the inbox doubles as an action queue, so reading clears it.
  const unread = useMemo(
    () => items.filter((n) => !n.is_read).slice(0, MAX_SHOWN),
    [items],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Looked up against the full list, not `unread` — opening marks the alert
  // read, which drops it out of `unread` while the modal is still showing it.
  const active = useMemo(
    () => (openId == null ? null : items.find((n) => n.id === openId) ?? null),
    [items, openId],
  );
  const cta = active
    ? ctaForLink(active.link_type, active.link_id, active.link_uuid)
    : null;

  const open = (id: number, isRead: boolean) => {
    if (!isRead) void markRead(id);
    setOpenId(id);
  };

  // An order CTA has to resolve its case over the network before it can push,
  // so the button shows a spinner instead of feeling like a dead tap.
  const [resolving, setResolving] = useState(false);

  const openLink = async () => {
    if (!cta || resolving) return;
    setResolving(true);
    try {
      const routes = await resolveCtaRoutes(cta, active?.genre ?? null);
      setOpenId(null);
      // More than one route means the destination sits inside another screen
      // (CaseCheck inside its order) — push the stack so back steps through it.
      for (const route of routes) router.push(route as never);
    } finally {
      setResolving(false);
    }
  };

  return (
    <SafeAreaView
      edges={screenEdges}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <AppHeader
        title="Alerts"
        onBack={() => router.back()}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold}
          />
        }
      >
        {loading && unread.length === 0 && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.gold} />
          </View>
        )}

        {!loading && error && unread.length === 0 && (
          <Text style={[styles.error, { color: colors.danger, fontFamily: fonts.sans }]}>
            {error}
          </Text>
        )}

        {!loading && !error && unread.length === 0 && (
          <View style={styles.center}>
            <Ionicons name="notifications-off-outline" size={36} color={colors.textSubtle} />
            <Text style={[styles.empty, { color: colors.textMuted, fontFamily: fonts.sans }]}>
              No alerts at this time.
            </Text>
          </View>
        )}

        {unread.map((n) => (
          <TouchableOpacity
            key={n.id}
            activeOpacity={0.8}
            onPress={() => open(n.id, n.is_read)}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardLeft}>
                <Ionicons name={iconForGenre(n.genre)} size={18} color={ALERT_ACCENT} />
                <Text
                  style={[
                    styles.cardTitle,
                    { color: colors.text, fontFamily: fonts.sansSemiBold },
                  ]}
                  numberOfLines={2}
                >
                  {n.short_description}
                </Text>
              </View>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  void markRead(n.id);
                }}
                hitSlop={6}
                activeOpacity={0.7}
                style={[styles.markReadBtn, { backgroundColor: ALERT_ACCENT }]}
              >
                <Text
                  style={[styles.markReadText, { color: '#FFFFFF', fontFamily: fonts.sansBold }]}
                  numberOfLines={1}
                >
                  Read
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cardFooter}>
              <Text
                style={[
                  styles.cardTime,
                  { color: colors.textSubtle, fontFamily: fonts.sansMedium },
                ]}
              >
                {formatRelativeTime(n.created_at)}
              </Text>
              <View style={styles.cardLinkRow}>
                <Text
                  style={[styles.cardLink, { color: colors.gold, fontFamily: fonts.sansMedium }]}
                >
                  View details
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.gold} />
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal
        visible={active != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpenId(null)}
      >
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setOpenId(null)}>
          {/* Swallow taps inside the sheet so they don't dismiss it. */}
          <Pressable
            onPress={() => {}}
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.sheetHeader}>
              <View style={[styles.iconWrap, { backgroundColor: colors.accentTint }]}>
                <Ionicons
                  name={iconForGenre(active?.genre ?? '')}
                  size={20}
                  color={colors.accent}
                />
              </View>
              <Text
                style={[styles.sheetTitle, { color: colors.text, fontFamily: fonts.sansBold }]}
              >
                {active?.short_description}
              </Text>
              <TouchableOpacity
                onPress={() => setOpenId(null)}
                hitSlop={10}
                activeOpacity={0.7}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.sheetBody, { color: colors.text, fontFamily: fonts.sans }]}>
              {active?.long_description}
            </Text>

            <Text
              style={[styles.sheetTime, { color: colors.textSubtle, fontFamily: fonts.sansMedium }]}
            >
              {active ? formatRelativeTime(active.created_at) : ''}
            </Text>

            {/* No CTA for an unknown link_type — better nothing than a dead button. */}
            {cta && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => void openLink()}
                disabled={resolving}
                style={[
                  styles.cta,
                  { backgroundColor: ALERT_ACCENT },
                  resolving && styles.ctaBusy,
                ]}
              >
                <Text style={[styles.ctaText, { color: '#FFFFFF', fontFamily: fonts.sansBold }]}>
                  {cta.label}
                </Text>
                {resolving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl * 2,
    gap: spacing.md,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  empty: { fontSize: 14, textAlign: 'center' },
  error: { fontSize: 14, paddingVertical: spacing.md },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { fontSize: 16, flex: 1 },
  markReadBtn: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  markReadText: { fontSize: 11 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTime: { fontSize: 12 },
  cardLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardLink: { fontSize: 13 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { fontSize: 18, lineHeight: 25, letterSpacing: -0.3, flex: 1, paddingTop: 4 },
  sheetBody: { fontSize: 15, lineHeight: 23 },
  sheetTime: { fontSize: 12 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  ctaBusy: { opacity: 0.75 },
  ctaText: { fontSize: 16 },
});
