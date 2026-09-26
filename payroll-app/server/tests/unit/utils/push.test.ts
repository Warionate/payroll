import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    prepare: vi.fn(),
    sendNotification: vi.fn(),
    setVapidDetails: vi.fn(),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    loggerError: vi.fn(),
  },
}));

vi.mock('web-push', () => ({
  default: {
    sendNotification: mocks.sendNotification,
    setVapidDetails: mocks.setVapidDetails,
  },
}));

vi.mock('../../../src/db.js', () => ({
  default: {
    prepare: mocks.prepare,
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  default: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  },
}));

import { sendPushNotification } from '../../../src/utils/push.js';

type PushSub = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setupDbMocks(subscriptions: PushSub[], deleteRun: ReturnType<typeof vi.fn>) {
  mocks.prepare.mockImplementation((query: string) => {
    if (query.startsWith('SELECT * FROM push_subscriptions WHERE user_id = ?')) {
      return { all: vi.fn(() => subscriptions) };
    }

    if (query.startsWith('DELETE FROM push_subscriptions WHERE id = ?')) {
      return { run: deleteRun };
    }

    throw new Error(`Unexpected SQL query in test: ${query}`);
  });
}

describe('push utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send in bounded batches and not exceed max concurrent sends', async () => {
    const subscriptions: PushSub[] = Array.from({ length: 9 }).map((_, idx) => ({
      id: idx + 1,
      endpoint: `https://example.com/${idx + 1}`,
      p256dh: `p256dh-${idx + 1}`,
      auth: `auth-${idx + 1}`,
    }));

    const deleteRun = vi.fn();
    setupDbMocks(subscriptions, deleteRun);

    const resolvers: Array<() => void> = [];
    let inFlight = 0;
    let maxInFlight = 0;

    mocks.sendNotification.mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      return new Promise<void>((resolve) => {
        resolvers.push(() => {
          inFlight -= 1;
          resolve();
        });
      });
    });

    sendPushNotification(1, { title: 't', body: 'b' });
    await flushAsync();

    expect(mocks.sendNotification).toHaveBeenCalledTimes(8);
    expect(maxInFlight).toBe(8);

    resolvers.splice(0, 8).forEach((resolve) => resolve());
    await flushAsync();
    await flushAsync();

    expect(mocks.sendNotification).toHaveBeenCalledTimes(9);

    resolvers.splice(0).forEach((resolve) => resolve());
    await flushAsync();

    expect(deleteRun).not.toHaveBeenCalled();
  });

  it('should delete invalid subscription when push service returns 410', async () => {
    const deleteRun = vi.fn();
    setupDbMocks([{ id: 7, endpoint: 'https://example.com/7', p256dh: 'p', auth: 'a' }], deleteRun);

    mocks.sendNotification.mockRejectedValue({ statusCode: 410, message: 'Gone' });

    sendPushNotification(1, { title: 't', body: 'b' });
    await flushAsync();
    await flushAsync();

    expect(mocks.prepare).toHaveBeenCalledWith('DELETE FROM push_subscriptions WHERE id = ?');
    expect(deleteRun).toHaveBeenCalledWith(7);
  });
});
