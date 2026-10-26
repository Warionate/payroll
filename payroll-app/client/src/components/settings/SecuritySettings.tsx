import { useCallback, useEffect, useState } from 'react';
import { History, LogOut, MonitorSmartphone } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { authApi, type LoginSession, type SecurityEvent } from '../../api/auth';
import { useConfirm } from '../../hooks/useConfirm';
import { formatApiError } from '../../utils/apiError';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

const METHOD_LABELS: Record<LoginSession['method'], string> = {
  password: 'パスワード',
  totp: 'パスワード＋認証アプリ',
  passkey: 'パスキー',
  oidc: 'Authentik',
  register: '新規登録',
  legacy: '以前からのログイン',
};

const EVENT_LABELS: Record<string, string> = {
  login: 'ログイン',
  login_failed: 'ログイン失敗',
  login_locked: '失敗が続いたためログインを一時停止',
  admin_mfa_blocked: '管理者のパスワードだけのログインを拒否',
  new_device: '新しい端末からのログイン',
  reauth: '本人確認',
  reauth_failed: '本人確認の失敗',
  session_revoked: '端末をログアウト',
  password_changed: 'パスワード変更',
  password_reset: 'パスワード再設定',
  passkey_added: 'パスキー追加',
  passkey_removed: 'パスキー削除',
  email_verified: 'メールアドレス確認',
  email_removed: 'メールアドレス削除',
  oidc_linked: 'Authentik 連携',
  oidc_unlinked: 'Authentik 連携解除',
  role_changed: '権限の変更',
  totp_enabled: '認証アプリ登録',
  totp_disabled: '認証アプリ解除',
  recovery_codes_regenerated: '回復コードの作り直し',
  recovery_code_used: '回復コードでログイン',
  password_only_blocked: 'パスワードだけのログインを拒否',
  login_id_changed: 'ユーザーID変更',
  mfa_reset: '管理者による二段階認証のリセット',
  device_trusted: 'この端末でコードを求めない設定',
  trusted_devices_cleared: 'コードを求めない端末の解除',
};

// 注意を引きたい出来事（自分でやった覚えがなければ危ないもの）
const WARN_EVENTS = new Set([
  'login_failed',
  'login_locked',
  'admin_mfa_blocked',
  'new_device',
  'reauth_failed',
  'recovery_code_used',
  'password_only_blocked',
  'mfa_reset',
]);

/** User-Agent から「どの端末か」の見当をつける（細かい判定はしない） */
function describeAgent(ua: string | null): string {
  if (!ua) return '不明な端末';
  const os = /iPhone|iPad/.test(ua)
    ? 'iPhone/iPad'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : '不明な OS';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'ブラウザ';
  return `${os} ・ ${browser}`;
}

function eventDetail(e: SecurityEvent): string | null {
  if (e.type === 'login' || e.type === 'login_failed') {
    return e.detail ? (METHOD_LABELS[e.detail as LoginSession['method']] ?? null) : null;
  }
  if (e.type === 'session_revoked') return e.detail === 'others' ? 'ほかの端末すべて' : null;
  if (e.type === 'role_changed') return e.detail;
  return null;
}

/**
 * ログイン中の端末（個別にログアウトできる）と、セキュリティに関わる出来事の記録
 */
export default function SecuritySettings({ part }: { part?: 'sessions' | 'events' } = {}) {
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [showAllEvents, setShowAllEvents] = useState(false);

  const reload = useCallback(() => {
    authApi
      .sessionList()
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions([]));
    authApi
      .securityEvents()
      .then((r) => setEvents(r.events))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleRevoke = async (s: LoginSession) => {
    if (
      !(await confirm({
        title: '端末のログアウト',
        message: `「${describeAgent(s.user_agent)}」をログアウトさせますか？その端末では、もう一度ログインが必要になります。`,
        isDestructive: true,
      }))
    ) {
      return;
    }
    try {
      await authApi.sessionRevoke(s.id);
      toast.success('ログアウトさせました');
      reload();
    } catch (error) {
      toast.error(formatApiError(error, 'ログアウトさせられませんでした'));
    }
  };

  const handleRevokeOthers = async () => {
    if (
      !(await confirm({
        title: 'ほかの端末をすべてログアウト',
        message: 'この端末以外のログインをすべて切ります。よろしいですか？',
        isDestructive: true,
      }))
    ) {
      return;
    }
    try {
      await authApi.sessionRevokeOthers();
      toast.success('ほかの端末をすべてログアウトさせました');
      reload();
    } catch (error) {
      toast.error(formatApiError(error, 'ログアウトさせられませんでした'));
    }
  };

  const shownEvents = showAllEvents ? events : events.slice(0, 10);
  const others = sessions.filter((s) => !s.current);

  return (
    <section className="space-y-6">
      {part !== 'events' && (
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <MonitorSmartphone className="text-blue-600" />
            ログイン中の端末
          </h2>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-4">
            <p className="text-sm text-gray-600">
              ログインは最長 30
              日で切れます。覚えのない端末があれば、ログアウトさせてからパスワードを変更してください。
            </p>
            <ul className="divide-y border rounded-lg">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-gray-800 truncate">
                      {describeAgent(s.user_agent)}
                      {s.current && (
                        <span className="ml-2 text-xs font-bold text-blue-600">この端末</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {METHOD_LABELS[s.method]} ・ 最終利用 {formatDateTime(s.last_used_at)}
                      {s.ip && ` ・ ${s.ip}`}
                    </p>
                  </div>
                  {!s.current && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(s)}
                      className="text-red-500 hover:text-red-700 p-2"
                      aria-label={`${describeAgent(s.user_agent)} をログアウト`}
                    >
                      <LogOut size={18} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {others.length > 0 && (
              <button
                type="button"
                onClick={handleRevokeOthers}
                className="text-sm font-bold text-red-600 hover:text-red-700"
              >
                ほかの端末をすべてログアウト
              </button>
            )}
          </div>
        </div>
      )}

      {part !== 'sessions' && (
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <History className="text-gray-600" />
            セキュリティの記録
          </h2>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-3">
            {events.length === 0 ? (
              <p className="text-sm text-gray-500">まだ記録はありません</p>
            ) : (
              <ul className="divide-y border rounded-lg">
                {shownEvents.map((e) => {
                  const detail = eventDetail(e);
                  return (
                    <li key={e.id} className="p-3">
                      <p
                        className={`text-sm font-bold ${WARN_EVENTS.has(e.type) ? 'text-orange-600' : 'text-gray-800'}`}
                      >
                        {EVENT_LABELS[e.type] ?? e.type}
                        {detail && <span className="font-normal text-gray-500">（{detail}）</span>}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDateTime(e.created_at)}
                        {e.user_agent && ` ・ ${describeAgent(e.user_agent)}`}
                        {e.ip && ` ・ ${e.ip}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {events.length > 10 && !showAllEvents && (
              <button
                type="button"
                onClick={() => setShowAllEvents(true)}
                className="text-sm font-bold text-blue-600 hover:text-blue-700"
              >
                すべて表示（{events.length} 件）
              </button>
            )}
            <p className="text-xs text-gray-400">記録は 180 日間残ります。</p>
          </div>
        </div>
      )}
    </section>
  );
}
