import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Fingerprint,
  KeyRound,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import QRCode from 'qrcode';
import { startRegistration } from '@simplewebauthn/browser';
import { toast } from 'react-hot-toast';
import { authApi } from '../../api/auth';
import { formatApiError } from '../../utils/apiError';
import SetupCard from './SetupCard';
import { inputClass, primaryButton, secondaryButton } from './setupStyles';

type Choice = 'passkey' | 'totp' | null;

/** 端末の種類から、パスキーの名前の初期値を作る（あとで設定画面から見分けやすいように） */
function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'この端末';
}

const isMobile = () => /iPhone|iPad|Android/.test(navigator.userAgent);

/**
 * 二段階認証。選ぶ → 登録 → （認証アプリなら）回復コードを控える、の順。
 * パスキーをおすすめにする（操作が一番少なく、フィッシングにも強い）
 */
export default function MfaStep({ onDone }: { onDone: () => void }) {
  const [choice, setChoice] = useState<Choice>(null);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [oidcAvailable, setOidcAvailable] = useState(false);

  useEffect(() => {
    authApi
      .passkeyConfig()
      .then((c) =>
        setPasskeyAvailable(c.enabled && typeof window.PublicKeyCredential === 'function'),
      )
      .catch(() => setPasskeyAvailable(false));
    authApi
      .oidcConfig()
      .then((c) => setOidcAvailable(c.enabled))
      .catch(() => setOidcAvailable(false));
  }, []);

  if (choice === 'passkey') return <PasskeyFlow onBack={() => setChoice(null)} onDone={onDone} />;
  if (choice === 'totp') return <TotpFlow onBack={() => setChoice(null)} onDone={onDone} />;

  const linkOidc = async () => {
    try {
      const { url } = await authApi.oidcLinkStart();
      window.location.href = url;
    } catch (err) {
      toast.error(formatApiError(err, 'Authentik との連携を始められませんでした'));
    }
  };

  return (
    <SetupCard
      icon={<ShieldCheck size={24} />}
      title="二段階認証を設定しましょう"
      lead="パスワードに加えて、あなたの手元にあるもので本人確認をします。パスワードが漏れても、他人はログインできなくなります。"
    >
      <div className="space-y-3">
        {passkeyAvailable && (
          <OptionCard
            icon={<Fingerprint size={22} />}
            title="パスキー"
            badge="おすすめ"
            description="指紋・顔認証・端末の PIN でログインします。パスワードの入力もいらなくなります。"
            onClick={() => setChoice('passkey')}
          />
        )}
        <OptionCard
          icon={<Smartphone size={22} />}
          title="認証アプリ"
          description="Google Authenticator などのアプリに表示される 6 桁のコードを、パスワードのあとに入力します。"
          onClick={() => setChoice('totp')}
        />
        {oidcAvailable && (
          <OptionCard
            icon={<KeyRound size={22} />}
            title="Authentik と連携"
            description="Authentik で二段階認証を設定している方向け。Authentik の画面に移動します（Authentik でパスワードだけでログインした場合は数えません）。"
            onClick={() => void linkOidc()}
          />
        )}
      </div>
    </SetupCard>
  );
}

