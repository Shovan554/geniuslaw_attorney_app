import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../components/AppHeader';
import { ProntoActivityItem } from '../../../components/ProntoActivityItem';
import { SearchBar } from '../../../components/SearchBar';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { listMyProntoRequests, type AttorneyRequestItem } from '../../../lib/pronto';

type RangePreset = 'all' | 'month' | 'd30' | 'd90';

const RANGE_PILLS: { key: RangePreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'month', label: 'This month' },
  { key: 'd30', label: 'Last 30d' },
  { key: 'd90', label: 'Last 90d' },
];

function startOfMonth(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1, 0, 0, 0, 0);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const d = new Date(hasTz ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function ProntoActivityListScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [items, setItems] = useState<AttorneyRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<RangePreset>('all');

  const load = useCallback(async () => {
    const res = await listMyProntoRequests();
    if (res.ok) {
      setItems(res.data.filter((r) => r.status === 'completed'));
      setError(null);
    } else {
      setError(res.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const rangeFrom = useMemo<Date | null>(() => {
    switch (preset) {
      case 'month':
        return startOfMonth();
      case 'd30':
        return daysAgo(30);
      case 'd90':
        return daysAgo(90);
      default:
        return null;
    }
  }, [preset]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (rangeFrom) {
        const done = parseDate(r.completed_at);
        if (!done || done < rangeFrom) return false;
      }
      if (q) {
        const hay = `${r.client_name} ${r.practice_area_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, rangeFrom]);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        eyebrow="Pronto"
        title="Recent Activity"
        onBack={() => router.back()}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
        ) : error ? (
          <Pressable
            onPress={onRefresh}
            style={[styles.errorCard, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
          >
            <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
            <Text style={{ color: colors.danger, fontFamily: fonts.sansMedium, flex: 1 }}>{error}</Text>
            <Text style={{ color: colors.accent, fontFamily: fonts.sansSemiBold }}>Retry</Text>
          </Pressable>
        ) : (
          <>
            <View style={{ marginTop: spacing.sm }}>
              <SearchBar value={search} onChangeText={setSearch} placeholder="Search by client" />
            </View>

            <View style={styles.pillRow}>
              {RANGE_PILLS.map((p) => {
                const active = preset === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPreset(p.key)}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: active ? colors.accentTint : colors.card,
                        borderColor: active ? colors.accentBorder : colors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? colors.accent : colors.textMuted,
                        fontFamily: fonts.sansSemiBold,
                        fontSize: 13,
                      }}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.list}>
              {filtered.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <Text style={[styles.emptyText, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                    {items.length === 0
                      ? 'No completed consultations yet.'
                      : 'No matching activity. Try a different search or date range.'}
                  </Text>
                </View>
              ) : (
                filtered.map((req) => (
                  <ProntoActivityItem
                    key={req.id}
                    item={req}
                    onPress={() =>
                      router.push({
                        pathname: '/(auth)/pronto-activity/[id]',
                        params: { id: String(req.id) },
                      })
                    }
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.sm },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  list: { gap: spacing.sm, marginTop: spacing.md },
  emptyCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  emptyText: { fontSize: 13, lineHeight: 19 },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
});
