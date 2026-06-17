import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { fonts, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

type Props = {
  visible: boolean;
  url: string | null;
  title?: string;
  onClose: () => void;
};

function buildViewerUrl(url: string): string {
  const lower = url.toLowerCase();
  const pathOnly = lower.split('?')[0];
  if (pathOnly.endsWith('.pdf')) return url;
  return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
}

export function DocumentViewerModal({ visible, url, title, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState(false);
  const viewerUrl = useMemo(() => (url ? buildViewerUrl(url) : null), [url]);

  // Safe-area insets are unreliable inside a fullScreen RN Modal (often 0), which
  // pushes the header under the notch where the close button can't be tapped.
  // Fall back to a sensible status-bar height so the header always clears it.
  const topInset = insets.top > 0 ? insets.top : Platform.OS === 'ios' ? 47 : 24;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.header,
            { borderBottomColor: colors.cardBorder, paddingTop: topInset + spacing.sm },
          ]}
        >
          <Text
            style={[styles.title, { color: colors.text, fontFamily: fonts.sansBold }]}
            numberOfLines={1}
          >
            {title ?? 'Document'}
          </Text>
          <Pressable onPress={onClose} hitSlop={14} style={styles.closeBtn}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.body}>
          {viewerUrl ? (
            <>
              <WebView
                key={viewerUrl}
                source={{ uri: viewerUrl }}
                onLoadEnd={() => setLoaded(true)}
                startInLoadingState
                style={styles.web}
              />
              {!loaded ? (
                <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={colors.accent} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, fontSize: 16, marginRight: spacing.md },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  web: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
