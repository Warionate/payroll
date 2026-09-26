import { BookOpen, User, DollarSign, Settings, Calendar, AlertTriangle } from 'lucide-react';

/** Sections 1–6: Introduction, Account, Dashboard, Settings, Calendar, Daily Work */
export default function HelpGettingStarted() {
  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <BookOpen className="text-blue-600" size={24} />
            1. はじめに
          </h2>
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
                <strong>高いセキュリティ</strong>: 給与データは暗号化され、他者からは見えません。
              </li>
              <li>
                <strong>スマホ対応</strong>: スマホからでも簡単に入力・確認が可能です。
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <User className="text-green-600" size={24} />
            2. アカウント作成・ログイン
          </h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">2.1 ログイン</h3>
              <p className="text-gray-600">
                アプリにアクセスすると、ログイン画面が表示されます。ユーザー名とパスワードを入力してログインしてください。
              </p>
              <div className="mt-3 bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-yellow-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      <strong>共用PCをご利用の場合</strong>:
                      ブラウザの「パスワードを保存」機能は使用しないことを推奨します。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">2.2 新規登録</h3>
              <p className="text-gray-600 mb-2">
                初めて利用する場合は、「アカウントをお持ちでない方はこちら」をクリックして登録画面へ進みます。
              </p>
              <ol className="list-decimal list-inside text-gray-600 space-y-2 ml-2">
                <li>
                  <strong>ユーザー名</strong>:
                  任意のユーザー名を入力します（他のユーザーと重複できません）。
                </li>
                <li>
                  <strong>パスワード</strong>: 他人に推測されにくいパスワードを設定してください。
                </li>
                <li>
                  <strong>初期給与単価設定</strong>: 現在の給与単価を入力します。
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <DollarSign className="text-yellow-600" size={24} />
            3. ホーム画面の見方
          </h2>
          <p className="text-gray-600 mb-4">
            ログイン直後のホーム画面（ダッシュボード）では、重要な情報をひと目で確認できます。
          </p>
          <ul className="space-y-3 text-gray-600">
            <li className="flex gap-2">
              <span className="font-semibold min-w-[140px]">今月の給与概算:</span>
              <span>確定分（実績入力済み）と見込み（今後の予定含む）が表示されます。</span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold min-w-[140px]">次回の勤務:</span>
              <span>直近の勤務予定日時と内容が表示されます。</span>
            </li>
            <li className="flex gap-2">
              <span className="font-semibold min-w-[140px]">未確定アラート:</span>
              <span>
                過去の日付で「保存」されていない予定がある場合に表示されます。計算漏れを防ぐため、速やかに入力してください。
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Settings className="text-gray-600" size={24} />
            4. 初期設定 (給与単価・固定シフト)
          </h2>
          <p className="text-gray-600 mb-4">
            正確な給与計算と効率的な入力のために、まずは設定を行います。メニューの{' '}
            <strong>「設定」</strong> タブを開いてください。
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                4.1 給与単価の設定 (Wage Rates)
              </h3>
              <p className="text-gray-600 mb-2">
                昇給などで単価が変わる場合は、「新規単価設定を追加」から新しい単価を登録します。
              </p>
              <ul className="list-disc list-inside text-gray-600 ml-2">
                <li>
                  <strong>Start Date (適用開始日)</strong>: 新しい単価が適用される日付を指定します。
                </li>
                <li>過去のデータには影響しません（古い単価がそのまま適用されます）。</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                4.2 固定シフトの設定 (Fixed Shifts)
              </h3>
              <p className="text-gray-600">
                「毎週月曜日の1限は必ず授業がある」といったレギュラー授業を登録しておくと、毎月のシフト作成がワンクリックで完了します。
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="text-purple-600" size={24} />
            5. カレンダー連携 (Calendar Integration)
          </h2>
          <p className="text-gray-600 mb-4">
            あなたの授業スケジュールを、iPhoneカレンダーやGoogleカレンダーに自動同期できます。
          </p>

          <div className="space-y-4">
            <div className="bg-purple-50 p-4 rounded-md">
              <h3 className="font-semibold text-purple-800 mb-2">設定方法</h3>
              <ol className="list-decimal list-inside text-purple-700 space-y-1">
                <li>
                  メニューの <strong>「設定」</strong> を開く
                </li>
                <li>「カレンダー連携」セクションまでスクロール</li>
                <li>
                  お使いのカレンダーに合わせてボタンを選択
                  <ul className="list-disc list-inside ml-4 mt-1 text-sm">
                    <li>
                      <strong>Apple Calendar</strong>: iPhone/Macの純正カレンダーに登録
                    </li>
                    <li>
                      <strong>Google Calendar</strong>: Googleカレンダーに登録
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
                  <strong>URLリセット</strong>: URLが漏洩した場合は、設定画面から再生成できます。
                </li>
              </ul>
              <p className="text-xs text-gray-500 mt-2">
                ※Googleカレンダーなどは、反映まで数時間〜1日程度かかる場合があります。
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="text-indigo-600" size={24} />
            6. 日々の業務 (勤務入力)
          </h2>
          <p className="text-gray-600 mb-4">
            授業が終わったら、その日の勤務実績を入力します。メニューの <strong>「入力」</strong>{' '}
            (またはホームのカレンダー日付クリック) から行います。
          </p>

          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-4 h-4 rounded-full bg-blue-500 mt-1 flex-shrink-0"></div>
              <div>
                <span className="font-semibold">青色 (確定済み)</span>
                <p className="text-sm text-gray-600">
                  実績入力が完了しており、給与計算に含まれています。
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-4 h-4 rounded-full bg-yellow-400 mt-1 flex-shrink-0"></div>
              <div>
                <span className="font-semibold">黄色 (予定)</span>
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
        </div>
      </div>
    </>
  );
}