function OptionCard({
  icon,
  title,
  badge,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-colors hover:border-blue-500 hover:bg-blue-50 ${badge ? 'border-blue-200' : 'border-gray-200'}`}
    >
      <span className="w-11 h-11 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="font-bold text-gray-800">{title}</span>
          {badge && (
            <span className="text-xs font-bold text-white bg-blue-600 rounded-full px-2 py-0.5">
              {badge}
            </span>
          )}
        </span>
        <span className="block text-xs text-gray-500 mt-1 leading-relaxed">{description}</span>
      </span>
      <ChevronRight size={20} className="text-gray-400 shrink-0" />
    </button>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-700 mb-3"
    >
      <ChevronLeft size={16} /> ほかの方法を選ぶ
    </button>
  );
}

function PasskeyFlow({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const register = async () => {
    setBusy(true);
    setError('');
    try {
      const options = await authApi.passkeyRegisterOptions();
      let response;
      try {
        response = await startRegistration({ optionsJSON: options });
      } catch (err) {
        const e = err as Error;
        if (e.name === 'NotAllowedError') return; // 端末のダイアログを閉じた
        if (e.name === 'InvalidStateError') {
          setError('この端末のパスキーは既に登録されています');
          return;
        }
        throw err;
      }
      await authApi.passkeyRegisterVerify(response, guessDeviceName());
      toast.success('パスキーを登録しました');
      onDone();
    } catch (err) {
      setError(formatApiError(err, 'パスキーを登録できませんでした'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <BackLink onBack={onBack} />
      <SetupCard
        icon={<Fingerprint size={24} />}
        title="この端末にパスキーを作ります"
        lead="ボタンを押すと、端末の確認画面（指紋・顔認証・PIN）が出ます。画面の案内に従ってください。次からは「パスキーでログイン」を押すだけで入れます。"
      >
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600 font-bold">{error}</p>}
          <button
            type="button"
            onClick={() => void register()}
            disabled={busy}
            className={primaryButton}
          >
            {busy ? '端末で確認中…' : 'パスキーを作る'}
          </button>
          <p className="text-xs text-gray-500">
            iPhone・Mac は iCloud キーチェーン、Android・Chrome は Google
            パスワードマネージャーに保存され、同じアカウントの端末でも使えます。
          </p>
        </div>
      </SetupCard>
    </div>
  );
}

function TotpFlow({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [pending, setPending] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  useEffect(() => {
    authApi
      .totpSetup()
      .then(async ({ secret, uri }) =>
        setPending({ secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) }),
      )
      .catch((err) => setError(formatApiError(err, '認証アプリの登録を始められませんでした')));
  }, []);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await authApi.totpConfirm(code);
      setRecoveryCodes(res.recoveryCodes);
    } catch (err) {
      setError(formatApiError(err, 'コードを確認できませんでした'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (recoveryCodes) return <RecoveryCodes codes={recoveryCodes} onDone={onDone} />;

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(pending!.secret);
      toast.success('キーをコピーしました');
    } catch {
      toast.error('コピーできませんでした');
    }
  };

  return (
    <div>
      <BackLink onBack={onBack} />
      <SetupCard
        icon={<Smartphone size={24} />}
        title="認証アプリを登録します"
        lead="スマートフォンに認証アプリがなければ、先に入れてください（Google Authenticator・Microsoft Authenticator など。iPhone は標準の「パスワード」アプリでも使えます）。"
      >
        {!pending ? (
          error ? (
            <p className="text-sm text-red-600 font-bold">{error}</p>
          ) : (
            <p className="text-sm text-gray-500">準備しています…</p>
          )
        ) : (
          <form onSubmit={confirm} className="space-y-6">
            <div>
              <p className="text-sm font-bold text-gray-700 mb-3">
                <StepNo n={1} />
                {isMobile() ? 'アプリに追加します' : 'アプリで QR コードを読み取ります'}
              </p>
              {isMobile() ? (
                <a
                  href={pending.uri}
                  className={`${primaryButton} flex items-center justify-center gap-2`}
                >
                  <ExternalLink size={18} /> 認証アプリで開く
                </a>
              ) : (
                <img
                  src={pending.qr}
                  alt="認証アプリ用の QR コード"
                  className="w-52 h-52 mx-auto border rounded-xl"
                />
              )}
              <details className="mt-3 text-xs text-gray-500">
                <summary className="cursor-pointer font-bold">
                  {isMobile()
                    ? '開けないとき（キーを手で入力）'
                    : '読み取れないとき（キーを手で入力）'}
                </summary>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 break-all bg-gray-50 rounded p-2 font-mono">
                    {pending.secret}
                  </code>
                  <button type="button" onClick={() => void copySecret()} aria-label="キーをコピー">
                    <Copy size={16} />
                  </button>
                </div>
                {isMobile() && (
                  <img
                    src={pending.qr}
                    alt="認証アプリ用の QR コード"
                    className="w-40 h-40 mt-2 border rounded"
                  />
                )}
              </details>
            </div>
            <div>
              <label htmlFor="setup-totp" className="block text-sm font-bold text-gray-700 mb-3">
                <StepNo n={2} />
                アプリに表示された 6 桁のコードを入力します
              </label>
              <input
                id="setup-totp"
                className={`${inputClass} text-center text-2xl font-mono tracking-[0.5em]`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
            </div>
            {error && <p className="text-sm text-red-600 font-bold">{error}</p>}
            <button type="submit" disabled={code.length !== 6 || busy} className={primaryButton}>
              {busy ? '確認中…' : '確認する'}
            </button>
          </form>
        )}
      </SetupCard>
    </div>
  );
}

function StepNo({ n }: { n: number }) {
  return (
    <span className="inline-flex w-6 h-6 rounded-full bg-blue-600 text-white text-xs items-center justify-center mr-2">
      {n}
    </span>
  );
}

/** 回復コード。控えたことを確かめてから先に進める（GitHub・Google と同じ流れ） */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `Payroll の回復コード（各コード 1 回だけ使えます）\n\n${codes.join('\n')}\n`;

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payroll-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('コピーしました');
    } catch {
      toast.error('コピーできませんでした。書き写してください');
    }
  };

  return (
    <SetupCard
      icon={<KeyRound size={24} />}
      title="回復コードを控えてください"
      lead="スマートフォンを失くしたり機種変更したりしたときに、6 桁のコードの代わりに使えます。この画面を閉じると二度と表示できません。"
    >
      <div className="space-y-4">
        <ul className="grid grid-cols-2 gap-2 bg-gray-50 rounded-xl p-4 font-mono text-base text-gray-800 text-center">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={download}
            className="flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <Download size={16} /> ダウンロード
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            className="flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <Copy size={16} /> コピー
          </button>
        </div>
        <label className="flex items-start gap-3 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="mt-0.5 w-5 h-5"
          />
          回復コードを安全な場所（パスワード管理アプリ・紙など）に控えました
        </label>
        <button type="button" disabled={!saved} onClick={onDone} className={primaryButton}>
          次へ
        </button>
        <p className={`${secondaryButton} text-center cursor-default`}>
          回復コードは、あとから設定画面で作り直せます
        </p>
      </div>
    </SetupCard>
  );
}
