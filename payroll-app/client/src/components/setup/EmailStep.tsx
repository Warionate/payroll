import { useEffect, useState } from 'react';
import { Mail, MailCheck } from 'lucide-react';
import { authApi } from '../../api/auth';
import { formatApiError } from '../../utils/apiError';
import SetupCard from './SetupCard';
import { inputClass, primaryButton, secondaryButton } from './setupStyles';

const POLL_MS = 4000;
const RESEND_WAIT_S = 60;

/**
 * メールアドレスの登録。送ったら「受信トレイを確認」の画面にして、確認が済んだら自動で次へ進む
 * （リンクは別のタブ・別の端末で開いてもよい）
 */
export default function EmailStep({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  // 前に送った確認待ちがあれば、そこから再開する
  useEffect(() => {
    authApi
      .emailStatus()
      .then((s) => {
        if (s.email) onDone();
        else if (s.pending) setSentTo(s.pending);
      })
      .catch(() => {});
  }, [onDone]);

  // 確認待ちの間は、確認が済んだかを数秒ごとに見る
  useEffect(() => {
    if (!sentTo) return;
    const timer = setInterval(() => {
      authApi
        .emailStatus()
        .then((s) => {
          if (s.email) onDone();
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [sentTo, onDone]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async (address: string) => {
    setBusy(true);
    setError('');
    try {
      await authApi.emailRequestVerification(address);
      setSentTo(address.trim().toLowerCase());
      setWait(RESEND_WAIT_S);
    } catch (err) {
      setError(formatApiError(err, '確認メールを送れませんでした'));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <SetupCard
        icon={<MailCheck size={24} />}
        title="受信トレイを確認してください"
        lead={
          <>
            <span className="font-bold break-all">{sentTo}</span>
            に確認メールを送りました。メールのリンクを開くと、この画面は自動で次に進みます。
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
            <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shrink-0" />
            確認を待っています…
          </div>
          <p className="text-xs text-gray-500">
            届かないときは、迷惑メールのフォルダも確認してください。リンクの有効期限は 24 時間です。
          </p>
          {error && <p className="text-sm text-red-600 font-bold">{error}</p>}
          <button
            type="button"
            disabled={wait > 0 || busy}
            onClick={() => void send(sentTo)}
            className={`${secondaryButton} disabled:opacity-50`}
          >
            {wait > 0 ? `メールを送り直す（${wait} 秒後）` : 'メールを送り直す'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setEmail('');
            }}
            className={secondaryButton}
          >
            別のアドレスにする
          </button>
        </div>
      </SetupCard>
    );
  }

  return (
    <SetupCard
      icon={<Mail size={24} />}
      title="メールアドレスを登録しましょう"
      lead="パスワードを忘れたときの再設定と、見覚えのないログインがあったときのお知らせに使います。"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(email);
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="setup-email" className="block text-xs font-bold text-gray-500 mb-1">
            メールアドレス
          </label>
          <input
            id="setup-email"
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            autoFocus
            required
          />
        </div>
        {error && <p className="text-sm text-red-600 font-bold">{error}</p>}
        <button type="submit" disabled={!email || busy} className={primaryButton}>
          {busy ? '送信中…' : '確認メールを送る'}
        </button>
      </form>
    </SetupCard>
  );
}
