import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../../components/Card';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { createSetupBundle, getSavedCard, VaultCard } from '../../../lib/vault';

export default function VaultScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [card, setCard] = useState<VaultCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const loadCard = useCallback(async () => {
    const res = await getSavedCard();
    if (res.ok) {
      setCard(res.data);
      setStatus(null);
    } else {
      setStatus(res.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadCard().finally(() => setLoading(false));
  }, [loadCard]);

  const addCard = useCallback(async () => {
    setWorking(true);
    setStatus(null);

    const bundleRes = await createSetupBundle();
    if (!bundleRes.ok) {
      setStatus(bundleRes.message);
      setWorking(false);
      return;
    }
    const b = bundleRes.data;

    const init = await initPaymentSheet({
      merchantDisplayName: 'Genius Law',
      customerId: b.customer_id,
      customerEphemeralKeySecret: b.ephemeral_key,
      setupIntentClientSecret: b.setup_intent_client_secret,
    });
    if (init.error) {
      setStatus(init.error.message);
      setWorking(false);
      return;
    }

    const { error } = await presentPaymentSheet();
    if (error) {
      if (error.code !== 'Canceled') setStatus(error.message);
      setWorking(false);
      return;
    }

    await loadCard();
    setStatus('Card saved.');
    setWorking(false);
  }, [initPaymentSheet, presentPaymentSheet, loadCard]);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
          Payment Vault
        </Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.content}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(320)}>
            <Card>
              {card ? (
                <View style={styles.cardRow}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
                    <Ionicons name="card-outline" size={18} color={colors.accent} />
                  </View>
                  <Text style={[styles.cardText, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                    {card.brand.toUpperCase()} •••• {card.last4}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.empty, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  No card on file.
                </Text>
              )}
            </Card>

            <TouchableOpacity
              disabled={working}
              onPress={addCard}
              style={[styles.button, { backgroundColor: colors.accent, opacity: working ? 0.6 : 1 }]}
            >
              {working ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.background, fontFamily: fonts.sansSemiBold }]}>
                  {card ? 'Replace Card' : 'Add Card'}
                </Text>
              )}
            </TouchableOpacity>

            {status ? (
              <Text style={[styles.status, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {status}
              </Text>
            ) : null}
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  cardText: { fontSize: 15 },
  empty: { fontSize: 14 },
  button: {
    marginTop: spacing.lg, borderRadius: radius.md, paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { fontSize: 15, letterSpacing: 0.4 },
  status: { marginTop: spacing.md, fontSize: 13, textAlign: 'center' },
});
