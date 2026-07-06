import { Platform } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

/**
 * Screen safe-area edges.
 *
 * Expo SDK 54 with `android.targetSdkVersion 36` runs edge-to-edge on Android 15+: the app
 * always draws behind the system nav bar (back / home / recent) and there is no opt-out. We
 * reserve the bottom inset on Android only so controls clear the nav bar, while iOS stays
 * exactly as before (top edge only — the thin home indicator needs no reserved space here).
 */
export const screenEdges: Edge[] = Platform.OS === 'android' ? ['top', 'bottom'] : ['top'];
