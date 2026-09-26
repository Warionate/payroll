import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Send,
  Info,
  AlertCircle,
  Wrench,
  Calendar as CalendarIcon,
  Radio,
  Eye,
  EyeOff,
  HelpCircle,
  Maximize2,
  X,
} from 'lucide-react';
import { chatApi } from '../../api/chat';
import { formatApiError } from '../../utils/apiError';
import { useConfirm } from '../../hooks/useConfirm';
import MarkdownContent from '../common/MarkdownContent';
import MarkdownToolbar from '../common/MarkdownToolbar';

const MESSAGE_MAX_LENGTH = 10000;

const CATEGORIES = [
  {
    id: 'general',
    label: 'お知らせ',
    icon: Info,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  {
    id: 'important',
    label: '重要',
    icon: AlertCircle,
    color: 'bg-red-100 text-red-700 border-red-200',
  },
  {
    id: 'maintenance',
    label: 'メンテ',
    icon: Wrench,
    color: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  {
    id: 'event',
    label: 'イベント',
    icon: CalendarIcon,
    color: 'bg-green-100 text-green-700 border-green-200',
  },
];

export default function BroadcastForm() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [category, setCategory] = useState('general');
  const [sendPush, setSendPush] = useState(true);
  const [showOnOpen, setShowOnOpen] = useState(false);

  const [isPreview, setIsPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const broadcastMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      message: string;
      category: string;
      expires_at?: string | null;
      send_push?: boolean;
      show_on_open?: boolean;
    }) => {
      await chatApi.createBroadcast(data);
    },
    onSuccess: () => {
      toast.success('全員に送信しました');
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      setMessage('');
      setTitle('');
      setExpiresAt('');
      setCategory('general');
      setSendPush(true);
      setShowOnOpen(false);
    },
    onError: (error: unknown) => {
      console.error('Broadcast failed:', error);
      toast.error(formatApiError(error, '送信に失敗しました'));
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await confirm({
      title: '送信確認',
      message: '全ユーザーにお知らせを送信しますか？\nこの操作は取り消せません。',
      isDestructive: true,
      confirmLabel: '送信実行',
    });
    if (!ok) return;
    broadcastMutation.mutate({
      message,
      title,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      category,
      send_push: sendPush,
      show_on_open: showOnOpen,
    });
  };

  const isPending = broadcastMutation.isPending;
  const isOverLimit = message.length > MESSAGE_MAX_LENGTH;

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2 mb-1">
            <Radio className="text-red-600" size={24} />
            お知らせ一斉送信
          </h2>
          <p className="text-sm text-gray-500 mb-6">全ユーザーに同じメッセージを送信します。</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">カテゴリ</label>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm font-bold transition-colors ${
                      category === cat.id
                        ? cat.color + ' ring-2 ring-offset-1 ring-gray-300'
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <cat.icon size={14} />
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">タイトル (任意)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2 border rounded-lg"
                placeholder="例: システムメンテナンスについて"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-bold text-gray-700 flex items-center gap-1">
                  メッセージ
                  <span className="text-xs font-normal text-blue-600">(Markdown対応)</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowHelp(!showHelp)}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    <HelpCircle size={14} />
                    書き方
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(true)}
                    className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                  >
                    <Maximize2 size={14} />
                    全画面
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPreview(!isPreview)}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    {isPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                    {isPreview ? '編集' : 'プレビュー'}
                  </button>
                </div>
              </div>

              {showHelp && (
                <div className="mb-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 border">
                  <p className="font-bold mb-1">Markdown記法:</p>
                  <div className="grid grid-cols-2 gap-1">
                    <span>
                      <code className="bg-gray-200 px-1 rounded">**太字**</code> →{' '}
                      <strong>太字</strong>
                    </span>
                    <span>
                      <code className="bg-gray-200 px-1 rounded">*斜体*</code> → <em>斜体</em>
                    </span>
                    <span>
                      <code className="bg-gray-200 px-1 rounded">## 見出し</code> → 見出し
                    </span>
                    <span>
                      <code className="bg-gray-200 px-1 rounded">- リスト</code> → • リスト
                    </span>
                    <span className="col-span-2">
                      <code className="bg-gray-200 px-1 rounded">[リンク](URL)</code> →
                      クリック可能なリンク
                    </span>
                    <span className="col-span-2">
                      <code className="bg-gray-200 px-1 rounded">![画像](URL)</code> → 画像を表示
                    </span>
                  </div>
                </div>
              )}

              {isPreview ? (
                <div className="w-full p-4 border rounded-xl bg-gray-50 min-h-32">
                  {message ? (
                    <MarkdownContent content={message} className="text-gray-700" />
                  ) : (
                    <p className="text-gray-400 italic">プレビューする内容がありません</p>
                  )}
                </div>
              ) : (
                <div>
                  <MarkdownToolbar textareaRef={textareaRef} onInsert={setMessage} />
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className={`w-full p-4 border rounded-xl h-32 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none font-mono text-sm ${
                      isOverLimit ? 'border-red-500' : ''
                    }`}
                    placeholder="メッセージを入力...&#10;&#10;ツールバーのボタンで書式を挿入できます"
                    required
                  />
                  <div className="flex justify-between items-center mt-1">
                    <div>
                      {isOverLimit && (
                        <p className="text-xs text-red-600 font-bold">
                          ⚠️ 文字数制限を超えています
                        </p>
                      )}
                    </div>
                    <p
                      className={`text-xs ${
                        isOverLimit
                          ? 'text-red-600 font-bold'
                          : message.length > 9000
                            ? 'text-orange-600'
                            : 'text-gray-500'
                      }`}
                    >
                      {message.length.toLocaleString()} / {MESSAGE_MAX_LENGTH.toLocaleString()}文字
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">有効期限 (任意)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full p-2 border rounded-lg"
              />
              <p className="text-xs text-gray-400 mt-1">
                期限を過ぎるとユーザーには表示されなくなります。
              </p>
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50 border border-gray-200">
                <input
                  type="checkbox"
                  checked={sendPush}
                  onChange={(e) => setSendPush(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <div className="flex-1">
                  <span className="text-sm font-bold text-gray-700">プッシュ通知を送信する</span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    OFFにすると端末への通知音・バナーは出ません。
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50 border border-gray-200">
                <input
                  type="checkbox"
                  checked={showOnOpen}
                  onChange={(e) => setShowOnOpen(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <div className="flex-1">
                  <span className="text-sm font-bold text-gray-700">
                    アプリ起動時にポップアップで表示する
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    未読のユーザーが次にアプリを開いたとき、内容を自動で表示します。
                  </p>
                </div>
              </label>
            </div>

            <button
              type="submit"
              disabled={isPending || (isPreview && !message) || isOverLimit}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
              {isPending ? '送信中...' : '全員に送信'}
            </button>
          </form>
        </div>
      </div>

      {isFullscreen && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex flex-col inset-safe">
          {/* 全画面エディタは両テーマで常にダーク。グレーはダークモードで
              反転するため、反転しない slate 系で固定する */}
          <div className="flex-none bg-slate-900 border-b border-slate-700 p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h3 className="text-white font-bold text-lg">全画面エディタ</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsPreview(!isPreview)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center gap-1"
                >
                  {isPreview ? (
                    <>
                      <EyeOff size={14} /> 編集
                    </>
                  ) : (
                    <>
                      <Eye size={14} /> プレビュー
                    </>
                  )}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="text-white hover:text-slate-300 p-2"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-hidden flex">
            {isPreview ? (
              <div className="flex-1 overflow-y-auto p-8 bg-white">
                <div className="max-w-4xl mx-auto">
                  {message ? (
                    <MarkdownContent content={message} />
                  ) : (
                    <p className="text-gray-400 italic">プレビューする内容がありません</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col p-4">
                <MarkdownToolbar textareaRef={textareaRef} onInsert={setMessage} />
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className={`flex-1 w-full p-6 bg-slate-800 text-slate-100 rounded-xl border-2 ${
                    isOverLimit ? 'border-red-500' : 'border-slate-700'
                  } focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none font-mono resize-none`}
                  placeholder="メッセージを入力...&#10;&#10;ツールバーのボタンで書式を挿入できます&#10;ESCキーで全画面を終了"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsFullscreen(false);
                    }
                  }}
                />
                <div className="flex justify-between items-center mt-2">
                  <div>
                    {isOverLimit && (
                      <p className="text-sm text-red-500 font-bold">⚠️ 文字数制限を超えています</p>
                    )}
                  </div>
                  <p
                    className={`text-sm ${
                      isOverLimit
                        ? 'text-red-500 font-bold'
                        : message.length > 9000
                          ? 'text-orange-400'
                          : 'text-gray-400'
                    }`}
                  >
                    {message.length.toLocaleString()} / {MESSAGE_MAX_LENGTH.toLocaleString()}文字
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
