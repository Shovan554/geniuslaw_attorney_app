import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { fonts, radius, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
};

export function SearchBar({ value, onChangeText, placeholder = 'Search' }: Props) {
  const { colors } = useTheme();
  const hasText = value.length > 0;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.card,
          borderColor: hasText ? colors.accentBorder : colors.cardBorder,
        },
      ]}
    >
      <Ionicons name="search-outline" size={16} color={colors.textMuted} />
      <TextInput
        style={[
          styles.input,
          { color: colors.text, fontFamily: fonts.sans },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        returnKeyType="search"
      />
      {hasText ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={10}
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
});
