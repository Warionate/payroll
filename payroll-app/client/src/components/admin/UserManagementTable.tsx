import { Trash2, Users, Lock, UserCog, ShieldOff } from 'lucide-react';
import SkeletonRow from '../loading/SkeletonRow';
import AdminBadge from '../common/AdminBadge';
import { parseSQLDate } from '../../utils/dateUtils';
import type { User } from '../../types';

interface Props {
  users: User[];
  isLoading: boolean;
  currentUser: User;
  onDeleteUser: (id: number) => void;
  onUpdateRole: (user: User) => void;
  onOpenResetModal: (id: number, username: string) => void;
  onResetMfa: (user: User) => void;
}

export default function UserManagementTable({
  users,
  isLoading,
  currentUser,
  onDeleteUser,
  onUpdateRole,
  onOpenResetModal,
  onResetMfa,
}: Props) {
  return (
    <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-700">
        <Users size={20} /> ユーザー一覧
      </h2>
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="py-4">
            <SkeletonRow count={5} />
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 font-bold text-gray-600">ID</th>
                <th className="text-left py-3 px-4 font-bold text-gray-600">ユーザー名</th>
                <th className="text-left py-3 px-4 font-bold text-gray-600">権限</th>
                <th className="text-left py-3 px-4 font-bold text-gray-600">登録日</th>
                <th className="text-left py-3 px-4 font-bold text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">{u.id}</td>
                  <td className="py-3 px-4 font-bold">
                    <span className="inline-flex items-center gap-1">
                      {u.display_name || u.username}
                      {u.role === 'admin' && <AdminBadge size={14} />}
                    </span>
                    <span className="block text-xs font-normal font-mono text-gray-400">
                      {u.username}
                    </span>
                    {u.setup && (u.setup.email || u.setup.mfa || u.setup.loginId) && (
                      <span
                        className="mt-1 inline-block text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
                        title="最初の設定が済んでいません"
                      >
                        設定がまだ：
                        {[
                          u.setup.loginId && 'ID',
                          u.setup.email && 'メール',
                          u.setup.mfa && '二段階',
                        ]
                          .filter(Boolean)
                          .join('・')}
                        {u.setup_deadline &&
                          `（${new Date(u.setup_deadline).toLocaleDateString('ja-JP', {
                            month: 'numeric',
                            day: 'numeric',
                          })} に自動削除）`}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}
                    >
                      {u.role === 'admin' ? '管理者' : '一般'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500">
                    {parseSQLDate(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 flex gap-2">
                    {u.username !== 'admin' && (
                      <button
                        onClick={() => onUpdateRole(u)}
                        className="text-gray-400 hover:text-purple-600 transition-colors btn-interactive min-w-[32px] min-h-[32px] flex items-center justify-center pt-1"
                        title={u.role === 'admin' ? '一般に変更' : '管理者に変更'}
                        aria-label={`${u.username}の権限を${u.role === 'admin' ? '一般' : '管理者'}に変更`}
                      >
                        <UserCog size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => onOpenResetModal(u.id, u.username)}
                      className="text-gray-400 hover:text-blue-500 transition-colors btn-interactive min-w-[32px] min-h-[32px] flex items-center justify-center pt-1"
                      title="パスワード変更"
                      aria-label={`${u.username}のパスワードを変更`}
                    >
                      <Lock size={18} />
                    </button>
                    {u.id !== currentUser.id && u.role !== 'admin' && (
                      <button
                        onClick={() => onResetMfa(u)}
                        className="text-gray-400 hover:text-amber-600 transition-colors btn-interactive min-w-[32px] min-h-[32px] flex items-center justify-center pt-1"
                        title="二段階認証をリセット"
                        aria-label={`${u.username}の二段階認証をリセット`}
                      >
                        <ShieldOff size={18} />
                      </button>
                    )}
                    {u.id !== currentUser.id && u.username !== 'admin' && (
                      <button
                        onClick={() => onDeleteUser(u.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors btn-interactive min-w-[32px] min-h-[32px] flex items-center justify-center pt-1"
                        title="ユーザー削除"
                        aria-label={`${u.username}を削除`}
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
