jest.mock('../calls', () => ({
  acceptCall: jest.fn(),
  endCall: jest.fn(),
}));
jest.mock('../pronto', () => ({
  acceptProntoCall: jest.fn(),
  endProntoCall: jest.fn(),
}));

import { acceptCall, endCall } from '../calls';
import { acceptIncomingCall, declineIncomingCall } from '../incomingCallRouting';
import { acceptProntoCall, endProntoCall } from '../pronto';

const mAccept = acceptCall as jest.Mock;
const mEnd = endCall as jest.Mock;
const mAcceptPronto = acceptProntoCall as jest.Mock;
const mEndPronto = endProntoCall as jest.Mock;

const CALL = '11111111-2222-3333-4444-555555555555';

beforeEach(() => jest.resetAllMocks());

describe('acceptIncomingCall', () => {
  it('routes a GeniusLaw client call to the call screen without the pronto flag', async () => {
    mAccept.mockResolvedValue({
      ok: true,
      data: {
        call_id: CALL,
        daily_room_url: 'https://x.daily.co/r',
        daily_meeting_token: 'tok',
        is_video: true,
        caller_name: 'Anthony Kane',
      },
    });
    const res = await acceptIncomingCall(CALL);
    expect(mAcceptPronto).not.toHaveBeenCalled();
    expect(res).toEqual({
      ok: true,
      params: {
        id: CALL,
        url: 'https://x.daily.co/r',
        token: 'tok',
        name: 'Anthony Kane',
        video: '1',
      },
    });
  });

  it('falls back to Pronto when GeniusLaw does not know the call', async () => {
    mAccept.mockResolvedValue({ ok: false, message: 'Call not found.', status: 404 });
    mAcceptPronto.mockResolvedValue({
      ok: true,
      data: {
        call_id: CALL,
        daily_room_url: 'https://x.daily.co/p',
        daily_meeting_token: 'ptok',
        is_video: false,
        client_name: 'Pronto Client',
      },
    });
    const res = await acceptIncomingCall(CALL);
    expect(res).toEqual({
      ok: true,
      params: {
        id: CALL,
        url: 'https://x.daily.co/p',
        token: 'ptok',
        name: 'Pronto Client',
        video: '0',
        pronto: '1',
      },
    });
  });

  it('surfaces a real GeniusLaw error instead of trying Pronto', async () => {
    mAccept.mockResolvedValue({ ok: false, message: 'This call has already ended.', status: 409 });
    const res = await acceptIncomingCall(CALL);
    expect(mAcceptPronto).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: false, message: 'This call has already ended.' });
  });

  it('reports the Pronto error when neither backend accepts', async () => {
    mAccept.mockResolvedValue({ ok: false, message: 'Call not found.', status: 404 });
    mAcceptPronto.mockResolvedValue({ ok: false, message: 'Pronto call expired' });
    const res = await acceptIncomingCall(CALL);
    expect(res).toEqual({ ok: false, message: 'Pronto call expired' });
  });
});

describe('declineIncomingCall', () => {
  it('declines a GeniusLaw call on the attorney backend only', async () => {
    mEnd.mockResolvedValue({ ok: true, data: { ok: true, status: 'rejected' } });
    await declineIncomingCall(CALL);
    expect(mEnd).toHaveBeenCalledWith(CALL, 'declined');
    expect(mEndPronto).not.toHaveBeenCalled();
  });

  it('falls back to Pronto when GeniusLaw does not know the call', async () => {
    mEnd.mockResolvedValue({ ok: false, message: 'Call not found.', status: 404 });
    mEndPronto.mockResolvedValue({ ok: true, data: {} });
    await declineIncomingCall(CALL);
    expect(mEndPronto).toHaveBeenCalledWith(CALL, 'declined');
  });
});
