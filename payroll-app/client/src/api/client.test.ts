import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { apiClient, setupInterceptors, resetInterceptorState } from './client';

type ResponseShape = {
  status: number;
  data?: unknown;
  headers?: Record<string, string>;
};

describe('apiClient interceptor', () => {
  let originalAdapter: AxiosAdapter | undefined;
  const handlers = new Map<
    string,
    (config: InternalAxiosRequestConfig) => Promise<ResponseShape>
  >();

  const key = (method: string | undefined, url: string | undefined) =>
    `${(method || 'GET').toUpperCase()} ${url}`;

  beforeEach(() => {
    originalAdapter = apiClient.defaults.adapter as AxiosAdapter | undefined;
    apiClient.defaults.adapter = async (config) => {
      const handler = handlers.get(key(config.method, config.url));
      if (!handler) throw new Error(`No mock for ${key(config.method, config.url)}`);
      const r = await handler(config);
      const response = {
        data: r.data ?? null,
        status: r.status,
        statusText: '',
        headers: r.headers ?? {},
        config,
        request: {},
      };
      // Mimic axios' settle(): reject for non-2xx so the interceptor's error
      // path runs the same way it does against a real server.
      const validateStatus = config.validateStatus ?? ((s: number) => s >= 200 && s < 300);
      if (!validateStatus(r.status)) {
        throw new AxiosError(
          `Request failed with status code ${r.status}`,
          AxiosError.ERR_BAD_REQUEST,
          config,
          {},
          response,
        );
      }
      return response;
    };
    handlers.clear();
    resetInterceptorState();
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    resetInterceptorState();
  });

  it('triggers onLogout when refresh returns 401', async () => {
    const onLogout = vi.fn();
    setupInterceptors(onLogout);

    handlers.set(key('GET', '/me'), async () => ({ status: 401 }));
    handlers.set(key('POST', '/auth/refresh'), async () => ({ status: 401 }));

    await expect(apiClient.get('/me')).rejects.toBeDefined();

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger onLogout when refresh fails with network error', async () => {
    const onLogout = vi.fn();
    setupInterceptors(onLogout);

    handlers.set(key('GET', '/me'), async () => ({ status: 401 }));
    handlers.set(key('POST', '/auth/refresh'), async () => {
      // Simulate network error: adapter rejects without a response
      throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
    });

    await expect(apiClient.get('/me')).rejects.toBeDefined();

    expect(onLogout).not.toHaveBeenCalled();
  });

  it('does NOT trigger onLogout when refresh fails with 5xx', async () => {
    const onLogout = vi.fn();
    setupInterceptors(onLogout);

    handlers.set(key('GET', '/me'), async () => ({ status: 401 }));
    handlers.set(key('POST', '/auth/refresh'), async () => ({ status: 502 }));

    await expect(apiClient.get('/me')).rejects.toBeDefined();

    expect(onLogout).not.toHaveBeenCalled();
  });

  it('retries original request after successful refresh', async () => {
    const onLogout = vi.fn();
    setupInterceptors(onLogout);

    let meCalls = 0;
    handlers.set(key('GET', '/me'), async () => {
      meCalls++;
      if (meCalls === 1) return { status: 401 };
      return { status: 200, data: { id: 1, username: 'test' } };
    });
    handlers.set(key('POST', '/auth/refresh'), async () => ({ status: 200 }));

    const res = await apiClient.get('/me');

    expect(meCalls).toBe(2);
    expect(res.data).toEqual({ id: 1, username: 'test' });
    expect(onLogout).not.toHaveBeenCalled();
  });
});
