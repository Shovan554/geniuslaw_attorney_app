import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { fonts, radius, spacing } from '../constants/theme';
import { hasSession } from '../lib/auth';


export default function LandingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    hasSession().then(setAuthed);
  }, []);

  if (authed === null) return null;
  if (authed) return <Redirect href="/(auth)/dashboard" />;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.bgGradientStart, colors.bgGradientMid, colors.bgGradientEnd]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.container}>
        <View style={styles.hero}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.cta}>
          <TouchableOpacity
            style={[styles.btn, { borderColor: colors.sidebarBorder, backgroundColor: colors.sidebarBg }]}
            onPress={() => router.push('/login')}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, { color: colors.sidebarText, fontFamily: fonts.sansBold }]}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 260,
    height: 260,
  },
  cta: {
    paddingBottom: spacing.xl * 1.5,
    alignItems: 'center',
  },
  btn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    width: '60%',
  },
  btnText: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.8,
  },
});
