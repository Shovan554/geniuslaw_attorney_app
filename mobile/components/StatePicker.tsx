import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fonts, radius, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import type { USState } from '../lib/states';

type Props = {
  states: USState[];
  /** Currently-selected USPS state codes. */
  selected: Set<string>;
  onToggle: (code: string) => void;
};

/** A single grouped list of checkbox rows for selecting licensed states.
 * Controlled: the parent owns the `selected` set and handles `onToggle`. */
export function StatePicker({ states, selected, onToggle }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.group, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
      {states.map((state, idx) => {
        const checked = selected.has(state.code);
        return (
          <TouchableOpacity
            key={state.code}
            activeOpacity={0.7}
            onPress={() => onToggle(state.code)}
            style={[
              styles.row,
              idx > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.cardBorder } : null,
            ]}
          >
            <Text style={[styles.rowLabel, { color: colors.text, fontFamily: fonts.sans }]}>
              {state.name}
            </Text>
            <View
              style={[
                styles.checkbox,
                checked
                  ? { backgroundColor: colors.accent, borderColor: colors.accent }
                  : { borderColor: colors.cardBorder },
              ]}
            >
              {checked ? <Ionicons name="checkmark" size={15} color={colors.background} /> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
