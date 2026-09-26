import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate, useLocation, Link } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import {
  DollarSign,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
} from 'lucide-react';
import { DEFAULT_RATES } from '../utils/rateConstants';
import type { RateInput } from '../types';
import LegalModal from '../components/common/LegalModal';
import { authApi, OIDC_LOGIN_URL } from '../api/auth';

// Authentik から戻ってきたときの失敗理由（サーバが /login?oidc_error=... で返す）
const OIDC_ERRORS: Record<string, string> = {
  not_linked:
    'この Authentik アカウントは、まだどのアカウントとも連携されていません。パスワードでログインし、設定画面から連携してください。',
  denied: 'Authentik で、このアプリへのアクセスが許可されていません。',
  failed: 'Authentik でのログインに失敗しました。もう一度お試しください。',
};

interface NumberInputProps {
  label: string;
  value: number | string;
  field: string;
  onChange: (field: string, value: number | string) => void;
}

const NumberInput = ({ label, value, field, onChange }: NumberInputProps) => (
  <div>
    <label className="block text-xs font-bold text-gray-500 mb-1">{label}</label>
    <input
      type="number"
      min={0}
      step={1}
      value={value ?? ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const nextValue = e.target.value;
        const parsed = parseInt(nextValue, 10);
        onChange(field, nextValue === '' || Number.isNaN(parsed) ? '' : parsed);
      }}
      className="w-full p-2 border rounded text-sm font-bold bg-gray-50"
    />
  </div>
);

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('oidc_error');
    return code ? (OIDC_ERRORS[code] ?? OIDC_ERRORS.failed) : '';
  });
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [errorDetails, setErrorDetails] = useState<Array<{ msg: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Legal Modals State
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);

  // Rate State for Registration
  const [showRateInputs, setShowRateInputs] = useState(false);
  const [rateFormData, setRateFormData] = useState({
    start_date: new Date().toISOString().split('T')[0],
    ...DEFAULT_RATES,
  });

  const { login, loginWithPasskey, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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

  const handleRateChange = (field: string, value: number | string) => {
    setRateFormData((prev) => ({ ...prev, [field]: value }));
  };

  const switchMode = (login: boolean) => {
    if (login === isLogin) return;
    setIsLogin(login);
    setError('');
    setErrorDetails([]);
    setShowRateInputs(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setConfirmPassword('');
    setEmail('');
    setAgreedToTerms(false);
  };

  const handlePasskeyLogin = async () => {
    setError('');
    setErrorDetails([]);
    setIsLoading(true);
    const result = await loginWithPasskey();
    if (result.success) {
      navigate(from, { replace: true });
      return;
    }
    if (!result.cancelled) setError(result.error ?? '');
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setErrorDetails([]);
    setIsLoading(true);

    try {
      if (isLogin) {
        const result = await login(username, password);
        if (result.success) {
          navigate(from, { replace: true });
        } else {
          setError(result.error ?? '');
        }
      } else {
        if (password !== confirmPassword) {
          setError('パスワードが一致しません');
          setIsLoading(false);
          return;
        }
        // Register with optional rates — server sets auth cookies and
        // AuthContext.register sets the user, so the client is logged in
        // immediately without a separate /login round-trip.
        const rates = showRateInputs ? rateFormData : null;
        const result = await register(
          username,
          password,
          rates as RateInput,
          emailEnabled ? email : undefined,
        );

        if (result.success) {
          if (result.emailVerificationSent) {
            toast.success(
              `${email} に確認メールを送りました。24 時間以内にリンクを開くと登録が完了します`,
            );
          } else if (emailEnabled) {
            toast.error('確認メールを送れませんでした。設定画面から送り直してください');
          }
          navigate(from, { replace: true });
        } else {
          setError(result.error ?? '');
          const EMPTY_ERRORS: Array<{ msg: string }> = [];
          setErrorDetails((result.details as unknown as Array<{ msg: string }>) ?? EMPTY_ERRORS);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg">
          <img
            src="/logo-header.svg"
            alt="Payroll App"
            className="h-10 mx-auto mb-5"
            fetchPriority="high"
          />
          {/* 見た目はタブが担うが、画面の見出しは支援技術のために残す */}
          <h1 className="sr-only">{isLogin ? 'ログイン' : 'アカウント作成'}</h1>

          {/* ログイン / 新規登録の切り替え */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg mb-5" role="tablist">
            {(
              [
                [true, 'ログイン'],
                [false, '新規登録'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={isLogin === mode}
                onClick={() => switchMode(mode)}
                className={`py-2 rounded-md text-sm font-bold transition-colors ${
                  isLogin === mode
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm font-bold">
              <p>{error}</p>
              {errorDetails.length > 0 && (
                <ul className="list-disc list-inside mt-2 text-xs font-normal">
                  {errorDetails.map((detail, index) => (
                    <li key={index}>{detail.msg}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-gray-600 text-xs font-bold mb-1" htmlFor="username">
                {isLogin && emailEnabled ? 'ユーザー名またはメールアドレス' : 'ユーザー名'}
              </label>
              <input
                className="appearance-none border rounded-lg w-full py-2.5 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                id="username"
                type="text"
                placeholder={
                  isLogin && emailEnabled ? 'ユーザー名またはメールアドレス' : 'ユーザー名'
                }
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            {!isLogin && emailEnabled && (
              <div>
                <label className="block text-gray-600 text-xs font-bold mb-1" htmlFor="email">
                  メールアドレス
                </label>
                <input
                  className="appearance-none border rounded-lg w-full py-2.5 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  id="email"
                  type="email"
                  placeholder="メールアドレス"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  確認メールを送ります。パスワードを忘れたときの再設定と、ログインに使えます
                </p>
              </div>
            )}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="block text-gray-600 text-xs font-bold" htmlFor="password">
                  パスワード
                </label>
                {isLogin && emailEnabled && (
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
                  className="appearance-none border rounded-lg w-full py-2.5 pl-3 pr-11 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 focus:outline-none"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {!isLogin && (
                <p className="text-xs text-gray-500 mt-1">
                  ※パスワードは8文字以上、英字と数字を組み合わせてください
                </p>
              )}
            </div>

            {!isLogin && (
              <div>
                <label
                  className="block text-gray-600 text-xs font-bold mb-1"
                  htmlFor="confirm-password"
                >
                  パスワード（確認）
                </label>
                <div className="relative">
                  <input
                    className="appearance-none border rounded-lg w-full py-2.5 pl-3 pr-11 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 focus:outline-none"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">パスワードが一致しません</p>
                )}
              </div>
            )}

            {/* Rate Settings for Registration */}
            {!isLogin && (
              <div className="border border-blue-100 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowRateInputs(!showRateInputs)}
                  className="w-full flex items-center justify-between p-3 bg-blue-50 text-blue-700 font-bold text-sm hover:bg-blue-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <DollarSign size={16} />
                    初期単価設定 (任意)
                  </span>
                  {showRateInputs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showRateInputs && (
                  <div className="p-4 bg-white space-y-4 animate-fade-in">
                    <p className="text-xs text-gray-500 mb-2">
                      登録後に設定画面からいつでも変更できます。
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">
                        適用開始日
                      </label>
                      <input
                        type="date"
                        required
                        value={rateFormData.start_date}
                        onChange={(e) =>
                          setRateFormData({ ...rateFormData, start_date: e.target.value })
                        }
                        className="w-full p-2 border rounded-lg font-bold text-gray-700 bg-gray-50"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <NumberInput
                        label="1名指導"
                        value={rateFormData.wage_1_student}
                        field="wage_1_student"
                        onChange={handleRateChange}
                      />
                      <NumberInput
                        label="2名指導"
                        value={rateFormData.wage_2_students}
                        field="wage_2_students"
                        onChange={handleRateChange}
                      />
                      <NumberInput
                        label="3名指導"
                        value={rateFormData.wage_3_students}
                        field="wage_3_students"
                        onChange={handleRateChange}
                      />
                      <NumberInput
                        label="4名指導"
                        value={rateFormData.wage_4_students}
                        field="wage_4_students"
                        onChange={handleRateChange}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <NumberInput
                        label="規定外時給"
                        value={rateFormData.hourly_wage}
                        field="hourly_wage"
                        onChange={handleRateChange}
                      />
                      <NumberInput
                        label="日額手当"
                        value={rateFormData.allowance_day}
                        field="allowance_day"
                        onChange={handleRateChange}
                      />
                      <NumberInput
                        label="授業間"
                        value={rateFormData.allowance_gap}
                        field="allowance_gap"
                        onChange={handleRateChange}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Terms Agreement Checkbox for Registration */}
            {!isLogin && (
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="terms-agreement"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="terms-agreement" className="text-xs text-gray-600 leading-relaxed">
                  <button
                    type="button"
                    onClick={() => setActiveModal('terms')}
                    className="text-blue-600 hover:underline"
                  >
                    利用規約
                  </button>
                  および
                  <button
                    type="button"
                    onClick={() => setActiveModal('privacy')}
                    className="text-blue-600 hover:underline"
                  >
                    プライバシーポリシー
                  </button>
                  に同意する
                </label>
              </div>
            )}

            <button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg focus:outline-none focus:shadow-outline transition-colors shadow-md !mt-5 disabled:opacity-50 disabled:cursor-not-allowed"
              type="submit"
              disabled={
                isLoading ||
                (!isLogin && (!agreedToTerms || !confirmPassword || password !== confirmPassword))
              }
            >
              {isLoading ? '処理中...' : isLogin ? 'ログイン' : 'アカウントを作成して始める'}
            </button>
          </form>

          {isLogin && (oidcEnabled || passkeyEnabled) && (
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
                    title="設定画面でパスキーを登録したアカウントで使えます"
                    className="flex items-center justify-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold text-sm py-2.5 px-3 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Fingerprint size={18} />
                    パスキー
                  </button>
                )}
                {oidcEnabled && (
                  <a
                    href={OIDC_LOGIN_URL}
                    title="設定画面で Authentik と連携したアカウントで使えます"
                    className="flex items-center justify-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold text-sm py-2.5 px-3 rounded-lg transition-colors"
                  >
                    <KeyRound size={18} />
                    Authentik
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 案内とリンクはカードの外に1行で */}
        <div className="mt-4 flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-xs text-gray-400">
          <a href="/guide" className="hover:text-gray-600 hover:underline">
            使い方
          </a>
          <button
            type="button"
            onClick={() => setActiveModal('terms')}
            className="hover:text-gray-600 hover:underline"
          >
            利用規約
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('privacy')}
            className="hover:text-gray-600 hover:underline"
          >
            プライバシーポリシー
          </button>
          <span>&copy; 2026 Warionate</span>
        </div>
      </div>

      <LegalModal activeModal={activeModal} onClose={() => setActiveModal(null)} />
    </div>
  );
}

export default Login;
