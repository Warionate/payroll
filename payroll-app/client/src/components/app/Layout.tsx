import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router';
import {
  Home,
  Calendar,
  Settings,
  History,
  LogOut,
  Users,
  HelpCircle,
  WifiOff,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { LucideIcon } from 'lucide-react';

interface NavItemProps {
  to?: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}

function NavItem({ to, icon: IconComponent, label, onClick }: NavItemProps) {
  const Icon = IconComponent;
  const location = useLocation();
  const isActive = to != null ? location.pathname === to : false;

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="flex-1 flex flex-col items-center justify-center py-3 text-xs font-medium transition-colors text-gray-500 hover:text-red-500 relative"
      >
        <div className="p-1 rounded-full mb-1 text-gray-500 relative">
          <Icon size={24} />
        </div>
        <span>{label}</span>
      </button>
    );
  }

  return (
    <Link
      to={to!}
      aria-current={isActive ? 'page' : undefined}
      className="flex-1 flex flex-col items-center justify-center py-3 text-xs font-medium transition-colors relative"
    >
      <div
        className={clsx(
          'p-1 rounded-full mb-1 relative transition-colors',
          isActive ? 'bg-primary-100 text-primary-600' : 'text-gray-500',
        )}
      >
        <Icon size={24} />
      </div>
      <span className={clsx('transition-colors', isActive ? 'text-primary-600' : 'text-gray-500')}>
        {label}
      </span>
    </Link>
  );
}

import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import BroadcastOnOpenModal from './BroadcastOnOpenModal';
import AnnouncementBell from './AnnouncementBell';

export default function Layout() {
  const { user } = useAuth();

  // アナウンスは polling（useBroadcasts / useUnreadBroadcastCount）+ Web Push で
  // 更新される。WebSocket は G 章で撤去済み。

  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isOnline = useOnlineStatus();

  const handleLogout = async () => {
    // 連打で logout API が複数走るのを防ぐ。
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    // Await so the server's Set-Cookie clear headers are applied before
    // navigation. Otherwise the new page load may still carry the old
    // session cookies and end up in a confused state (especially when
    // immediately logging in as a different account).
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50/50 overflow-hidden">
      {/* オフラインバナー */}
      {!isOnline && (
        <div className="bg-amber-500 text-white text-xs font-bold text-center py-1.5 px-4 shrink-0 flex items-center justify-center gap-1.5">
          <WifiOff size={14} />
          オフラインです — 最後に取得したデータを表示しています
        </div>
      )}
      {/* ヘッダー (Flexアイテムとして配置) */}
      <header className="glass z-20 shrink-0 sticky top-0">
        <div className="w-full max-w-7xl mx-auto flex justify-between px-6 py-4 items-center">
          <h1 className="font-bold text-xl text-gray-800 flex items-center gap-2">
            <img src="/logo-header.svg" alt="Payroll App" className="h-8" />
          </h1>
          <div className="hidden md:flex items-center space-x-6 lg:space-x-8">
            <Link
              to="/"
              className="text-gray-600 hover:text-primary-600 font-bold transition-colors"
            >
              ホーム
            </Link>
            <Link
              to="/calendar"
              className="text-gray-600 hover:text-primary-600 font-bold transition-colors"
            >
              入力
            </Link>
            <Link
              to="/history"
              className="text-gray-600 hover:text-primary-600 font-bold transition-colors"
            >
              履歴
            </Link>
            <Link
              to="/settings"
              className="text-gray-600 hover:text-primary-600 font-bold transition-colors"
            >
              設定
            </Link>
            <Link
              to="/help"
              className="text-gray-600 hover:text-primary-600 font-bold transition-colors"
            >
              ヘルプ
            </Link>
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className="text-gray-600 hover:text-primary-600 font-bold transition-colors"
              >
                管理
              </Link>
            )}
            <div className="flex items-center gap-4 ml-4 border-l border-gray-200 pl-4">
              <AnnouncementBell variant="desktop" size={20} />
              <span className="text-sm text-gray-500">{user?.display_name || user?.username}</span>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Logout"
                aria-label="ログアウト"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
          <div className="md:hidden flex items-center">
            <span className="text-sm text-gray-500 mr-2">
              {user?.display_name || user?.username}
            </span>
            <AnnouncementBell variant="mobile" size={24} />
            <Link
              to="/help"
              className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="ヘルプ"
            >
              <HelpCircle size={24} />
            </Link>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="ログアウト"
            >
              <LogOut size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* メインコンテンツエリア (スクロールは各ページで制御) */}
      <main className="flex-1 min-h-0 overflow-hidden relative">
        <div className="w-full h-full max-w-7xl mx-auto sm:px-6">
          <Outlet />
        </div>
      </main>

      {/* 下部ナビゲーションバー (スマホ・タブレット用 - Flexアイテムとして配置) */}
      <nav
        className="glass border-t-0 flex justify-around pb-safe px-2 w-full md:hidden shrink-0 z-50"
        aria-label="メインナビゲーション"
      >
        <NavItem to="/" icon={Home} label="ホーム" />
        <NavItem to="/calendar" icon={Calendar} label="入力" />
        <NavItem to="/history" icon={History} label="履歴" />
        <NavItem to="/settings" icon={Settings} label="設定" />
        {user?.role === 'admin' && <NavItem to="/admin" icon={Users} label="管理" />}
      </nav>

      <BroadcastOnOpenModal />
    </div>
  );
}
