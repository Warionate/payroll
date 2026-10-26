import { useState } from 'react';
import { AtSign, Check, X } from 'lucide-react';
import { loginIdField } from '@payroll/shared';
import { updateUserLoginId } from '../../api/users';
import { formatApiError } from '../../utils/apiError';
import SetupCard from './SetupCard';
import { inputClass, primaryButton } from './setupStyles';

/** 入力しながら満たしているかを見せるルール（サーバのルール LOGIN_ID_PATTERN と同じ内容） */
const RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: '3〜32 文字', test: (v) => v.length >= 3 && v.length <= 32 },
  {
    label: '英小文字・数字・「.」「_」「-」だけ',
    test: (v) => v.length > 0 && /^[a-z0-9._-]+$/.test(v),
  },
  { label: '先頭は英小文字か数字', test: (v) => /^[a-z0-9]/.test(v) },
];

export default function LoginIdStep({
  userId,
  currentId,
  onDone,
}: {
  userId: number;
  currentId: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const normalized = value.trim().toLowerCase();
  const allOk = RULES.every((r) => r.test(normalized));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginIdField.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '使えないユーザーIDです');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateUserLoginId(userId, parsed.data);
      onDone();
    } catch (err) {
      setError(formatApiError(err, 'ユーザーIDを決められませんでした'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SetupCard
      icon={<AtSign size={24} />}
      title="ログインに使うユーザーIDを決めましょう"
      lead={
        <>
          ユーザーIDのルールが変わり、今の「<span className="font-bold">{currentId}</span>
          」は使えなくなりました。次からはここで決めた ID
          でログインします。画面に表示される名前は変わりません。
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="setup-login-id" className="block text-xs font-bold text-gray-500 mb-1">
            ユーザーID
          </label>
          <input
            id="setup-login-id"
            className={`${inputClass} font-mono`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="例: tanaka.taro"
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            maxLength={32}
            autoFocus
          />
        </div>
        <ul className="space-y-1">
          {RULES.map((r) => {
            const ok = r.test(normalized);
            return (
              <li
                key={r.label}
                className={`flex items-center gap-2 text-sm ${ok ? 'text-green-600' : 'text-gray-400'}`}
              >
                {ok ? <Check size={16} /> : <X size={16} />}
                {r.label}
              </li>
            );
          })}
        </ul>
        {value !== normalized && normalized && (
          <p className="text-xs text-gray-500">
            大文字は小文字にして登録します（<span className="font-mono">{normalized}</span>）
          </p>
        )}
        {error && <p className="text-sm text-red-600 font-bold">{error}</p>}
        <button type="submit" disabled={!allOk || busy} className={primaryButton}>
          {busy ? '確認中…' : 'この ID にする'}
        </button>
      </form>
    </SetupCard>
  );
}
