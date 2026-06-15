import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { getAttorneyMe } from '../../../lib/attorney';
import { parseStatesMap, saveStates, US_STATES } from '../../../lib/states';

const STATE_NAME = Object.fromEntries(US_STATES.map((s) => [s.code, s.name]));
const MAX_RESULTS = 6;

export default function StatesScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  // Source of truth: USPS code -> bar number ('' allowed).
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAttorneyMe()
      .then((me) => {
        if (cancelled) return;
        if (me.ok) setEntries(parseStatesMap(me.data.states));
        else setStatus(me.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the whole map. Local state stays authoritative so an in-flight save
  // never clobbers a field the attorney is editing; the server response only
  // confirms success or surfaces an error.
  const persist = useCallback(async (next: Record<string, string>) => {
    setSaving(true);
    setStatus(null);
    const res = await saveStates(next);
    setSaving(false);
    setStatus(res.ok ? 'Saved' : res.message);
  }, []);

  const addState = useCallback(
    (code: string) => {
      setQuery('');
      Keyboard.dismiss();
      setEntries((prev) => {
        if (code in prev) return prev;
        const next = { ...prev, [code]: '' };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const removeState = useCallback(
    (code: string) => {
      setEntries((prev) => {
        const next = { ...prev };
        delete next[code];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setBar = useCallback((code: string, value: string) => {
    setEntries((prev) => ({ ...prev, [code]: value }));
  }, []);

  // Search matches state name or code, excluding ones already added.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return US_STATES.filter(
      (s) =>
        !(s.code in entries) &&
        (s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)),
    ).slice(0, MAX_RESULTS);
  }, [query, entries]);

  // Added states, alphabetical by name.
  const rows = useMemo(
    () =>
      Object.keys(entries)
        .map((code) => ({ code, name: STATE_NAME[code] ?? code }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [entries],
  );

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
          Licensed States
        </Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.intro, { color: colors.textMuted, fontFamily: fonts.sans }]}>
            Add the states where you're licensed and your bar number for each. Clients are matched
            to you based on these.
          </Text>

          {/* Search to add */}
          <View
            style={[styles.search, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
          >
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search a state to add…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              style={[styles.searchInput, { color: colors.text, fontFamily: fonts.sans }]}
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {results.length > 0 ? (
            <Animated.View
              entering={FadeIn.duration(160)}
              style={[styles.results, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
            >
              {results.map((s, idx) => (
                <TouchableOpacity
                  key={s.code}
                  activeOpacity={0.7}
                  onPress={() => addState(s.code)}
                  style={[
                    styles.resultRow,
                    idx > 0
                      ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cardBorder }
                      : null,
                  ]}
                >
                  <Text style={[styles.resultName, { color: colors.text, fontFamily: fonts.sans }]}>
                    {s.name}
                  </Text>
                  <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : query.trim().length > 0 ? (
            <Text style={[styles.noResults, { color: colors.textMuted, fontFamily: fonts.sans }]}>
              No matching states.
            </Text>
          ) : null}

          {/* Added states */}
          <View style={styles.listHeaderRow}>
            <Text style={[styles.listHeader, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
              Your states {rows.length > 0 ? `(${rows.length})` : ''}
            </Text>
            {saving ? (
              <Text style={[styles.statusInline, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                Saving…
              </Text>
            ) : status ? (
              <Text
                style={[
                  styles.statusInline,
                  { color: status === 'Saved' ? colors.success : colors.danger, fontFamily: fonts.sans },
                ]}
              >
                {status}
              </Text>
            ) : null}
          </View>

          {rows.length === 0 ? (
            <View style={[styles.empty, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
              <Text style={[styles.emptyText, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                Search above to add the states you're licensed in.
              </Text>
            </View>
          ) : (
            <Animated.View
              entering={FadeInDown.duration(240)}
              style={[styles.list, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
            >
              {rows.map((row, idx) => (
                <ReanimatedSwipeable
                  key={row.code}
                  friction={2}
                  rightThreshold={40}
                  overshootRight={false}
                  renderRightActions={() => (
                    <TouchableOpacity
                      onPress={() => removeState(row.code)}
                      activeOpacity={0.85}
                      style={[styles.deleteAction, { backgroundColor: colors.danger }]}
                    >
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                      <Text style={[styles.deleteLabel, { fontFamily: fonts.sansSemiBold }]}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                  )}
                >
                  <View
                    style={[
                      styles.listRow,
                      { backgroundColor: colors.card },
                      idx > 0
                        ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cardBorder }
                        : null,
                    ]}
                  >
                    <View style={styles.listRowMain}>
                      <Text style={[styles.stateName, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                        {row.name}
                      </Text>
                      <TextInput
                        value={entries[row.code] ?? ''}
                        onChangeText={(t) => setBar(row.code, t)}
                        onEndEditing={() => persist(entries)}
                        placeholder="Bar number"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={40}
                        returnKeyType="done"
                        style={[styles.barInput, { color: colors.text, fontFamily: fonts.sans }]}
                      />
                    </View>
                  </View>
                </ReanimatedSwipeable>
              ))}
            </Animated.View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: spacing.lg },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  results: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  resultName: { fontSize: 15 },
  noResults: { fontSize: 13, marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  listHeader: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  statusInline: { fontSize: 12 },
  empty: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  emptyText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  list: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  listRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  stateName: { fontSize: 15, flexShrink: 1 },
  barInput: {
    fontSize: 14,
    textAlign: 'right',
    minWidth: 110,
    paddingVertical: spacing.sm,
  },
  deleteAction: {
    width: 92,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  deleteLabel: { fontSize: 12, color: '#fff' },
});
