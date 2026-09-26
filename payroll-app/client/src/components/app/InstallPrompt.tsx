import { useState, useEffect } from 'react';
import { X, Download, Share2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const VISIT_COUNT_KEY = 'visitCount';
const LAST_PROMPT_KEY = 'lastInstallPrompt';
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function readStoredNumber(key: string, fallback = 0): number {
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // localStorage が使えない環境（プライベートモード等）では表示制御のみ諦める
  }
}

function shouldShowInstallPrompt(minVisits: number): boolean {
  const visitCount = readStoredNumber(VISIT_COUNT_KEY);
  const lastPromptAt = readStoredNumber(LAST_PROMPT_KEY);
  const enoughVisits = visitCount >= minVisits;
  const cooldownExpired = lastPromptAt === 0 || Date.now() - lastPromptAt > PROMPT_COOLDOWN_MS;
  return enoughVisits && cooldownExpired;
}

function recordVisit(): void {
  writeStoredNumber(VISIT_COUNT_KEY, readStoredNumber(VISIT_COUNT_KEY) + 1);
}

function recordPromptDecision(): void {
  writeStoredNumber(LAST_PROMPT_KEY, Date.now());
}

/**
 * InstallPrompt - iOS/Android/PC対応版
 * - Android/PC: beforeinstallpromptイベントで自動プロンプト
 * - iOS: 手動インストールガイドを表示
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  // iOS/iPadOS検出（useEffectの外で計算してLintエラー回避）
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isInStandaloneMode =
    'standalone' in window.navigator && Boolean(window.navigator.standalone);

  useEffect(() => {
    // iOS: 既にホーム画面に追加済みなら表示しない
    if (isIOS && isInStandaloneMode) {
      return;
    }

    // iOS: 手動インストールガイドを表示
    if (isIOS) {
      if (shouldShowInstallPrompt(2)) {
        queueMicrotask(() => setShowPrompt(true));
      }

      recordVisit();
      return;
    }

    // Android/PC: PWAインストールプロンプトをキャプチャ
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      if (shouldShowInstallPrompt(3)) {
        setShowPrompt(true);
      }

      recordVisit();
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isIOS, isInStandaloneMode]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      // PWA installed successfully
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
    recordPromptDecision();
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    recordPromptDecision();
  };

  // iOS: 手動インストールガイド表示条件
  if (isIOS && showPrompt) {
    return (
      <div className="fixed bottom-20 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 animate-slide-up">
        <div className="glass p-4 rounded-xl shadow-lg border border-orange-200">
          <div className="flex items-start gap-3">
            <div className="bg-orange-100 p-2 rounded-lg">
              <Share2 className="text-orange-600" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-800 mb-1">アプリをインストール</h3>
              <p className="text-sm text-gray-600 mb-2">
                ホーム画面に追加して、より快適にアクセスできます
              </p>
              <ol className="text-xs text-gray-600 space-y-1 mb-3 pl-4">
                <li className="flex items-start">
                  <span className="mr-1">1.</span>
                  <span className="flex-1">
                    下部の共有ボタン <Share2 size={14} className="inline mx-1" /> をタップ
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-1">2.</span>
                  <span className="flex-1">「ホーム画面に追加」を選択</span>
                </li>
              </ol>
              <button
                onClick={handleDismiss}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-orange-700 transition-colors w-full"
              >
                わかりました
              </button>
            </div>
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="閉じる"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Android/PC: 標準のインストールプロンプト
  if (!showPrompt || (!deferredPrompt && !isIOS)) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 animate-slide-up">
      <div className="glass p-4 rounded-xl shadow-lg border border-orange-200">
        <div className="flex items-start gap-3">
          <div className="bg-orange-100 p-2 rounded-lg">
            <Download className="text-orange-600" size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-800 mb-1">アプリをインストール</h3>
            <p className="text-sm text-gray-600 mb-3">
              ホーム画面に追加して、より快適にアクセスできます
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-orange-700 transition-colors"
              >
                インストール
              </button>
              <button
                onClick={handleDismiss}
                className="text-gray-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-gray-100 transition-colors"
              >
                後で
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="閉じる"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
