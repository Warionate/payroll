import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router';
import {
  AtSign,
  Bell,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Lock,
  Mail,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';
import FixedShiftSettings from '../components/settings/FixedShiftSettings';
import RateSettings from '../components/settings/RateSettings';
import AppearanceSettings from '../components/settings/AppearanceSettings';
import NotificationSettings from '../components/settings/NotificationSettings';
import CalendarSettings from '../components/settings/CalendarSettings';
import AccountSettings from '../components/settings/AccountSettings';
import OidcSettings from '../components/settings/OidcSettings';
import PasskeySettings from '../components/settings/PasskeySettings';
import EmailSettings from '../components/settings/EmailSettings';
import SecuritySettings from '../components/settings/SecuritySettings';
import TotpSettings from '../components/account/TotpSettings';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/auth';
import { useLegalModal } from '../hooks/useLegalModal';

/** 二段階認証の画面（パスキー・認証アプリ・Authentik を1か所に） */
function MfaSettings() {
  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-600">
        パスワードに加えて、手元の端末で本人確認をします。どれか 1 つ以上が必要です。
      </p>
      <PasskeySettings />
      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">認証アプリ</h2>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <TotpSettings />
        </div>
      </section>
      <OidcSettings />
    </div>
  );
}

interface SectionDef {
  key: string;
  title: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /** 一覧で題名の下に出す説明（状態が分かれば状態） */
  hint: string;
  /** 1 つの部品だけを出す画面（部品の見出しはページの見出しと重なるので隠す） */
  single?: boolean;
  danger?: boolean;
  render: () => ReactNode;
}

interface GroupDef {
  title: string;
  sections: SectionDef[];
}

function useStatusHints() {
  const { user } = useAuth();
  const [hints, setHints] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const set = (key: string, value: string) => {
      if (alive) setHints((h) => ({ ...h, [key]: value }));
    };
    authApi
      .emailStatus()
      .then((s) => set('email', s.email ?? (s.pending ? `確認待ち: ${s.pending}` : '未登録')))
      .catch(() => {});
    Promise.all([
      authApi.passkeyList().catch(() => ({ passkeys: [] })),
      authApi.mfaStatus().catch(() => ({ totp: false })),
      authApi.oidcStatus().catch(() => ({ linked: false })),
    ]).then(([pk, mfa, oidc]) => {
      const parts = [
        pk.passkeys.length > 0 ? `パスキー ${pk.passkeys.length} 件` : null,
        mfa.totp ? '認証アプリ' : null,
        oidc.linked ? 'Authentik' : null,
      ].filter(Boolean);
      set('mfa', parts.length ? `${parts.join('・')}で保護中` : '未設定');
    });
    authApi
      .sessionList()
      .then((r) => set('devices', `${r.sessions.length} 台でログイン中`))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return {
    ...hints,
    profile: user ? `${user.display_name || user.username} ・ ${user.username}` : '',
  };
}

function buildGroups(hints: Record<string, string>): GroupDef[] {
  return [
    {
      title: '勤務・給与',
      sections: [
        {
          key: 'shifts',
          title: '固定シフト',
          icon: CalendarRange,
          hint: '毎週決まっている授業のコマ',
          single: true,
          render: () => <FixedShiftSettings />,
        },
        {
          key: 'rates',
          title: '給与単価',
          icon: Wallet,
          hint: '指導人数ごとの単価・手当',
          single: true,
          render: () => <RateSettings />,
        },
      ],
    },
    {
      title: 'アカウント',
      sections: [
        {
          key: 'profile',
          title: 'プロフィール',
          icon: AtSign,
          hint: hints.profile || '表示名・ユーザーID',
          single: true,
          render: () => <AccountSettings part="profile" />,
        },
        {
          key: 'email',
          title: 'メールアドレス',
          icon: Mail,
          hint: hints.email ?? 'パスワードの再設定・お知らせに使います',
          single: true,
          render: () => <EmailSettings />,
        },
        {
          key: 'password',
          title: 'パスワード',
          icon: Lock,
          hint: 'パスワードの変更',
          single: true,
          render: () => <AccountSettings part="password" />,
        },
      ],
    },
    {
      title: 'セキュリティ',
      sections: [
        {
          key: 'security',
          title: '二段階認証',
          icon: ShieldCheck,
          hint: hints.mfa ?? 'パスキー・認証アプリ・Authentik',
          render: () => <MfaSettings />,
        },
        {
          key: 'devices',
          title: 'ログイン中の端末',
          icon: MonitorSmartphone,
          hint: hints.devices ?? '端末ごとにログアウト',
          single: true,
          render: () => <SecuritySettings part="sessions" />,
        },
        {
          key: 'activity',
          title: 'セキュリティの記録',
          icon: History,
          hint: 'ログインやパスワード変更の履歴',
          single: true,
          render: () => <SecuritySettings part="events" />,
        },
      ],
    },
    {
      title: 'アプリ',
      sections: [
        {
          key: 'appearance',
          title: '外観',
          icon: Palette,
          hint: 'ライト・ダーク',
          single: true,
          render: () => <AppearanceSettings />,
        },
        {
          key: 'notifications',
          title: '通知',
          icon: Bell,
          hint: 'プッシュ通知',
          single: true,
          render: () => <NotificationSettings />,
        },
        {
          key: 'calendar',
          title: 'カレンダー連携',
          icon: CalendarDays,
          hint: 'Google カレンダー等に予定を表示',
          single: true,
          render: () => <CalendarSettings />,
        },
      ],
    },
    {
      title: 'その他',
      sections: [
        {
          key: 'delete',
          title: 'アカウントの削除',
          icon: Trash2,
          hint: 'すべてのデータを削除します',
          single: true,
          danger: true,
          render: () => <AccountSettings part="delete" />,
        },
      ],
    },
  ];
}

