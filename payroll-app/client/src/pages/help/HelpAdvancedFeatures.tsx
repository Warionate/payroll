import { Shield, MessageSquare, FileText, FileDown, Bell, Code2 } from 'lucide-react';

/** Sections 7–11: Broadcast, Security, Salary History, Push Notifications, Support */
export default function HelpAdvancedFeatures() {
  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <MessageSquare className="text-pink-600" size={24} />
            7. お知らせ (Broadcast)
          </h2>
          <p className="text-gray-600 mb-4">
            管理者から全ユーザーへのお知らせが届くことがあります。
          </p>

          <div className="space-y-4">
            <div>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>
                  <strong>ポップアップ表示</strong>:
                  「アプリ起動時に表示」設定されたお知らせは、次回アプリを開いたときに自動で表示されます。
                </li>
                <li>
                  <strong>有効期限</strong>:
                  期限付きのお知らせは、期限を過ぎると表示されなくなります。
                </li>
                <li>
                  <strong>カテゴリ</strong>:
                  「重要」「メンテ」「イベント」などのカテゴリで色分けされます。
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Shield className="text-red-600" size={24} />
            8. 安全性とプライバシー
          </h2>
          <p className="text-gray-600 mb-4">
            本アプリは、皆様の重要な個人情報と給与データを守るため、高度なセキュリティ対策を講じています。
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">パスワード要件</h3>
              <div className="bg-red-50 p-4 rounded-md">
                <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                  <li>
                    <strong>文字数</strong>: 8文字以上
                  </li>
                  <li>
                    <strong>文字種</strong>: 英字(A-Z, a-z) と 数字(0-9)または記号 の両方を含む
                  </li>
                  <li>ユーザー名を含むパスワードは使用できません</li>
                  <li>推測されやすいパスワード（password, 123456など）は使用できません</li>
                </ul>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">データの暗号化</h3>
              <p className="text-sm text-gray-600">
                給与単価、勤務実績の金額、手当などの金銭に関わる情報は、全て{' '}
                <strong>AES-256</strong> という強力な方式で暗号化されてデータベースに保存されます。
                管理者であっても中身を見ることはできません。
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <FileText className="text-teal-600" size={24} />
            9. 給与履歴と明細出力
          </h2>
          <p className="text-gray-600 mb-4">
            メニューの <strong>「履歴」</strong> タブから、過去3年分の給与履歴を確認・出力できます。
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">年間サマリー</h3>
              <p className="text-sm text-gray-600">
                画面上部で年度を切り替えると、その年の総収入と内訳（授業給・規定外・手当・調整）が表示されます。
              </p>
            </div>

            <div className="bg-teal-50 p-4 rounded-md">
              <h3 className="font-semibold text-teal-800 mb-2">💰 給与調整機能</h3>
              <p className="text-sm text-teal-700 mb-3">
                実際の振込金額と計算値に差がある場合や、ボーナスなどを記録できます。
              </p>
              <div className="space-y-2 text-sm text-teal-700">
                <p>
                  <strong>調整タイプ:</strong>
                </p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>
                    <strong>インセンティブ</strong>: ボーナス、目標達成報酬など
                  </li>
                  <li>
                    <strong>計算誤差修正</strong>: 実際の振込額との差分を調整
                  </li>
                  <li>
                    <strong>その他</strong>: 上記に該当しない調整
                  </li>
                </ul>
              </div>
              <div className="mt-3 space-y-2 text-sm text-teal-700">
                <p>
                  <strong>入力方式:</strong>
                </p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>
                    <strong>調整額</strong>: 差額を直接入力（+/-切替可能）
                  </li>
                  <li>
                    <strong>最終金額</strong>: 実際に振り込まれた金額を入力 → 差額を自動計算
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-1 bg-gray-50 p-4 rounded-lg">
                <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                  <FileDown size={18} /> CSVダウンロード
                </h3>
                <p className="text-sm text-gray-600">
                  詳細な勤務データ（調整額含む）をCSV形式でダウンロードします。Excelなどで集計や確認を行いたい場合に便利です。
                </p>
              </div>
              <div className="flex-1 bg-gray-50 p-4 rounded-lg">
                <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                  <FileText size={18} /> PDF印刷
                </h3>
                <p className="text-sm text-gray-600">
                  給与明細書形式のPDFを生成します。調整額も反映され、印刷や保存に使えます。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Bell className="text-orange-600" size={24} />
            10. プッシュ通知 (Push Notifications)
          </h2>
          <p className="text-gray-600 mb-4">
            重要なお知らせを見逃さないよう、スマホやPCに通知を送ることができます。
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">設定方法</h3>
              <ol className="list-decimal list-inside text-gray-600 space-y-1">
                <li>
                  メニューの <strong>「設定」</strong> を開きます。
                </li>
                <li>
                  <strong>「プッシュ通知」</strong> セクションにあるスイッチを <strong>ON</strong>{' '}
                  にします。
                </li>
                <li>
                  ブラウザの許可を求めるポップアップが表示されたら、「許可」を選択してください。
                </li>
              </ol>
            </div>

            <div className="bg-orange-50 p-4 rounded-md">
              <h3 className="font-semibold text-orange-800 mb-2">
                iOS (iPhone/iPad) での利用について
              </h3>
              <p className="text-sm text-orange-700 mb-2">
                iPhoneでプッシュ通知を受け取るには、以下の手順が必要です（Safariの仕様）。
              </p>
              <ol className="list-decimal list-inside text-orange-700 text-sm space-y-1">
                <li>Safariでアプリを開く</li>
                <li>画面下部の「共有」アイコン（四角から矢印が出ているアイコン）をタップ</li>
                <li>
                  <strong>「ホーム画面に追加」</strong> を選択して追加
                </li>
                <li>ホーム画面に追加されたアイコンからアプリを起動</li>
                <li>設定画面でプッシュ通知をONにする</li>
              </ol>
            </div>

            <div>
              <h3 className="font-semibold text-gray-700 mb-2">通知の種類と機能</h3>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>
                  <strong>お知らせ (Broadcast)</strong>: 管理者からの一斉送信が届きます。
                </li>
                <li>
                  <strong>未確定アラート</strong>: 入力忘れがある場合に通知されます。
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <MessageSquare className="text-indigo-600" size={24} />
            11. サポート・お問い合わせ
          </h2>
          <p className="text-gray-600 mb-4">
            システムに関する質問や不具合報告は、以下のメールアドレスまで管理者にご連絡ください。
          </p>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-600">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `mailto:Payroll Appサポート <support@payroll.warionate.com>`;
                  }}
                  className="font-bold text-blue-600 hover:text-blue-800 hover:underline transition-colors text-left"
                >
                  support{'@'}payroll.warionate.com
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Code2 className="text-slate-700" size={24} />
            12. 技術情報・ソースコード
          </h2>
          <p className="text-gray-600 mb-4">
            本アプリの技術的な構成と、ソースコード閲覧のご案内です。
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-700 mb-2">バージョン</h3>
              <div className="bg-gray-50 p-3 rounded-md text-sm text-gray-700 font-mono">
                {__APP_VERSION__}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                不具合の問い合わせ時にこのバージョンをお伝えいただくとスムーズです。新バージョンが配信されると、画面右下に「新しいバージョンがあります」と通知が出ます。
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-700 mb-2">技術スタック（抜粋）</h3>
              <div className="grid md:grid-cols-2 gap-3 text-sm text-gray-600">
                <div className="bg-gray-50 p-3 rounded-md">
                  <strong className="block text-gray-800 mb-1">Frontend</strong>
                  React 18 / Vite 7 / Tailwind CSS 4 / TanStack Query
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <strong className="block text-gray-800 mb-1">Backend</strong>
                  Node.js / Express 5 / better-sqlite3 / Drizzle ORM
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <strong className="block text-gray-800 mb-1">共通</strong>
                  TypeScript / Zod / npm workspaces (monorepo)
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <strong className="block text-gray-800 mb-1">Infrastructure</strong>
                  PM2 / Cloudflare Tunnel / Cloudflare Worker
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-md">
              <h3 className="font-semibold text-slate-800 mb-2">ソースコード閲覧のご案内</h3>
              <p className="text-sm text-slate-700 mb-3">
                情報系の学習目的・技術的な興味（アーキテクチャやセキュリティ実装の参考など）でソースコードをご覧になりたい方は、
                管理者宛てにメールでお申し込みください。GitHub
                プライベートリポジトリに招待いたします。
              </p>
              <ul className="text-sm text-slate-700 list-disc list-inside space-y-1">
                <li>
                  お申し込み時に <strong>GitHub のユーザー名</strong> をお知らせください
                </li>
                <li>閲覧目的を一言添えていただけると助かります</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
