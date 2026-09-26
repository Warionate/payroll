import React, { useState } from 'react';
import { Trash2, Pencil, Check, X, Archive, ArchiveRestore } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { SchedulePattern, ScheduleSlot } from '../../types';

interface PatternWithSlots extends SchedulePattern {
  slots: ScheduleSlot[];
}

interface Props {
  pattern: PatternWithSlots;
  onUpdatePattern: (id: number, name: string) => void;
  onDeletePattern: (id: number) => void;
  onArchivePattern?: (id: number, archived: boolean) => void;
}

export default function PatternHeader({
  pattern,
  onUpdatePattern,
  onDeletePattern,
  onArchivePattern,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(pattern.name);

  const isArchived = !!pattern.is_archived;

  const startEdit = () => {
    setEditName(pattern.name);
    setEditing(true);
  };

  const saveEdit = () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error('パターン名を入力してください');
      return;
    }
    if (trimmed !== pattern.name) {
      onUpdatePattern(pattern.id, trimmed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 mb-4 border-b pb-3">
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="flex-1 p-1.5 text-lg font-bold border-2 border-purple-300 rounded-lg focus:outline-none focus:border-purple-500"
          maxLength={50}
        />
        <button
          onClick={saveEdit}
          className="text-green-600 hover:text-green-700 hover:bg-green-50 rounded p-1.5 transition-colors btn-interactive"
          title="保存"
        >
          <Check size={18} />
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded p-1.5 transition-colors btn-interactive"
          title="キャンセル"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center mb-4 border-b pb-3 group">
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-lg text-gray-800">{pattern.name}</h3>
        {isArchived && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-bold">
            アーカイブ済み
          </span>
        )}
        {!isArchived && (
          <button
            onClick={startEdit}
            className="text-gray-300 hover:text-purple-500 opacity-0 group-hover:opacity-100 transition-all btn-interactive p-1"
            title="パターン名を編集"
            aria-label={`${pattern.name}の名前を編集`}
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        {onArchivePattern && (
          <button
            onClick={() => onArchivePattern(pattern.id, !isArchived)}
            className="text-gray-400 hover:text-amber-600 transition-colors btn-interactive min-w-[32px] min-h-[32px] flex items-center justify-center"
            title={isArchived ? 'アーカイブを解除' : 'アーカイブ'}
            aria-label={
              isArchived ? `${pattern.name}のアーカイブを解除` : `${pattern.name}をアーカイブ`
            }
          >
            {isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
          </button>
        )}
        <button
          onClick={() => onDeletePattern(pattern.id)}
          className="text-gray-400 hover:text-red-500 transition-colors btn-interactive min-w-[32px] min-h-[32px] flex items-center justify-center"
          title="パターンを削除"
          aria-label={`${pattern.name}を削除`}
        >
          <Trash2 size={20} />
        </button>
      </div>
    </div>
  );
}
