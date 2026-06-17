import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

type Props = {
  item: {
    practice_area_name: string;
    client_name: string;
    completed_at: string | null;
  };
  onPress: () => void;
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
  const d = new Date(hasTz ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ProntoActivityItem({ item, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.cardBorder, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
            {item.practice_area_name}
          </Text>
          <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
            {item.client_name}
            {item.completed_at ? ` • ${formatDate(item.completed_at)}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 16 },
  hint: { fontSize: 13, lineHeight: 18 },
});
