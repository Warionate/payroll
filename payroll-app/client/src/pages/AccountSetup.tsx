import { useCallback, useEffect, useState } from 'react';
import { Check, LogOut, PartyPopper } from 'lucide-react';
import type { AccountSetup as SetupState } from '@payroll/shared';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';
import LoginIdStep from '../components/setup/LoginIdStep';
import EmailStep from '../components/setup/EmailStep';
import MfaStep from '../components/setup/MfaStep';
import SetupCard from '../components/setup/SetupCard';
import { primaryButton } from '../components/setup/setupStyles';

type StepKey = 'loginId' | 'email' | 'mfa';

const STEP_LABELS: Record<StepKey, string> = {
  loginId: 'ユーザーID',
  email: 'メールアドレス',
  mfa: '二段階認証',
};
const ORDER: StepKey[] = ['loginId', 'email', 'mfa'];

/**
 * 最初の設定（ウィザード）。1 画面に 1 ステップ、済んだら自動で次へ進み、最後に完了画面を出す。
 * 済ませるまでアプリのほかの画面は使えない（サーバも 403 で止める）。
 *
 * 進み具合はこの画面の中で /me から取り直す（AuthContext の user を更新すると、
 * 全部済んだ瞬間にアプリへ切り替わって完了画面が出せないため、「はじめる」で初めて反映する）
 */
export default function AccountSetup() {
  const { user, refreshUser, logout } = useAuth();
  // 3 つのステップは常に並べ、済んだもの（最初から済んでいたものも）にチェックを付ける。
  // 途中でページを読み直しても（Authentik からの戻り等）「何ステップ中のどこか」が変わらないように
  const steps = ORDER;
  const [setup, setSetup] = useState<SetupState | undefined>(user?.setup);
  const [currentId, setCurrentId] = useState(user?.username ?? '');

  const reload = useCallback(async () => {
    try {
      const me = await authApi.me();
      setSetup(me.setup);
      setCurrentId(me.username);
    } catch {
      // 取れなければそのまま（401 ならインターセプタがログアウトさせる）
    }
  }, []);

  // 確認メールを別のタブで開いた・別のアプリから戻ってきた、などのあとで状態を取り直す
  // （Authentik からの戻りはページごと読み直すので、AuthContext の /me で最新になっている）
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  if (!user || !setup) return null;

  const current = steps.find((k) => setup[k]);
  const doneCount = steps.filter((k) => !setup[k]).length;
  const progress = steps.length ? (doneCount / steps.length) * 100 : 100;

  return (
    <div className="min-h-screen bg-gray-50 overflow-y-auto">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <img src="/logo-header.svg" alt="Payroll" className="h-7" />
          <button
            type="button"
            onClick={() => void logout()}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <LogOut size={16} /> ログアウト
          </button>
        </div>
        <div className="h-1 bg-gray-100">
          <div
            className="h-1 bg-blue-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-20 space-y-6">
        {current && (
          <div>
            <p className="text-xs font-bold text-blue-600 mb-1">
              ステップ {steps.indexOf(current) + 1} / {steps.length}
            </p>
            <p className="text-sm text-gray-600">
              {user.display_name || user.username}{' '}
              さん、アカウントを守るための設定をお願いします。数分で終わります。
            </p>
            {setup.deadline && (
              <p className="mt-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {new Date(setup.deadline).toLocaleString('ja-JP', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                までに設定が済まないと、このアカウントは自動で削除されます。
              </p>
            )}
          </div>
        )}

        <ol className="flex items-center gap-2" aria-label="設定の進み具合">
          {steps.map((k, i) => {
            const done = !setup[k];
            const active = k === current;
            return (
              <li key={k} className="flex items-center gap-2 flex-1 min-w-0">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    done
                      ? 'bg-green-500 text-white'
                      : active
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <Check size={14} /> : i + 1}
                </span>
                <span
                  className={`text-xs font-bold truncate ${active ? 'text-gray-800' : 'text-gray-400'}`}
                >
                  {STEP_LABELS[k]}
                </span>
              </li>
            );
          })}
        </ol>

        {current === 'loginId' && (
          <LoginIdStep userId={user.id} currentId={currentId} onDone={() => void reload()} />
        )}
        {current === 'email' && <EmailStep onDone={reload} />}
        {current === 'mfa' && <MfaStep onDone={() => void reload()} />}

        {!current && (
          <SetupCard
            icon={<PartyPopper size={24} />}
            title="設定が完了しました"
            lead="これでアカウントの安全対策は完了です。設定は、あとから設定画面の「アカウント設定」「パスキー」「認証アプリ」で変えられます。"
          >
            <div className="space-y-3">
              <p className="text-sm bg-blue-50 text-blue-800 rounded-xl p-4">
                次からのログインには、ユーザーID「
                <span className="font-bold font-mono">{currentId}</span>
                」を使ってください。
              </p>
              <button type="button" onClick={() => void refreshUser()} className={primaryButton}>
                はじめる
              </button>
            </div>
          </SetupCard>
        )}
      </main>
    </div>
  );
}
