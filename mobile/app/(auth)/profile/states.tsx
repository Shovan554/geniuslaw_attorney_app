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
import { StatePicker } from '../../../components/StatePicker';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { getAttorneyMe } from '../../../lib/attorney';
import { parseStates, saveStates, US_STATES } from '../../../lib/states';

export default function StatesScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAttorneyMe()
      .then((me) => {
        if (cancelled) return;
        if (me.ok) setSelected(parseStates(me.data.states));
        else setStatus(me.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    setWorking(true);
    setStatus(null);
    const res = await saveStates([...selected]);
    if (res.ok) {
      setSelected(parseStates(res.data.states));
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
          Licensed States
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
                Select the states where you're licensed to practice. Clients are matched to you
                based on these.
              </Text>
              <StatePicker states={US_STATES} selected={selected} onToggle={toggle} />
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