function SectionRow({ section, active }: { section: SectionDef; active: boolean }) {
  const Icon = section.icon;
  return (
    <Link
      to={`/settings/${section.key}`}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
        active ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
    >
      <span
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          section.danger ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'
        }`}
      >
        <Icon size={18} />
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={`block text-sm font-bold ${section.danger ? 'text-red-600' : 'text-gray-800'}`}
        >
          {section.title}
        </span>
        <span className="block text-xs text-gray-500 truncate">{section.hint}</span>
      </span>
      <ChevronRight size={18} className="text-gray-300 shrink-0" />
    </Link>
  );
}

function SectionList({ groups, activeKey }: { groups: GroupDef[]; activeKey?: string }) {
  const legal = useLegalModal();
  return (
    <nav className="space-y-6" aria-label="設定の項目">
      {groups.map((g) => (
        <div key={g.title}>
          <h2 className="text-xs font-bold text-gray-500 px-1 mb-2">{g.title}</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
            {g.sections.map((s) => (
              <SectionRow key={s.key} section={s} active={s.key === activeKey} />
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500 pt-2">
        <button
          type="button"
          onClick={() => legal.open('terms')}
          className="flex items-center gap-1 hover:text-blue-600"
        >
          <FileText size={14} /> 利用規約
        </button>
        <button
          type="button"
          onClick={() => legal.open('privacy')}
          className="flex items-center gap-1 hover:text-blue-600"
        >
          <FileText size={14} /> プライバシーポリシー
        </button>
      </div>
      {legal.modal}
    </nav>
  );
}

/**
 * 設定。トップはグループ分けした項目の一覧で、項目ごとの画面に入る（/settings/:section）。
 * 広い画面では左に一覧、右に中身の2列にする。
 */
export default function Settings() {
  const { section: sectionKey } = useParams();
  const location = useLocation();
  const hints = useStatusHints();
  const groups = buildGroups(hints);
  const all = groups.flatMap((g) => g.sections);
  const current = all.find((s) => s.key === sectionKey);

  // Authentik との連携から戻ってきた（サーバが /settings?oidc=... で返す旧形式）は二段階認証の画面へ
  if (!sectionKey && new URLSearchParams(location.search).has('oidc')) {
    return <Navigate to={`/settings/security${location.search}`} replace />;
  }
  if (sectionKey && !current) return <Navigate to="/settings" replace />;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 pb-24 lg:flex lg:gap-8">
        {/* 一覧（スマホでは項目を開いていないときだけ） */}
        <aside className={`${current ? 'hidden lg:block' : ''} lg:w-80 lg:shrink-0`}>
          <h1 className="text-2xl font-bold text-gray-800 mb-6">設定</h1>
          <SectionList groups={groups} activeKey={current?.key} />
        </aside>

        {/* 中身 */}
        <main className={`${current ? '' : 'hidden lg:block'} flex-1 min-w-0`}>
          {current ? (
            <>
              <Link
                to="/settings"
                className="lg:hidden flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-gray-700 mb-3"
              >
                <ChevronLeft size={18} /> 設定
              </Link>
              <h1 className="text-2xl font-bold text-gray-800 mb-6 lg:mt-0">{current.title}</h1>
              <div className={current.single ? 'settings-single' : ''}>{current.render()}</div>
            </>
          ) : (
            <div className="hidden lg:flex h-64 items-center justify-center text-gray-400 text-sm">
              左の一覧から項目を選んでください
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
