import { useSearchParams } from 'react-router';
import { Megaphone } from 'lucide-react';
import BroadcastList from '../components/broadcast/BroadcastList';

/**
 * Read-only announcements page for all users.
 *
 * Restores the ability for general users to browse the full broadcast history
 * (previously only reachable from the admin dashboard). Supports the
 * `?broadcastId=<id>` deep link used by push notifications: the target
 * announcement opens automatically and is marked read.
 */
export default function Announcements() {
  const [searchParams] = useSearchParams();
  const rawId = searchParams.get('broadcastId');
  const parsed = rawId ? Number(rawId) : NaN;
  const autoOpenId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 w-full mx-auto max-w-2xl">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Megaphone className="text-blue-600" />
        お知らせ
      </h2>
      <BroadcastList readOnly autoOpenId={autoOpenId} />
    </div>
  );
}
