import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fonts, radius, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import type { PracticeArea } from '../lib/practiceAreas';

type Props = {
  areas: PracticeArea[];
  /** Currently-selected practice-area names. */
  selected: Set<string>;
  onToggle: (name: string) => void;
  /** When true, show ONLY pre-retainer-required areas as a single flat list with no section headers. */
  preRetainerOnly?: boolean;
};

const SECTIONS = [
  {
    preRetainer: true,
    title: 'Pronto practice areas',
    caption: 'These require a signed retainer before work begins.',
  },
  {
    preRetainer: false,
    title: 'General practice areas',
    caption: 'Areas you can take on directly.',
  },
] as const;

/** Two grouped sections of checkbox rows for selecting practice areas.
 * Controlled: the parent owns the `selected` set and handles `onToggle`. */
export function PracticeAreaPicker({ areas, selected, onToggle, preRetainerOnly = false }: Props) {
  const { colors } = useTheme();

  const grouped = useMemo(() => {
    const sorted = [...areas].sort((a, b) => a.name.localeCompare(b.name));
    return {
      false: sorted.filter((a) => !a.pre_retainer_required),
      true: sorted.filter((a) => a.pre_retainer_required),
    };
  }, [areas]);

  // Pronto onboarding shows only pre-retainer-required areas in a single,
  // header-less list; everywhere else keeps the two labelled sections.
  const sections = preRetainerOnly
    ? [{ preRetainer: true, title: '', caption: '' } as const]
    : SECTIONS;

  return (
    <View style={styles.wrap}>
      {sections.map((section) => {
        const items = grouped[String(section.preRetainer) as 'true' | 'false'];
        if (items.length === 0) return null;
        return (
          <View key={section.title || 'pre-retainer'} style={styles.section}>
            {section.title ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fonts.sansBold }]}>
                  {section.title}
                </Text>
                <Text style={[styles.sectionCaption, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  {section.caption}
                </Text>
              </>
            ) : null}

            <View style={[styles.group, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
              {items.map((area, idx) => {
                const checked = selected.has(area.name);
                return (
                  <TouchableOpacity
                    key={area.id}
                    activeOpacity={0.7}
                    onPress={() => onToggle(area.name)}
                    style={[
                      styles.row,
                      idx > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cardBorder } : null,
                    ]}
                  >
                    <Text style={[styles.rowLabel, { color: colors.text, fontFamily: fonts.sans }]}>
                      {area.name}
                    </Text>
                    <View
                      style={[
                        styles.checkbox,
                        checked
                          ? { backgroundColor: colors.accent, borderColor: colors.accent }
                          : { borderColor: colors.cardBorder },
                      ]}
                    >
                      {checked ? (
                        <Ionicons name="checkmark" size={15} color={colors.background} />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.xl },
  section: { gap: spacing.xs },
  sectionTitle: { fontSize: 16 },
  sectionCaption: { fontSize: 13, lineHeight: 18, marginBottom: spacing.sm },
  group: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  rowLabel: { fontSize: 15, flex: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
