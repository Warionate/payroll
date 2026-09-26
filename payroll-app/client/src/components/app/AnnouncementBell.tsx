import { Link, useLocation } from 'react-router';
import { Bell } from 'lucide-react';
import clsx from 'clsx';
import { useUnreadBroadcastCount } from '../../hooks/useBroadcasts';

interface AnnouncementBellProps {
  size?: number;
  /** 'mobile' adds a rounded tap target; 'desktop' is a bare icon. */
  variant?: 'desktop' | 'mobile';
}

/**
 * Header entry point to the announcements page. Shows an unread-count badge
 * when there are unread broadcasts; otherwise it is just the bell icon.
 * This is the only always-visible link to `/announcements` (kept low-key per
 * the owner's guidance — announcements are infrequent).
 */
export default function AnnouncementBell({ size = 24, variant = 'mobile' }: AnnouncementBellProps) {
  const location = useLocation();
  const { data: unread = 0 } = useUnreadBroadcastCount();
  const isActive = location.pathname === '/announcements';
  const hasUnread = unread > 0;

  return (
    <Link
      to="/announcements"
      aria-label={hasUnread ? `お知らせ（未読 ${unread} 件）` : 'お知らせ'}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(
        'relative rounded-full transition-colors',
        variant === 'mobile' && 'p-2 hover:bg-gray-100',
        isActive ? 'text-primary-600' : 'text-gray-500 hover:text-primary-600',
      )}
    >
      <Bell size={size} />
      {hasUnread && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
