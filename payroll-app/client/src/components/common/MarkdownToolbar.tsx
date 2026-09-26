import React, { useState, useRef } from 'react';
import {
  Bold,
  Italic,
  Heading2,
  Link,
  Image,
  List,
  X,
  Upload,
  Loader,
  Paperclip,
} from 'lucide-react';
import { uploadsApi } from '../../api/uploads';

interface ToolDefinition {
  icon: React.ComponentType<Record<string, unknown>>;
  label: string;
  before: string;
  after: string;
  placeholder: string;
}

const BASIC_TOOLS: ToolDefinition[] = [
  { icon: Bold, label: '太字', before: '**', after: '**', placeholder: 'テキスト' },
  { icon: Italic, label: '斜体', before: '*', after: '*', placeholder: 'テキスト' },
  { icon: Heading2, label: '見出し', before: '\n## ', after: '\n', placeholder: '見出し' },
  { icon: List, label: 'リスト', before: '\n- ', after: '\n', placeholder: '' },
];

interface InsertModalProps {
  title: string;
  textLabel: string;
  textValue: string;
  urlValue: string;
  onTextChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  showUpload: boolean;
  acceptTypes: string;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading: boolean;
}

// モーダルを外部コンポーネントとして定義（再レンダリング防止）
function InsertModal({
  title,
  textLabel,
  textValue,
  urlValue,
  onTextChange,
  onUrlChange,
  onClose,
  onSubmit,
  showUpload,
  acceptTypes,
  onFileSelect,
  isUploading,
}: InsertModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center overlay-safe z-[100]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-4 w-80 max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">{textLabel}</label>
            <input
              type="text"
              value={textValue}
              onChange={(e) => onTextChange(e.target.value)}
              className="w-full p-2 border rounded text-sm"
              placeholder={textLabel}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">URL</label>
            <input
              type="text"
              value={urlValue}
              onChange={(e) => onUrlChange(e.target.value)}
              className="w-full p-2 border rounded text-sm font-mono"
              placeholder="https://..."
              disabled={isUploading}
            />
          </div>

          {showUpload && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptTypes}
                onChange={onFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full p-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    アップロード中...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    ファイルを選択
                  </>
                )}
              </button>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded text-sm"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isUploading}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              挿入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * マークダウン入力支援ツールバー
 */
interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsert: (newText: string) => void;
}

export default function MarkdownToolbar({ textareaRef, onInsert }: MarkdownToolbarProps) {
  const [modalType, setModalType] = useState<'link' | 'image' | 'file' | null>(null);
  const [urlInput, setUrlInput] = useState('https://');
  const [textInput, setTextInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const insertBasicMarkdown = (tool: ToolDefinition) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    const before = tool.before;
    const after = tool.after || '';
    const placeholder = tool.placeholder || '';

    let newText;
    let newCursorPos;

    if (selectedText) {
      newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
      newCursorPos = start + before.length + selectedText.length + after.length;
    } else {
      newText = text.substring(0, start) + before + placeholder + after + text.substring(end);
      newCursorPos = start + before.length;
    }

    onInsert(newText);

    setTimeout(() => {
      textarea.focus();
      if (placeholder && !selectedText) {
        textarea.setSelectionRange(
          start + before.length,
          start + before.length + placeholder.length,
        );
      } else {
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleInsert = () => {
    const textarea = textareaRef.current;
    if (!textarea || !urlInput || urlInput === 'https://') return;

    const start = textarea.selectionStart;
    const text = textarea.value;

    let markdown;
    if (modalType === 'image') {
      const displayText = textInput || '画像';
      markdown = `![${displayText}](${urlInput})`;
    } else {
      // link and file both use regular link format
      const displayText = textInput || (modalType === 'link' ? 'リンク' : '📎 ファイル');
      markdown = `[${displayText}](${urlInput})`;
    }

    const newText = text.substring(0, start) + markdown + text.substring(start);
    onInsert(newText);

    setModalType(null);
    setUrlInput('https://');
    setTextInput('');

    setTimeout(() => textarea.focus(), 0);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await uploadsApi.upload(formData);

      setUrlInput(response.url);
      if (!textInput) {
        // For files, keep the extension; for images, remove it
        if (modalType === 'file') {
          setTextInput('📎 ' + file.name);
        } else {
          setTextInput(file.name.replace(/\.[^/.]+$/, ''));
        }
      }
    } catch (error: unknown) {
      console.error('Upload failed:', error);
      const axiosError = error as { response?: { data?: { error?: string } }; message?: string };
      alert(
        'アップロードに失敗しました: ' + (axiosError.response?.data?.error || axiosError.message),
      );
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Clear file input
    }
  };

  const openModal = (type: 'link' | 'image' | 'file') => {
    setTextInput('');
    setUrlInput('https://');
    setModalType(type);
  };

  const closeModal = () => {
    setModalType(null);
  };

  const getModalConfig = () => {
    switch (modalType) {
      case 'image':
        return {
          title: '画像を挿入',
          textLabel: '代替テキスト',
          showUpload: true,
          acceptTypes: 'image/*',
        };
      case 'file':
        return {
          title: 'ファイルを添付',
          textLabel: '表示名',
          showUpload: true,
          acceptTypes: '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt',
        };
      default:
        return {
          title: 'リンクを挿入',
          textLabel: 'リンクテキスト',
          showUpload: false,
          acceptTypes: '',
        };
    }
  };

  const config = modalType ? getModalConfig() : null;

  return (
    <>
      <div className="flex gap-1 mb-2 flex-wrap">
        {BASIC_TOOLS.map((tool, index) => (
          <button
            key={index}
            type="button"
            onClick={() => insertBasicMarkdown(tool)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors"
            title={tool.label}
            aria-label={tool.label}
          >
            <tool.icon size={16} />
          </button>
        ))}
        <button
          type="button"
          onClick={() => openModal('link')}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors"
          title="リンク"
          aria-label="リンク"
        >
          <Link size={16} />
        </button>
        <button
          type="button"
          onClick={() => openModal('image')}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors"
          title="画像"
          aria-label="画像"
        >
          <Image size={16} />
        </button>
        <button
          type="button"
          onClick={() => openModal('file')}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors"
          title="ファイル添付"
          aria-label="ファイル添付"
        >
          <Paperclip size={16} />
        </button>
      </div>

      {modalType && config && (
        <InsertModal
          title={config.title}
          textLabel={config.textLabel}
          textValue={textInput}
          urlValue={urlInput}
          onTextChange={setTextInput}
          onUrlChange={setUrlInput}
          onClose={closeModal}
          onSubmit={handleInsert}
          showUpload={config.showUpload}
          acceptTypes={config.acceptTypes}
          onFileSelect={handleFileSelect}
          isUploading={isUploading}
        />
      )}
    </>
  );
}
