jest.mock('../pronto', () => ({
  startProntoTestCall: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

import { router } from 'expo-router';
import { startProntoTestCall } from '../pronto';
import { handleTestCallAnswer, markTestCall, resolveTestVideoUrl } from '../testCall';

const DEMO_URL =
  'https://geniuslaw-attorney-app.onrender.com/assets/pronto/demo.mp4';

describe('resolveTestVideoUrl', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_PRONTO_TEST_VIDEO_URL;
  });

  it('falls back to the hosted demo URL when no env override is set', () => {
    delete process.env.EXPO_PUBLIC_PRONTO_TEST_VIDEO_URL;
    expect(resolveTestVideoUrl()).toBe(DEMO_URL);
  });

  it('prefers the env override when present', () => {
    process.env.EXPO_PUBLIC_PRONTO_TEST_VIDEO_URL = 'https://cdn.example.com/x.mp4';
    expect(resolveTestVideoUrl()).toBe('https://cdn.example.com/x.mp4');
  });
});

describe('handleTestCallAnswer', () => {
  it('routes to the call screen in test mode with the video URL', async () => {
    (startProntoTestCall as jest.Mock).mockResolvedValue({
      ok: true,
      data: {
        call_id: 'call-abc',
        daily_room_url: 'https://daily/room',
        daily_meeting_token: 'tok',
        is_video: true,
        client_name: 'John Doe',
      },
    });
    markTestCall('uuid-1', { isVideo: true, clientName: 'John Doe' });

    await handleTestCallAnswer('uuid-1');

    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(auth)/calls/[id]',
        params: expect.objectContaining({
          id: 'call-abc',
          test: '1',
          pronto: '1',
          videoUrl: DEMO_URL,
        }),
      }),
    );
  });
});
