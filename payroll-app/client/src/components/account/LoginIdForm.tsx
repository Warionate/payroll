import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { loginIdField, LOGIN_ID_RULE } from '@payroll/shared';
import { useAuth } from '../../contexts/AuthContext';
import { useUserMutation } from '../../hooks/useUsers';
import { formatApiError } from '../../utils/apiError';

/**
 * ユーザー ID（ログインに使う）の変更。設定画面と、最初の設定（ルールより前の ID の人）で使う
 */
export default function LoginIdForm({ onDone }: { onDone?: () => void }) {
  const { user, updateUser } = useAuth();
  const { updateLoginIdMutation } = useUserMutation();
  const [value, setValue] = useState(
    user && /^[a-z0-9][a-z0-9._-]{2,31}$/.test(user.username) ? user.username : '',
  );
  const [error, setError] = useState('');

  if (!user) return null;
  const isMainAdmin = user.username === 'admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginIdField.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '使えないユーザーIDです');
      return;
    }
    setError('');
    try {
      await updateLoginIdMutation.mutateAsync({ id: user.id, username: parsed.data });
      updateUser({ username: parsed.data });
      toast.success('ユーザーIDを変更しました。次からはこの ID でログインしてください');
      onDone?.();
    } catch (err) {
      setError(formatApiError(err, 'ユーザーIDを変更できませんでした'));
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label className="block text-xs font-bold text-gray-400 mb-1" htmlFor="login-id">
        ユーザーID（ログインに使います）
      </label>
      <div className="flex gap-2">
        <input
          id="login-id"
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoComplete="username"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isMainAdmin}
          maxLength={32}
          placeholder="例: tanaka.taro"
          className="flex-1 p-2 border rounded font-bold font-mono disabled:bg-gray-100"
        />
        <button
          type="submit"
          disabled={isMainAdmin || updateLoginIdMutation.isPending}
          className="bg-purple-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-purple-700 disabled:opacity-50"
        >
          変更
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {isMainAdmin ? 'メイン管理者のユーザーIDは変更できません' : LOGIN_ID_RULE}
      </p>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </form>
  );
}
