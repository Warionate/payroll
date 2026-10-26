import { Shield, LifeBuoy } from 'lucide-react';
import HelpSection, { Path } from './HelpSection';

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'パスワードを忘れた',
    a: (
      <>
        ログイン画面の「パスワードを忘れた方」から、登録したメールアドレスに再設定のリンクを送れます（有効期限
        30
        分）。再設定すると、すべての端末でログインし直しになります。メールアドレスの確認が済んでいない場合は、管理者に連絡してください。
      </>
    ),
  },
  {
    q: 'スマホを失くした・機種変更した（認証アプリ）',
    a: (
      <>
        6 桁のコードの代わりに、控えておいた<strong>回復コード</strong>
        （xxxx-xxxx）でログインできます（各コード 1 回だけ）。ログインしたら、
        <Path>設定 › 二段階認証</Path>{' '}
        で認証アプリを解除してから、新しいスマホで登録し直してください。回復コードも失くした場合は、管理者に連絡してください（本人確認のうえ、二段階認証をリセットします）。
      </>
    ),
  },
  {
    q: 'スマホを失くした・機種変更した（パスキー）',
    a: (
      <>
        iCloud キーチェーンや Google
        パスワードマネージャーに保存されたパスキーは、同じアカウントでログインした新しい端末でもそのまま使えます。使えない場合は、別の端末やパスワード＋認証アプリでログインし、
        <Path>設定 › 二段階認証</Path>{' '}
        で古いパスキーを削除して新しく登録してください。どの方法でもログインできない場合は、管理者に連絡してください（本人確認のうえ、二段階認証をリセットします）。
      </>
    ),
  },
  {
    q: 'どの方法でもログインできない（二段階認証の手段を全部失くした）',
    a: (
      <>
        管理者に連絡してください（support@payroll.warionate.com）。電話や対面などで本人確認をしたうえで、二段階認証をリセットします。リセットされたら、パスワードでログインして二段階認証を登録し直してください。パスワードも忘れている場合は、先にログイン画面の「パスワードを忘れた方」から再設定してください。
      </>
    ),
  },
  {
    q: '見覚えのないログインのお知らせが届いた',
    a: (
      <>
        すぐにパスワードを変更し（<Path>設定 › パスワード</Path>）、
        <Path>設定 › ログイン中の端末</Path>{' '}
        で覚えのない端末をログアウトさせてください。そのうえで管理者に連絡してください。
      </>
    ),
  },
  {
    q: '確認メールが届かない',
    a: (
      <>
        迷惑メールのフォルダを確認してください。それでも届かないときは、アドレスに誤りがないか確かめて、画面から送り直してください。
      </>
    ),
  },
  {
    q: '「パスワードが流出しています」と表示された',
    a: (
      <>
        過去にどこかのサービスから流出したことのあるパスワードです（あなたのアカウントから漏れたという意味ではありません）。他人に試されやすいので、別のパスワードにしてください。
      </>
    ),
  },
  {
    q: 'ログインが「失敗が続いたため止めています」と表示された',
    a: (
      <>
        パスワードやコードの入力に何度も失敗したため、15
        分間ログインを止めています。時間をおいてやり直してください。心当たりがない場合は、管理者に連絡してください。
      </>
    ),
  },
];

/** アカウントの安全・困ったとき */
export default function HelpSecurity() {
  return (
    <>
      <HelpSection id="security" icon={Shield} iconClass="text-red-600" title="アカウントの安全">
        <p className="text-gray-600 mb-4">
          本アプリは、皆様の個人情報と給与データを守るため、次の対策を取っています。
        </p>

        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="font-semibold text-gray-700 mb-2">二段階認証</h3>
              <p className="text-sm text-gray-600">
                パスワードに加えて、パスキー・認証アプリ・Authentik
                のどれかで本人確認をします。パスワードが漏れても、他人はログインできません。
                <Path>設定 › 二段階認証</Path> で追加・変更できます（最後の 1 つは外せません）。
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="font-semibold text-gray-700 mb-2">ログイン中の端末</h3>
              <p className="text-sm text-gray-600">
                <Path>設定 › ログイン中の端末</Path>{' '}
                で、今ログインしている端末を確認し、端末ごとにログアウトさせられます。ログインは最長
                30 日で切れます。
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="font-semibold text-gray-700 mb-2">セキュリティの記録とお知らせ</h3>
              <p className="text-sm text-gray-600">
                ログインやパスワード変更などの履歴を <Path>設定 › セキュリティの記録</Path>{' '}
                で見られます（180
                日間）。新しい端末からログインがあると、登録したメールアドレスにお知らせが届きます。
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-md">
              <h3 className="font-semibold text-gray-700 mb-2">大事な操作の前の確認</h3>
              <p className="text-sm text-gray-600">
                メールアドレスや二段階認証を変えるときは、ログインから時間がたっていると、パスワードの再入力を求めます。
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">パスワードの条件</h3>
              <div className="bg-red-50 p-4 rounded-md">
                <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                  <li>8 文字以上</li>
                  <li>英字と、数字または記号の両方を含む</li>
                  <li>ユーザーID を含まない</li>
                  <li>推測されやすいもの（password, 123456 など）は使えない</li>
                  <li>過去の情報漏洩で流出したことのあるものは使えない</li>
                </ul>
                <p className="text-xs text-gray-500 mt-2">
                  ほかのサービスと同じパスワードは使わないでください。
                </p>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">データの暗号化</h3>
              <p className="text-sm text-gray-600">
                給与単価、勤務実績の金額、手当などの金銭に関わる情報は、<strong>AES-256</strong>{' '}
                で暗号化してデータベースに保存しています。パスワードは元に戻せない形（Argon2id）で保存しています。アプリの管理画面からも、他の人の金額は見えません。
              </p>
            </div>
          </div>
        </div>
      </HelpSection>

      <HelpSection
        id="faq"
        icon={LifeBuoy}
        iconClass="text-sky-600"
        title="困ったとき（よくある質問）"
      >
        <div className="divide-y border rounded-lg">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group p-4">
              <summary className="font-semibold text-gray-800 cursor-pointer list-none flex items-center justify-between gap-3">
                {q}
                <span className="text-gray-400 group-open:rotate-90 transition-transform">›</span>
              </summary>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </HelpSection>
    </>
  );
}
