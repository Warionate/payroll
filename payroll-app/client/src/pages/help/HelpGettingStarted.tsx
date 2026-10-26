import {
  BookOpen,
  User,
  ShieldCheck,
  DollarSign,
  Settings,
  Calendar,
  CalendarDays,
  AlertTriangle,
} from 'lucide-react';
import HelpSection, { Path } from './HelpSection';

/** はじめに・アカウント作成とログイン・最初の設定・ホーム・設定画面・勤務入力・カレンダー連携 */
export default function HelpGettingStarted() {
  return (
    <>
      <HelpSection id="intro" icon={BookOpen} iconClass="text-blue-600" title="はじめに">
        <p className="text-gray-600 mb-4">
          本アプリは、個別指導塾の講師アルバイト向けの給与管理システムです。
          複雑な給与体系（コマ給、時給、各種手当）を自動計算し、シフト管理を効率化します。
        </p>
        <div className="bg-blue-50 p-4 rounded-md">
          <h3 className="font-semibold text-blue-800 mb-2">本アプリの特徴</h3>
          <ul className="list-disc list-inside text-blue-700 space-y-1">
            <li>
              <strong>正確な計算</strong>:
              生徒数による単価変動や、日次・授業間手当を自動で適用します。
            </li>
            <li>
              <strong>しっかりした安全対策</strong>:
              給与データは暗号化して保存し、ログインには二段階認証を使います。
            </li>
            <li>
              <strong>スマホ対応</strong>: スマホからでも簡単に入力・確認が可能です。
            </li>
          </ul>
        </div>
      </HelpSection>

      <HelpSection
        id="account"
        icon={User}
        iconClass="text-green-600"
        title="アカウント作成とログイン"
      >
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">新規登録</h3>
            <p className="text-gray-600 mb-2">
              ログイン画面の <Path>新規登録</Path>{' '}
              を開くと、案内に沿って次の順に入力します。最後の確認画面で「アカウントを作成する」を押すまで、何も登録されません。
            </p>
            <ol className="list-decimal list-inside text-gray-600 space-y-2 ml-2">
              <li>
                <strong>表示名とユーザーID</strong>: 表示名は画面に出る名前（日本語可）、ユーザーID
                はログインに使う ID です。ユーザーID は英小文字・数字・「.」「_」「-」の 3〜32
                文字（先頭は英小文字か数字）で、他の人と同じものは使えません。
              </li>
              <li>
                <strong>メールアドレス</strong>: 登録の最後に確認メールが届きます。
              </li>
              <li>
                <strong>パスワード</strong>: 条件は画面に ✓ で表示されます（
                <a href="#help-security" className="text-blue-600 hover:underline">
                  パスワードの条件
                </a>
                ）。
              </li>
              <li>
                <strong>給与単価</strong>:
                今の単価を入力します。分からなければ「あとで設定する」で飛ばせます。
              </li>
            </ol>
            <p className="text-gray-600 mt-2">
              登録が済むと、そのまま <strong>最初の設定</strong>
              （メールアドレスの確認と二段階認証）に進みます。
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">ログイン</h3>
            <p className="text-gray-600 mb-2">ログインのしかたは 2 通りあります。</p>
            <ul className="list-disc list-inside text-gray-600 space-y-2 ml-2">
              <li>
                <strong>パスキーだけで</strong>:
                ログイン画面の「パスキー」ボタンを押し、指紋・顔認証・端末の PIN
                で確認します。ユーザーID もパスワードも入力不要です（パスキーを登録した人）。
              </li>
              <li>
                <strong>ユーザーID とパスワードで</strong>:
                ユーザーID（またはメールアドレス）とパスワードを入れると「本人確認」の画面に進むので、登録している方法でもう一段階確認します。
                <ul className="list-[circle] list-inside ml-5 mt-1 space-y-1">
                  <li>パスキー: 「パスキーで確認」を押す</li>
                  <li>
                    認証アプリ: 表示されている 6 桁のコードを入れる。「この端末では 30
                    日間コードを求めない」にチェックすると、その端末ではしばらく省けます（共用の端末ではチェックしないでください）
                  </li>
                  <li>
                    Authentik: 「Authentik で続ける」を押す。Authentik
                    で二段階認証を使わずにログインした場合は、こちらのパスキーか認証アプリでもう一段階確認します
                  </li>
                </ul>
              </li>
            </ul>
            <p className="text-sm text-gray-500 mt-2">
              ログインは最長 30 日で切れます。切れたら、もう一度ログインしてください。
            </p>
            <div className="mt-3 bg-yellow-50 border-l-4 border-yellow-400 p-4 flex">
              <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" aria-hidden="true" />
              <p className="ml-3 text-sm text-yellow-700">
                <strong>共用 PC をご利用の場合</strong>:
                ブラウザの「パスワードを保存」は使わず、使い終わったら必ずログアウトしてください。
              </p>
            </div>
          </div>
        </div>
      </HelpSection>

      <HelpSection id="setup" icon={ShieldCheck} iconClass="text-blue-600" title="最初の設定">
        <p className="text-gray-600 mb-4">
          アカウントを守るため、次の設定が済むまでは「最初の設定」の画面だけが表示されます。画面の案内に沿って
          1 つずつ進めてください。
        </p>
        <ol className="list-decimal list-inside text-gray-600 space-y-3 ml-2">
          <li>
            <strong>ユーザーID</strong>: ID のルールが変わる前に作ったアカウントで、今の ID
            がルールに合わない場合だけ、新しい ID を決めます。
          </li>
          <li>
            <strong>メールアドレスの確認</strong>:
            届いたメールのリンクを開くと、画面が自動で次に進みます。メールが届かないときは、迷惑メールのフォルダも確認し、画面から送り直してください（リンクの有効期限は
            24 時間）。
          </li>
          <li>
            <strong>二段階認証</strong>: 次のどれか 1 つを登録します。
            <ul className="list-disc list-inside ml-5 mt-1 space-y-1">
              <li>
                <strong>パスキー</strong>（おすすめ）: 端末の指紋・顔認証・PIN
                でログインします。iPhone・Mac は iCloud キーチェーン、Android・Chrome は Google
                パスワードマネージャーに保存され、同じアカウントの端末でも使えます。
              </li>
              <li>
                <strong>認証アプリ</strong>: Google Authenticator・Microsoft Authenticator
                など（iPhone は標準の「パスワード」アプリでも可）。登録の最後に表示される
                <strong>回復コード</strong>は、必ず控えてください。
              </li>
              <li>
                <strong>Authentik 連携</strong>: Authentik のアカウントをお持ちの方向けです。
              </li>
            </ul>
          </li>
        </ol>
        <div className="mt-4 bg-amber-50 border border-amber-200 p-4 rounded-md text-sm text-amber-800">
          新規登録した方は、登録から <strong>7 日以内</strong>
          に最初の設定を済ませてください。期限を過ぎると、アカウントは自動で削除されます（期限は画面に表示されます）。
        </div>
      </HelpSection>

      <HelpSection id="home" icon={DollarSign} iconClass="text-yellow-600" title="ホーム画面の見方">
        <p className="text-gray-600 mb-4">
          ログイン直後のホーム画面（ダッシュボード）では、重要な情報をひと目で確認できます。
        </p>
        <ul className="space-y-3 text-gray-600">
          <li className="flex flex-col sm:flex-row gap-1 sm:gap-2">
            <span className="font-semibold sm:min-w-[140px]">今月の給与概算</span>
            <span>確定分（実績入力済み）と見込み（今後の予定含む）が表示されます。</span>
          </li>
          <li className="flex flex-col sm:flex-row gap-1 sm:gap-2">
            <span className="font-semibold sm:min-w-[140px]">次回の勤務</span>
            <span>直近の勤務予定日時と内容が表示されます。</span>
          </li>
          <li className="flex flex-col sm:flex-row gap-1 sm:gap-2">
            <span className="font-semibold sm:min-w-[140px]">未確定アラート</span>
            <span>
              過去の日付で「保存」されていない予定がある場合に表示されます。計算漏れを防ぐため、速やかに入力してください。
            </span>
          </li>
        </ul>
      </HelpSection>

      <HelpSection id="settings" icon={Settings} iconClass="text-gray-600" title="設定画面の使い方">
        <p className="text-gray-600 mb-4">
          メニューの <Path>設定</Path>{' '}
          を開くと、項目がグループごとに並んでいます。項目を選ぶと、その画面に移ります（スマホでは左上の「‹
          設定」で一覧に戻ります）。
        </p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm text-gray-600 mb-6">
          {(
            [
              ['勤務・給与', '固定シフト、給与単価'],
              ['アカウント', 'プロフィール（表示名・ユーザーID）、メールアドレス、パスワード'],
              ['セキュリティ', '二段階認証、ログイン中の端末、セキュリティの記録'],
              ['アプリ', '外観（ライト・ダーク）、通知、カレンダー連携'],
            ] as const
          ).map(([group, items]) => (
            <div key={group} className="bg-gray-50 p-3 rounded-md">
              <strong className="block text-gray-800 mb-1">{group}</strong>
              {items}
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">給与単価</h3>
            <p className="text-gray-600 mb-2">
              <Path>設定 › 給与単価</Path>{' '}
              で登録します。昇給などで単価が変わる場合は、「新規単価設定を追加」から新しい単価を登録します。
            </p>
            <ul className="list-disc list-inside text-gray-600 ml-2">
              <li>
                <strong>適用開始日</strong>: 新しい単価が適用される日付を指定します。
              </li>
              <li>過去のデータには影響しません（古い単価がそのまま適用されます）。</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">固定シフト</h3>
            <p className="text-gray-600">
              <Path>設定 › 固定シフト</Path>{' '}
              で、「毎週月曜日の1限は必ず授業がある」といったレギュラー授業を登録しておくと、毎月のシフト作成がワンクリックで完了します。
            </p>
          </div>
        </div>
      </HelpSection>

      <HelpSection
        id="work"
        icon={Calendar}
        iconClass="text-indigo-600"
        title="日々の業務（勤務入力）"
      >
        <p className="text-gray-600 mb-4">
          授業が終わったら、その日の勤務実績を入力します。メニューの <Path>入力</Path>{' '}
          （またはホームのカレンダーの日付）から行います。
        </p>

        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-4 h-4 rounded-full bg-blue-500 mt-1 flex-shrink-0"></div>
            <div>
              <span className="font-semibold">青色（確定済み）</span>
              <p className="text-sm text-gray-600">
                実績入力が完了しており、給与計算に含まれています。
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-4 h-4 rounded-full bg-yellow-400 mt-1 flex-shrink-0"></div>
            <div>
              <span className="font-semibold">黄色（予定）</span>
              <p className="text-sm text-gray-600">
                シフトとしては登録されていますが、まだ実績入力されていません（給与計算には含まれません）。
              </p>
            </div>
          </div>

          <div className="mt-4 bg-gray-50 p-4 rounded-md">
            <h3 className="font-semibold text-gray-700 mb-2">入力の手順</h3>
            <ol className="list-decimal list-inside text-gray-600 space-y-1">
              <li>カレンダーの日付をクリック</li>
              <li>実施した授業を選択（または追加）</li>
              <li>生徒数を確認・修正</li>
              <li>
                <strong>「保存」ボタンを押す</strong>（これで確定になります）
              </li>
            </ol>
          </div>
        </div>
      </HelpSection>

      <HelpSection
        id="calendar"
        icon={CalendarDays}
        iconClass="text-purple-600"
        title="カレンダー連携"
      >
        <p className="text-gray-600 mb-4">
          あなたの授業スケジュールを、iPhone のカレンダーや Google カレンダーに自動で表示できます。
        </p>

        <div className="space-y-4">
          <div className="bg-purple-50 p-4 rounded-md">
            <h3 className="font-semibold text-purple-800 mb-2">設定方法</h3>
            <ol className="list-decimal list-inside text-purple-700 space-y-1">
              <li>
                <Path>設定 › カレンダー連携</Path> を開く
              </li>
              <li>
                お使いのカレンダーに合わせてボタンを選択
                <ul className="list-disc list-inside ml-4 mt-1 text-sm">
                  <li>
                    <strong>Apple Calendar</strong>: iPhone / Mac の純正カレンダーに登録
                  </li>
                  <li>
                    <strong>Google Calendar</strong>: Google カレンダーに登録
                  </li>
                </ul>
              </li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mb-2">便利な機能</h3>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>
                <strong>アプリを開く</strong>: カレンダーの予定から、直接このアプリを開けます。
              </li>
              <li>
                <strong>URL のリセット</strong>: URL
                が他人に知られた場合は、同じ画面から作り直せます。
              </li>
            </ul>
            <p className="text-xs text-gray-500 mt-2">
              ※Google カレンダーなどは、反映まで数時間〜1日程度かかる場合があります。
            </p>
          </div>
        </div>
      </HelpSection>
    </>
  );
}
