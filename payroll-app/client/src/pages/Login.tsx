import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { Eye, EyeOff, Fingerprint, KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authApi, OIDC_LOGIN_URL } from '../api/auth';
import AuthShell from '../components/auth/AuthShell';
import LostFactorHelp from '../components/auth/LostFactorHelp';

// Authentik から戻ってきたときの失敗理由（サーバが /login?oidc_error=... で返す）
const OIDC_ERRORS: Record<string, string> = {
  not_linked:
    'この Authentik アカウントは、まだどのアカウントとも連携されていません。パスワードでログインし、設定画面から連携してください。',
  denied: 'Authentik で、このアプリへのアクセスが許可されていません。',
  failed: 'Authentik でのログインに失敗しました。もう一度お試しください。',
};

const inputClass =
  'appearance-none border rounded-lg w-full py-2.5 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // 二つ目の手段を持つ人は、パスワードのあとに二段階目（パスキー・認証アプリのコード・Authentik）に進む
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaMethods, setMfaMethods] = useState<('totp' | 'passkey' | 'oidc')[]>([]);
  const [totpCode, setTotpCode] = useState('');
  // 共用 PC で使われることもあるので、最初はオフ
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('oidc_error');
    return code ? (OIDC_ERRORS[code] ?? OIDC_ERRORS.failed) : '';
  });
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { login, loginTotp, loginSecondPasskey, loginWithPasskey } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Authentik でパスワードだけだった人は、二段階目の画面に回されて戻ってくる（/login?second=1）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('second') !== '1') return;
    window.history.replaceState(null, '', '/login');
    authApi
      .loginPending()
      .then((r) => {
        setMfaMethods(r.methods);
        setMfaStep(true);
        setError(
          r.methods.length
            ? 'Authentik では二段階認証が使われていませんでした。こちらでもう一段階確認してください'
            : '',
        );
      })
      .catch(() => setError('もう一度ログインしてください'));
  }, []);

  useEffect(() => {
    authApi
      .oidcConfig()
      .then((c) => setOidcEnabled(c.enabled))
      .catch(() => setOidcEnabled(false));
    authApi
      .emailConfig()
      .then((c) => setEmailEnabled(c.enabled))
      .catch(() => setEmailEnabled(false));
    authApi
      .passkeyConfig()
      .then((c) => setPasskeyEnabled(c.enabled && typeof window.PublicKeyCredential === 'function'))
      .catch(() => setPasskeyEnabled(false));
  }, []);

  const fromPath = location.state?.from?.pathname || '/';
  const fromSearch = location.state?.from?.search || '';
  const fromHash = location.state?.from?.hash || '';
  const from = `${fromPath}${fromSearch}${fromHash}`;

  const handlePasskeyLogin = async () => {
    setError('');
    setIsLoading(true);
    const result = await loginWithPasskey();
    if (result.success) {
      navigate(from, { replace: true });
      return;
    }
    setIsLoading(false);
    if (!result.cancelled) setError(result.error ?? '');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await login(username, password);
      if (result.success) {
        navigate(from, { replace: true });
      } else if (result.mfaRequired) {
        setMfaStep(true);
        setMfaMethods(result.methods ?? ['totp']);
        setTotpCode('');
      } else {
        setError(result.error ?? '');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await loginTotp(totpCode, rememberDevice);
      if (result.success) {
        navigate(from, { replace: true });
      } else {
        setError(result.error ?? '');
        // 目印の期限切れ（5 分）なら最初からやり直す
        if (result.error?.includes('ユーザー名とパスワードから')) setMfaStep(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSecondPasskey = async () => {
    setError('');
    setIsLoading(true);
    try {
      const result = await loginSecondPasskey();
      if (result.success) {
        navigate(from, { replace: true });
      } else if (!result.cancelled) {
        setError(result.error ?? '');
        if (result.error?.includes('ユーザー名とパスワードから')) setMfaStep(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const errorBox = error && (
    <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm font-bold">
      {error}
    </div>
  );

  if (mfaStep) {
    const hasPasskey = mfaMethods.includes('passkey') && passkeyEnabled;
    const hasTotp = mfaMethods.includes('totp');
    const hasOidc = mfaMethods.includes('oidc');
    return (
      <AuthShell mode="login">
        <h2 className="text-lg font-bold text-gray-800 mb-2">本人確認</h2>
        <p className="text-sm text-gray-600 mb-4">
          パスワードを確認しました。登録している方法で、もう一段階確認してください。
        </p>
        {errorBox}
        <div className="space-y-4">
          {hasPasskey && (
            <button
              type="button"
              onClick={handleSecondPasskey}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg disabled:opacity-50"
            >
              <Fingerprint size={20} />
              パスキーで確認
            </button>
          )}
          {hasOidc && (
            <a
              href={OIDC_LOGIN_URL}
              className={`w-full flex items-center justify-center gap-2 font-bold py-3 rounded-lg transition-colors ${
                hasPasskey
                  ? 'border border-gray-300 hover:bg-gray-50 text-gray-700'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <KeyRound size={20} />
              Authentik で続ける
            </a>
          )}
          {hasTotp && (
            <>
              {(hasPasskey || hasOidc) && (
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex-1 border-t" />
                  または認証アプリのコード
                  <span className="flex-1 border-t" />
                </div>
              )}
              <form onSubmit={handleTotpSubmit} className="space-y-4">
                <input
                  className={`${inputClass} text-center text-2xl font-mono tracking-[0.3em]`}
                  id="totp-code"
                  aria-label="認証コード"
                  inputMode="text"
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  autoFocus={!hasPasskey}
                  maxLength={9}
                  placeholder="123456"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.trim())}
                  required
                />
                <p className="text-xs text-gray-500">
                  スマートフォンが手元にないときは、回復コード（xxxx-xxxx）も使えます。
                </p>
                <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="mt-0.5 w-4 h-4"
                  />
                  <span>
                    この端末では 30 日間コードを求めない
                    <span className="block text-xs text-gray-400">
                      共用の端末ではチェックしないでください
                    </span>
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={isLoading || totpCode.length < 6}
                  className={`w-full font-bold py-2.5 rounded-lg disabled:opacity-50 ${
                    hasPasskey || hasOidc
                      ? 'border border-gray-300 hover:bg-gray-50 text-gray-700'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  コードでログイン
                </button>
              </form>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setMfaStep(false);
              setError('');
            }}
            className="w-full text-sm text-gray-500 hover:text-gray-700"
          >
            戻る
          </button>
        </div>
        <div className="mt-4">
          <LostFactorHelp variant={hasTotp ? 'totp' : 'passkey'} />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell mode="login">
      {errorBox}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-gray-600 text-xs font-bold mb-1" htmlFor="username">
            {emailEnabled ? 'ユーザーIDまたはメールアドレス' : 'ユーザーID'}
          </label>
          <input
            className={inputClass}
            id="username"
            type="text"
            placeholder={emailEnabled ? 'ユーザーIDまたはメールアドレス' : 'ユーザーID'}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label className="block text-gray-600 text-xs font-bold" htmlFor="password">
              パスワード
            </label>
            {emailEnabled && (
              <Link
                to="/forgot-password"
                className="text-xs text-gray-500 hover:text-blue-600 hover:underline"
              >
                パスワードを忘れた方
              </Link>
            )}
          </div>
          <div className="relative">
            <input
              className={`${inputClass} pr-11`}
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>
        <button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors shadow-md !mt-5 disabled:opacity-50 disabled:cursor-not-allowed"
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? '処理中...' : 'ログイン'}
        </button>
      </form>

      {(oidcEnabled || passkeyEnabled) && (
        <div className="mt-5">
          <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
            <span className="flex-1 border-t" />
            または
            <span className="flex-1 border-t" />
          </div>
          <div
            className={`grid gap-2 ${passkeyEnabled && oidcEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            {passkeyEnabled && (
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={isLoading}
                title="パスキーを登録したアカウントで使えます"
                className="flex items-center justify-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold text-sm py-2.5 px-3 rounded-lg transition-colors disabled:opacity-50"
              >
                <Fingerprint size={18} />
                パスキー
              </button>
            )}
            {oidcEnabled && (
              <a
                href={OIDC_LOGIN_URL}
                title="Authentik と連携したアカウントで使えます"
                className="flex items-center justify-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold text-sm py-2.5 px-3 rounded-lg transition-colors"
              >
                <KeyRound size={18} />
                Authentik
              </a>
            )}
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export default Login;
