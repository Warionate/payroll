import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, ChevronLeft, Eye, EyeOff, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { COMMON_PASSWORDS, DEFAULT_RATES, displayNameField, loginIdField } from '@payroll/shared';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';
import AuthShell from '../components/auth/AuthShell';
import { useLegalModal } from '../hooks/useLegalModal';
import type { RateInput } from '../types';

type StepKey = 'profile' | 'email' | 'password' | 'rates' | 'confirm';

const STEP_LABELS: Record<StepKey, string> = {
  profile: '名前とID',
  email: 'メール',
  password: 'パスワード',
  rates: '給与単価',
  confirm: '確認',
};

const inputClass =
  'w-full p-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
const primaryButton =
  'w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const RATE_FIELDS: { key: keyof typeof DEFAULT_RATES; label: string }[] = [
  { key: 'wage_1_student', label: '1名指導' },
  { key: 'wage_2_students', label: '2名指導' },
  { key: 'wage_3_students', label: '3名指導' },
  { key: 'wage_4_students', label: '4名指導' },
  { key: 'hourly_wage', label: '規定外時給' },
  { key: 'allowance_day', label: '日額手当' },
  { key: 'allowance_gap', label: '授業間' },
];

/** 条件を満たしているかを ✓ / × で並べる */
function Checklist({ items }: { items: { label: string; ok: boolean }[] }) {
  return (
    <ul className="space-y-1">
      {items.map((i) => (
        <li
          key={i.label}
          className={`flex items-center gap-2 text-sm ${i.ok ? 'text-green-600' : 'text-gray-400'}`}
        >
          {i.ok ? <Check size={16} /> : <X size={16} />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** サーバの入力チェックの結果（zod の flatten）から、どのステップの何がだめかを取り出す */
function stepForServerError(
  message: string,
  details: unknown,
): { step: StepKey; message: string } | null {
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> } | undefined)
    ?.fieldErrors;
  const firstOf = (k: string) => fieldErrors?.[k]?.[0];
  if (firstOf('username') || firstOf('display_name')) {
    return { step: 'profile', message: firstOf('username') ?? firstOf('display_name')! };
  }
  if (firstOf('email')) return { step: 'email', message: firstOf('email')! };
  if (firstOf('password')) return { step: 'password', message: firstOf('password')! };
  if (/ユーザーID|ユーザー名/.test(message)) return { step: 'profile', message };
  if (/メールアドレス/.test(message)) return { step: 'email', message };
  if (/パスワード|漏洩/.test(message)) return { step: 'password', message };
  return null;
}

/**
 * 新規登録（ウィザード）。名前と ID → メール → パスワード → 給与単価（任意）→ 確認。
 * 登録が済んだらそのままログインした状態になり、最初の設定（メールの確認・二段階認証）に続く
 */
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const legal = useLegalModal();

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [setRatesNow, setSetRatesNow] = useState(false);
  const [rates, setRates] = useState({
    start_date: new Date().toISOString().split('T')[0],
    ...DEFAULT_RATES,
  });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authApi
      .emailConfig()
      .then((c) => setEmailEnabled(c.enabled))
      .catch(() => setEmailEnabled(false));
  }, []);

  const steps: StepKey[] = emailEnabled
    ? ['profile', 'email', 'password', 'rates', 'confirm']
    : ['profile', 'password', 'rates', 'confirm'];
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const goTo = (k: StepKey) => {
    setError('');
    setStepIndex(steps.indexOf(k));
  };
  const next = () => {
    setError('');
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };
  const back = () => {
    setError('');
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const normalizedId = loginId.trim().toLowerCase();
  const idChecks = [
    { label: '3〜32 文字', ok: normalizedId.length >= 3 && normalizedId.length <= 32 },
    {
      label: '英小文字・数字・「.」「_」「-」だけ',
      ok: normalizedId.length > 0 && /^[a-z0-9._-]+$/.test(normalizedId),
    },
    { label: '先頭は英小文字か数字', ok: /^[a-z0-9]/.test(normalizedId) },
  ];
  const profileOk =
    displayNameField.safeParse(displayName).success && loginIdField.safeParse(loginId).success;

  const passwordChecks = [
    { label: '8 文字以上', ok: password.length >= 8 },
    { label: '英字を含む', ok: /[A-Za-z]/.test(password) },
    { label: '数字か記号を含む', ok: /[0-9!@#$%^&*]/.test(password) },
    {
      label: 'ユーザーIDを含まない',
      ok: password.length > 0 && !password.toLowerCase().includes(normalizedId || '\u0000'),
    },
    {
      label: 'よく使われるパスワードではない',
      ok: password.length > 0 && !COMMON_PASSWORDS.includes(password.toLowerCase()),
    },
    { label: '確認用と一致している', ok: password.length > 0 && password === confirmPassword },
  ];
  const passwordOk = passwordChecks.every((c) => c.ok);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    setBusy(true);
    setError('');
    const result = await register(
      normalizedId,
      password,
      (setRatesNow ? rates : null) as RateInput,
      emailEnabled ? email.trim() : undefined,
      displayName.trim(),
    );
    setBusy(false);
    if (result.success) {
      if (emailEnabled && !result.emailVerificationSent) {
        toast.error('確認メールを送れませんでした。次の画面から送り直してください');
      }
      navigate('/', { replace: true });
      return;
    }
    // AuthContext は「登録に失敗しました: 理由」の形で返す。ステップの中では理由だけを見せる
    const reason = (result.error ?? '').replace(/^登録に失敗しました[:：]\s*/, '');
    const mapped = stepForServerError(reason, result.details);
    if (mapped) {
      goTo(mapped.step);
      setError(mapped.message);
    } else {
      setError(reason || '登録できませんでした');
    }
  };

  const errorBox = error && (
    <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-bold">
      {error}
    </div>
  );

  return (
    <AuthShell mode="register" wide>
      {/* 進み具合 */}
      <div className="mb-6">
        <div className="flex justify-between text-xs font-bold mb-2">
          <span className="text-blue-600">
            ステップ {stepIndex + 1} / {steps.length}
          </span>
          <span className="text-gray-400">{STEP_LABELS[step]}</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {stepIndex > 0 && (
        <button
          type="button"
          onClick={back}
          className="flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-700 mb-3"
        >
          <ChevronLeft size={16} /> 戻る
        </button>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 'confirm') void submit();
          else next();
        }}
        className="space-y-5 animate-fade-in"
        key={step}
      >
        {step === 'profile' && (
          <>
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">はじめまして</h2>
              <p className="text-sm text-gray-600">
                画面に出る名前と、ログインに使う ID を決めます。
              </p>
            </div>
            <div>
              <label
                htmlFor="reg-display-name"
                className="block text-xs font-bold text-gray-500 mb-1"
              >
                表示名
              </label>
              <input
                id="reg-display-name"
                className={inputClass}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例: 田中 太郎"
                autoComplete="name"
                maxLength={50}
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">日本語も使えます。あとから変えられます。</p>
            </div>
            <div>
              <label htmlFor="reg-login-id" className="block text-xs font-bold text-gray-500 mb-1">
                ユーザーID
              </label>
              <input
                id="reg-login-id"
                className={`${inputClass} font-mono`}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="例: tanaka.taro"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={32}
              />
              <div className="mt-2">
                <Checklist items={idChecks} />
              </div>
            </div>
            {errorBox}
            <button type="submit" disabled={!profileOk} className={primaryButton}>
              次へ
            </button>
          </>
        )}

        {step === 'email' && (
          <>
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">メールアドレス</h2>
              <p className="text-sm text-gray-600">
                パスワードを忘れたときの再設定と、見覚えのないログインのお知らせに使います。登録の最後に確認メールを送ります。
              </p>
            </div>
            <div>
              <label htmlFor="reg-email" className="block text-xs font-bold text-gray-500 mb-1">
                メールアドレス
              </label>
              <input
                id="reg-email"
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                autoFocus
              />
            </div>
            {errorBox}
            <button type="submit" disabled={!emailOk} className={primaryButton}>
              次へ
            </button>
          </>
        )}

        {step === 'password' && (
          <>
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">パスワード</h2>
              <p className="text-sm text-gray-600">
                ほかのサービスと同じパスワードは使わないでください。過去の情報漏洩で流出したパスワードは使えません。
              </p>
            </div>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={normalizedId}
              readOnly
              hidden
            />
            <div>
              <label htmlFor="reg-password" className="block text-xs font-bold text-gray-500 mb-1">
                パスワード
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  className={`${inputClass} pr-12`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500"
                  tabIndex={-1}
                  aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="reg-password2" className="block text-xs font-bold text-gray-500 mb-1">
                パスワード（確認）
              </label>
              <input
                id="reg-password2"
                type={showPassword ? 'text' : 'password'}
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Checklist items={passwordChecks} />
            {errorBox}
            <button type="submit" disabled={!passwordOk} className={primaryButton}>
              次へ
            </button>
          </>
        )}

        {step === 'rates' && (
          <>
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">給与単価（任意）</h2>
              <p className="text-sm text-gray-600">
                給与の計算に使います。分からなければ、あとで設定画面から入れられます。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(
                [
                  [false, 'あとで設定する'],
                  [true, '今入力する'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={setRatesNow === value}
                  onClick={() => setSetRatesNow(value)}
                  className={`py-3 rounded-xl border-2 text-sm font-bold transition-colors ${
                    setRatesNow === value
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {setRatesNow && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <label
                    htmlFor="reg-rate-start"
                    className="block text-xs font-bold text-gray-500 mb-1"
                  >
                    適用開始日
                  </label>
                  <input
                    id="reg-rate-start"
                    type="date"
                    className={inputClass}
                    value={rates.start_date}
                    onChange={(e) => setRates({ ...rates, start_date: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {RATE_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label
                        htmlFor={`reg-rate-${f.key}`}
                        className="block text-xs font-bold text-gray-500 mb-1"
                      >
                        {f.label}（円）
                      </label>
                      <input
                        id={`reg-rate-${f.key}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        className={inputClass}
                        value={rates[f.key] ?? ''}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          setRates({ ...rates, [f.key]: Number.isNaN(n) ? '' : n });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button type="submit" className={primaryButton}>
              次へ
            </button>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div>
              <h2 className="text-xl font-bold text-gray-800 mb-1">内容の確認</h2>
              <p className="text-sm text-gray-600">この内容でアカウントを作ります。</p>
            </div>
            <dl className="divide-y border rounded-xl">
              {(
                [
                  ['profile', '表示名', displayName.trim()],
                  ['profile', 'ユーザーID', normalizedId],
                  ...(emailEnabled ? ([['email', 'メールアドレス', email.trim()]] as const) : []),
                  ['password', 'パスワード', '••••••••'],
                  [
                    'rates',
                    '給与単価',
                    setRatesNow ? `${rates.start_date} から適用` : 'あとで設定する',
                  ],
                ] as const
              ).map(([target, label, value]) => (
                <div key={label} className="flex items-center gap-3 px-4 py-3">
                  <dt className="text-xs font-bold text-gray-500 w-24 shrink-0">{label}</dt>
                  <dd className="flex-1 min-w-0 text-sm text-gray-800 break-all">{value}</dd>
                  <button
                    type="button"
                    onClick={() => goTo(target)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 shrink-0"
                  >
                    変更
                  </button>
                </div>
              ))}
            </dl>
            <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-5 h-5"
              />
              <span>
                <button
                  type="button"
                  onClick={() => legal.open('terms')}
                  className="text-blue-600 hover:underline"
                >
                  利用規約
                </button>
                と
                <button
                  type="button"
                  onClick={() => legal.open('privacy')}
                  className="text-blue-600 hover:underline"
                >
                  プライバシーポリシー
                </button>
                に同意します
              </span>
            </label>
            {errorBox}
            <button type="submit" disabled={!agreed || busy} className={primaryButton}>
              {busy ? '作成しています…' : 'アカウントを作成する'}
            </button>
            <p className="text-xs text-gray-500 text-center">
              作成のあと、{emailEnabled ? 'メールアドレスの確認と' : ''}
              二段階認証の設定に進みます。
            </p>
          </>
        )}
      </form>
      {legal.modal}
    </AuthShell>
  );
}
