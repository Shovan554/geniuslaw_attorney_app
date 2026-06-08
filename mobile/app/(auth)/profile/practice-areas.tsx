import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PracticeAreaPicker } from '../../../components/PracticeAreaPicker';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { getAttorneyMe } from '../../../lib/attorney';
import {
  listPracticeAreas,
  parsePracticeAreas,
  savePracticeAreas,
  type PracticeArea,
} from '../../../lib/practiceAreas';

export default function PracticeAreasScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [areas, setAreas] = useState<PracticeArea[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listPracticeAreas(), getAttorneyMe()])
      .then(([catalog, me]) => {
        if (cancelled) return;
        if (catalog.ok) setAreas(catalog.data);
        else setStatus(catalog.message);
        if (me.ok) setSelected(new Set(parsePracticeAreas(me.data.practice_areas)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    setWorking(true);
    setStatus(null);
    const res = await savePracticeAreas([...selected]);
    if (res.ok) {
      setSelected(new Set(parsePracticeAreas(res.data.practice_areas)));
      setStatus('Saved.');
    } else {
      setStatus(res.message);
    }
    setWorking(false);
  }, [selected]);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
          Practice Areas
        </Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(320)}>
              <Text style={[styles.intro, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                Choose the practice areas you handle. Clients are matched to you based on these.
              </Text>
              <PracticeAreaPicker areas={areas} selected={selected} onToggle={toggle} />
            </Animated.View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.cardBorder }]}>
            {status ? (
              <Text style={[styles.status, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {status}
              </Text>
            ) : null}
            <TouchableOpacity
              disabled={working}
              onPress={save}
              style={[styles.button, { backgroundColor: colors.accent, opacity: working ? 0.6 : 1 }]}
            >
              {working ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.background, fontFamily: fonts.sansBold }]}>
                  Save changes
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
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
  intro: { fontSize: 14, lineHeight: 20, marginBottom: spacing.xl },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, borderTopWidth: 1 },
  status: { fontSize: 13, textAlign: 'center', marginBottom: spacing.sm },
  button: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16 },
});
