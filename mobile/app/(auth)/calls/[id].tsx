import { Ionicons } from '@expo/vector-icons';
import Daily, {
  DailyCall,
  DailyEvent,
  DailyMediaView,
  DailyParticipant,
} from '@daily-co/react-native-daily-js';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { endCall as endCallApi } from '../../../lib/calls';

type Status = 'connecting' | 'ringing' | 'connected' | 'ended';

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function InCallScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    id: string;
    url: string;
    token: string;
    name?: string;
    video?: string;
  }>();
  const calleeName = params.name || 'Client';
  const callId = params.id;
  const roomUrl = params.url;
  const meetingToken = params.token;
  const isVideoCall = params.video === '1';

  const [status, setStatus] = useState<Status>('connecting');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [localParticipant, setLocalParticipant] = useState<DailyParticipant | null>(null);
  const [remoteParticipant, setRemoteParticipant] = useState<DailyParticipant | null>(null);

  const callRef = useRef<DailyCall | null>(null);
  const endingRef = useRef(false);
  const connectedAtRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reportEnded = useCallback(
    async (reason: string) => {
      if (endingRef.current) return;
      endingRef.current = true;
      setStatus('ended');
      const wasConnected = connectedAtRef.current != null;
      let finalStatus: string | null = null;
      try {
        const res = await endCallApi(callId, reason);
        if (res.ok) finalStatus = res.data.status;
      } catch {
        // best-effort
      }
      // If the callee declined before answering, show "Call declined" so the
      // attorney sees explicit feedback instead of silently returning.
      if (finalStatus === 'rejected' && !wasConnected) {
        Alert.alert('Call declined', `${calleeName} declined the call.`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }
      router.back();
    },
    [callId, calleeName],
  );

  const syncParticipants = useCallback((co: DailyCall) => {
    const ps = co.participants();
    setLocalParticipant(ps.local ?? null);
    const remote = Object.values(ps).find((p) => !p.local) ?? null;
    setRemoteParticipant(remote);
  }, []);

  useEffect(() => {
    if (!roomUrl || !meetingToken) {
      Alert.alert('Missing call info', 'No room URL or token provided.');
      router.back();
      return;
    }

    const co = Daily.createCallObject({
      audioSource: true,
      videoSource: isVideoCall,
    });
    callRef.current = co;

    const onJoined = () => {
      setStatus('ringing');
      syncParticipants(co);
    };
    const onParticipantJoined = (e: any) => {
      syncParticipants(co);
      if (e?.participant?.local === false) {
        connectedAtRef.current = Date.now();
        setStatus('connected');
        elapsedTimerRef.current = setInterval(() => {
          if (connectedAtRef.current) {
            setElapsedSec(Math.floor((Date.now() - connectedAtRef.current) / 1000));
          }
        }, 1000);
      }
    };
    const onParticipantUpdated = () => syncParticipants(co);
    const onParticipantLeft = (e: any) => {
      syncParticipants(co);
      if (e?.participant?.local === false) {
        reportEnded('callee_hangup');
      }
    };
    const onError = (e: any) => {
      // Ignore late Daily errors if we've already initiated end-of-call.
      if (endingRef.current) return;

      const msg = e?.errorMsg || e?.error || 'Call error';
      const text = String(msg).toLowerCase();
      const meetingEnded =
        text.includes('meeting has ended') || text.includes('meeting ended');

      // If the room ended before the callee picked up, the remote side
      // declined / cancelled / the backend tore down the room. Don't surface
      // a "Call error" popup — the backend's terminal-state guard preserves
      // the real reason (client decline → status 'rejected') so call history
      // shows "Client declined" correctly.
      if (meetingEnded && !connectedAtRef.current) {
        reportEnded('cancelled_before_answer');
        return;
      }

      Alert.alert('Call error', String(msg), [
        { text: 'OK', onPress: () => reportEnded('failed') },
      ]);
    };
    const onLeft = () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };

    co.on('joined-meeting' as DailyEvent, onJoined);
    co.on('participant-joined' as DailyEvent, onParticipantJoined);
    co.on('participant-updated' as DailyEvent, onParticipantUpdated);
    co.on('participant-left' as DailyEvent, onParticipantLeft);
    co.on('left-meeting' as DailyEvent, onLeft);
    co.on('error' as DailyEvent, onError);

    co.join({ url: roomUrl, token: meetingToken }).catch((err) => {
      Alert.alert('Could not join call', err?.message || String(err), [
        { text: 'OK', onPress: () => reportEnded('failed') },
      ]);
    });

    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      try {
        co.leave().catch(() => {});
      } catch {}
      try {
        co.destroy();
      } catch {}
      callRef.current = null;
    };
  }, [roomUrl, meetingToken, isVideoCall, reportEnded, syncParticipants]);

  const handleMuteToggle = useCallback(() => {
    const co = callRef.current;
    if (!co) return;
    const nextMuted = !muted;
    co.setLocalAudio(!nextMuted);
    setMuted(nextMuted);
  }, [muted]);

  const handleCameraToggle = useCallback(() => {
    const co = callRef.current;
    if (!co) return;
    const nextOff = !cameraOff;
    co.setLocalVideo(!nextOff);
    setCameraOff(nextOff);
  }, [cameraOff]);

  const handleCameraFlip = useCallback(() => {
    const co = callRef.current;
    if (!co) return;
    co.cycleCamera().catch(() => {});
  }, []);

  const handleEnd = useCallback(() => {
    const reason =
      status === 'connected' ? 'caller_hangup' : 'cancelled_before_answer';
    reportEnded(reason);
  }, [status, reportEnded]);

  const statusText =
    status === 'connecting'
      ? 'Connecting…'
      : status === 'ringing'
        ? 'Ringing…'
        : status === 'connected'
          ? formatElapsed(elapsedSec)
          : 'Ending…';

  // Background for video call: dark to make tiles pop
  const bgColor = isVideoCall ? '#000000' : colors.background;

  const showRemoteVideo =
    isVideoCall &&
    remoteParticipant?.videoTrack &&
    remoteParticipant?.video !== false;
  const showLocalVideo =
    isVideoCall && localParticipant?.videoTrack && !cameraOff;

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.container, { backgroundColor: bgColor }]}
    >
      {/* Remote video (full-screen background) — video mode only */}
      {showRemoteVideo ? (
        <View style={StyleSheet.absoluteFill}>
          <DailyMediaView
            videoTrack={remoteParticipant!.videoTrack as any}
            audioTrack={remoteParticipant!.audioTrack as any}
            objectFit="cover"
            mirror={false}
            zOrder={0}
            style={StyleSheet.absoluteFill}
          />
          {/* Subtle gradient at top for status text contrast */}
          <View style={styles.topScrim} />
        </View>
      ) : null}

      {/* Top: caller name + status. In video mode, overlay on top of remote tile. */}
      <View
        style={[
          styles.topInfo,
          isVideoCall && showRemoteVideo ? styles.topInfoOverlay : null,
        ]}
      >
        {!isVideoCall || !showRemoteVideo ? (
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: isVideoCall ? '#1a1a1a' : colors.accentTint,
                borderColor: isVideoCall ? '#333' : colors.accentBorder,
                marginTop: isVideoCall ? spacing.xl : spacing.xl * 2,
              },
            ]}
          >
            <Text
              style={[
                styles.avatarText,
                {
                  color: isVideoCall ? '#FFF' : colors.accent,
                  fontFamily: fonts.sansSemiBold,
                },
              ]}
            >
              {initialsFrom(calleeName)}
            </Text>
          </View>
        ) : null}
        <Text
          style={[
            styles.calleeName,
            {
              color: showRemoteVideo ? '#FFFFFF' : colors.text,
              fontFamily: fonts.sansSemiBold,
              marginTop: !isVideoCall || !showRemoteVideo ? spacing.lg : 0,
            },
          ]}
          numberOfLines={1}
        >
          {calleeName}
        </Text>
        <Text
          style={[
            styles.statusText,
            {
              color:
                status === 'connected'
                  ? showRemoteVideo
                    ? '#A0F0C0'
                    : colors.success
                  : showRemoteVideo
                    ? 'rgba(255,255,255,0.75)'
                    : colors.textMuted,
              fontFamily: fonts.sansMedium,
            },
          ]}
        >
          {statusText}
        </Text>
      </View>

      {/* Local video PiP — top-right when in video mode + camera on */}
      {showLocalVideo ? (
        <View style={[styles.pip, { borderColor: 'rgba(255,255,255,0.15)' }]}>
          <DailyMediaView
            videoTrack={localParticipant!.videoTrack as any}
            audioTrack={null}
            objectFit="cover"
            mirror
            zOrder={1}
            style={styles.pipMedia}
          />
        </View>
      ) : null}

      {/* Bottom controls */}
      <View
        style={[
          styles.controls,
          isVideoCall && showRemoteVideo ? styles.controlsOverlay : null,
        ]}
      >
        <Pressable
          onPress={handleMuteToggle}
          hitSlop={12}
          style={({ pressed }) => [
            styles.controlBtn,
            {
              backgroundColor: muted ? colors.accent : 'rgba(255,255,255,0.12)',
              borderColor: muted ? colors.accent : 'rgba(255,255,255,0.18)',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Ionicons
            name={muted ? 'mic-off' : 'mic'}
            size={24}
            color={muted ? '#0B0F1A' : '#FFFFFF'}
          />
        </Pressable>

        {isVideoCall ? (
          <Pressable
            onPress={handleCameraToggle}
            hitSlop={12}
            style={({ pressed }) => [
              styles.controlBtn,
              {
                backgroundColor: cameraOff ? colors.accent : 'rgba(255,255,255,0.12)',
                borderColor: cameraOff ? colors.accent : 'rgba(255,255,255,0.18)',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons
              name={cameraOff ? 'videocam-off' : 'videocam'}
              size={24}
              color={cameraOff ? '#0B0F1A' : '#FFFFFF'}
            />
          </Pressable>
        ) : null}

        {isVideoCall ? (
          <Pressable
            onPress={handleCameraFlip}
            hitSlop={12}
            disabled={cameraOff}
            style={({ pressed }) => [
              styles.controlBtn,
              {
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderColor: 'rgba(255,255,255,0.18)',
                opacity: cameraOff ? 0.4 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Ionicons name="camera-reverse" size={24} color="#FFFFFF" />
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleEnd}
          hitSlop={12}
          style={({ pressed }) => [
            styles.endBtn,
            { backgroundColor: colors.danger, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="call" size={26} color="#FFFFFF" style={styles.endIcon} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between' },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  topInfo: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  topInfoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    paddingTop: spacing.xl * 2,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: { fontSize: 36, letterSpacing: 0.5 },
  calleeName: { fontSize: 22, letterSpacing: 0.2 },
  statusText: { fontSize: 14, letterSpacing: 0.4 },

  pip: {
    position: 'absolute',
    top: 60,
    right: spacing.md,
    width: 110,
    height: 150,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: '#000',
    zIndex: 10,
  },
  pipMedia: { width: '100%', height: '100%' },

  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  controlsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    paddingBottom: spacing.xl + spacing.lg,
  },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  endBtn: {
    width: 70,
    height: 70,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endIcon: { transform: [{ rotate: '135deg' }] },
});
