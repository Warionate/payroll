import type { ComponentType, ReactNode } from 'react';

/** ヘルプの1章の枠。id は目次から飛ぶ先 */
export default function HelpSection({
  id,
  icon: Icon,
  iconClass,
  title,
  children,
}: {
  id: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  iconClass: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={`help-${id}`}
      className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden scroll-mt-20"
    >
      <div className="p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Icon className={iconClass} size={24} />
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

/** 画面の場所の表記（例: 設定 › 給与単価） */
export function Path({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block font-bold text-gray-800 bg-gray-100 rounded px-1.5 py-0.5 text-sm">
      {children}
    </span>
  );
}
