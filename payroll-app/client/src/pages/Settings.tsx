import FixedShiftSettings from '../components/settings/FixedShiftSettings';
import RateSettings from '../components/settings/RateSettings';
import AppearanceSettings from '../components/settings/AppearanceSettings';
import NotificationSettings from '../components/settings/NotificationSettings';
import CalendarSettings from '../components/settings/CalendarSettings';
import AccountSettings from '../components/settings/AccountSettings';
import OidcSettings from '../components/settings/OidcSettings';
import PasskeySettings from '../components/settings/PasskeySettings';
import EmailSettings from '../components/settings/EmailSettings';
import LegalModal from '../components/common/LegalModal';
import { useState } from 'react';

export default function Settings() {
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-8 pb-20 p-4">
        <h1 className="text-2xl font-bold text-gray-800">設定</h1>

        {/* 固定シフト設定 */}
        <FixedShiftSettings />

        {/* 給与単価設定 */}
        <RateSettings />

        <hr className="border-gray-200" />

        {/* 外観（テーマ） */}
        <AppearanceSettings />

        <hr className="border-gray-200" />

        {/* 通知設定 */}
        <NotificationSettings />

        <hr className="border-gray-200" />

        {/* カレンダー連携 */}
        <CalendarSettings />

        <hr className="border-gray-200" />

        {/* アカウント設定 */}
        <AccountSettings />

        {/* メールアドレス（サーバでメール送信が有効なときだけ表示される） */}
        <EmailSettings />

        {/* パスキー（サーバで有効かつブラウザが対応しているときだけ表示される） */}
        <PasskeySettings />

        {/* Authentik 連携（サーバで OIDC が有効なときだけ表示される） */}
        <OidcSettings />

        <div className="pt-8 mt-4 border-t border-gray-200">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
            <button
              type="button"
              onClick={() => setActiveModal('terms')}
              className="hover:text-blue-600 transition-colors"
            >
              利用規約
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('privacy')}
              className="hover:text-blue-600 transition-colors"
            >
              プライバシーポリシー
            </button>
          </div>
        </div>
      </div>

      <LegalModal activeModal={activeModal} onClose={() => setActiveModal(null)} />
    </div>
  );
}
