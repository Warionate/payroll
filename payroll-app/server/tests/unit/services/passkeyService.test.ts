import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockWebauthnRepository, mockUserRepository, mockSimpleWebAuthn } = vi.hoisted(() => ({
  mockWebauthnRepository: {
    findCredential: vi.fn(),
    listByUser: vi.fn(),
    createCredential: vi.fn(),
    markUsed: vi.fn(),
    deleteForUser: vi.fn(),
    createChallenge: vi.fn(),
    takeChallenge: vi.fn(),
  },
  mockUserRepository: {
    findById: vi.fn(),
  },
  mockSimpleWebAuthn: {
    generateRegistrationOptions: vi.fn(),
    generateAuthenticationOptions: vi.fn(),
    verifyRegistrationResponse: vi.fn(),
    verifyAuthenticationResponse: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/webauthnRepository.js', () => ({
  webauthnRepository: mockWebauthnRepository,
}));
vi.mock('../../../src/repositories/userRepository.js', () => ({
  userRepository: mockUserRepository,
}));
vi.mock('@simplewebauthn/server', () => mockSimpleWebAuthn);

import { passkeyService, PasskeyError } from '../../../src/services/passkeyService.js';

const response = { id: 'cred-1' } as never;

describe('passkeyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBAUTHN_RP_ID = 'payroll.example';
    process.env.WEBAUTHN_ORIGIN = 'https://payroll.example';
  });

  it('is disabled when WebAuthn env is missing', () => {
    delete process.env.WEBAUTHN_RP_ID;
    expect(passkeyService.isEnabled()).toBe(false);
  });

  describe('verifyRegistration', () => {
    it('rejects a challenge that belongs to another user', async () => {
      mockWebauthnRepository.takeChallenge.mockReturnValue({
        id: 'c',
        challenge: 'x',
        purpose: 'register',
        user_id: 99,
      });

      await expect(passkeyService.verifyRegistration(5, 'c', response, 'pc')).rejects.toThrow(
        PasskeyError,
      );
      expect(mockSimpleWebAuthn.verifyRegistrationResponse).not.toHaveBeenCalled();
    });

    it('rejects a login challenge used for registration', async () => {
      mockWebauthnRepository.takeChallenge.mockReturnValue({
        id: 'c',
        challenge: 'x',
        purpose: 'login',
        user_id: null,
      });

      await expect(passkeyService.verifyRegistration(5, 'c', response, 'pc')).rejects.toThrow(
        PasskeyError,
      );
    });

    it('rejects when there is no challenge cookie', async () => {
      await expect(passkeyService.verifyRegistration(5, undefined, response, 'pc')).rejects.toThrow(
        PasskeyError,
      );
      expect(mockWebauthnRepository.takeChallenge).not.toHaveBeenCalled();
    });

    it('stores the credential when verified', async () => {
      mockWebauthnRepository.takeChallenge.mockReturnValue({
        id: 'c',
        challenge: 'x',
        purpose: 'register',
        user_id: 5,
      });
      mockSimpleWebAuthn.verifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2]), counter: 0 },
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
        },
      });

      await passkeyService.verifyRegistration(5, 'c', response, '  iPhone  ');

      expect(mockWebauthnRepository.createCredential).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cred-1', user_id: 5, name: 'iPhone', backed_up: 1 }),
      );
    });
  });

  describe('verifyAuthentication', () => {
    it('rejects an unknown credential (e.g. deleted but still on the device)', async () => {
      mockWebauthnRepository.takeChallenge.mockReturnValue({
        id: 'c',
        challenge: 'x',
        purpose: 'login',
        user_id: null,
      });
      mockWebauthnRepository.findCredential.mockReturnValue(undefined);

      await expect(passkeyService.verifyAuthentication('c', response)).rejects.toThrow(
        'このパスキーは登録されていません',
      );
    });

    it('rejects a registration challenge used for login', async () => {
      mockWebauthnRepository.takeChallenge.mockReturnValue({
        id: 'c',
        challenge: 'x',
        purpose: 'register',
        user_id: 5,
      });

      await expect(passkeyService.verifyAuthentication('c', response)).rejects.toThrow(
        PasskeyError,
      );
    });

    it("refuses someone else's passkey when the check was started for a specific user", async () => {
      mockWebauthnRepository.takeChallenge.mockReturnValue({
        id: 'c',
        challenge: 'x',
        purpose: 'login',
        user_id: 5,
      });
      mockWebauthnRepository.findCredential.mockReturnValue({ id: 'cred', user_id: 9 });

      await expect(
        passkeyService.verifyAuthentication('c', response, { purpose: 'login', userId: 5 }),
      ).rejects.toThrow('このアカウントのパスキーではありません');
    });

    it('refuses a login challenge used for re-authentication', async () => {
      mockWebauthnRepository.takeChallenge.mockReturnValue({
        id: 'c',
        challenge: 'x',
        purpose: 'login',
        user_id: 5,
      });

      await expect(
        passkeyService.verifyAuthentication('c', response, { purpose: 'reauth', userId: 5 }),
      ).rejects.toThrow(PasskeyError);
    });

    it('returns the owner and updates the counter when verified', async () => {
      mockWebauthnRepository.takeChallenge.mockReturnValue({
        id: 'c',
        challenge: 'x',
        purpose: 'login',
        user_id: null,
      });
      mockWebauthnRepository.findCredential.mockReturnValue({
        id: 'cred-1',
        user_id: 5,
        public_key: 'AQI',
        counter: 3,
        transports: null,
      });
      mockSimpleWebAuthn.verifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 4 },
      });
      mockUserRepository.findById.mockReturnValue({ id: 5, username: 'u', role: 'user' });

      const user = await passkeyService.verifyAuthentication('c', response);

      expect(user.id).toBe(5);
      expect(mockWebauthnRepository.markUsed).toHaveBeenCalledWith('cred-1', 4);
    });
  });

  it('only removes the caller’s own passkey', () => {
    mockWebauthnRepository.deleteForUser.mockReturnValue(false);

    expect(passkeyService.remove(5, 'someone-elses')).toBe(false);
    expect(mockWebauthnRepository.deleteForUser).toHaveBeenCalledWith('someone-elses', 5);
  });
});
