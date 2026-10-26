import { useState } from 'react';
import { ChevronDown, LifeBuoy } from 'lucide-react';

const SUPPORT_EMAIL = 'support@payroll.warionate.com';

/**
 * 二段階認証の手段を使えないときの案内（ログイン画面で、困っているその場に出す）。
 * - totp: 認証アプリのコードを入力できない（スマホを失くした・機種変更した）
 * - passkey: パスキー・Authentik が使えないのに、パスワードだけのログインを断られた
 */
export default function LostFactorHelp({
  variant,
  defaultOpen = false,
}: {
  variant: 'totp' | 'passkey';
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 font-bold text-gray-600 hover:text-gray-800"
      >
        <span className="flex items-center gap-2">
          <LifeBuoy size={16} />
          {variant === 'totp' ? 'コードを入力できない場合' : 'パスキーを使えない場合'}
        </span>
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-gray-600 leading-relaxed">
          {variant === 'totp' ? (
            <>
              <p>
                <strong>回復コード</strong>（認証アプリを登録したときに控えた xxxx-xxxx
                の形のコード）を、6 桁のコードの代わりに入力してください。各コードは 1
                回だけ使えます。
              </p>
              <p>
                ログインできたら、<strong>設定 › 二段階認証</strong>{' '}
                で認証アプリを解除し、新しいスマホで登録し直してください。
              </p>
            </>
          ) : (
            <>
              <p>
                iCloud キーチェーンや Google
                パスワードマネージャーに保存されたパスキーは、同じアカウントでログインした新しい端末でもそのまま使えます。ログイン画面の「パスキー」ボタンから試してください。
              </p>
              <p>
                認証アプリも登録している場合は、パスワードのあとに 6
                桁のコード（または回復コード）でログインできます。
              </p>
            </>
          )}
          <p>
            どの方法でもログインできない場合は、管理者に連絡してください。本人確認のうえ、二段階認証をリセットします（パスワードを忘れた場合は、先に「パスワードを忘れた方」から再設定してください）。
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-blue-600 hover:underline">
              {SUPPORT_EMAIL}
            </a>
            <a href="/guide#help-faq" className="font-bold text-blue-600 hover:underline">
              よくある質問
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
