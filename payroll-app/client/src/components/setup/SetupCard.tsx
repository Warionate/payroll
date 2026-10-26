import type { ReactNode } from 'react';

/** ウィザードの1ステップの枠。アイコン・見出し・なぜ必要か・中身 */
export default function SetupCard({
  icon,
  title,
  lead,
  children,
}: {
  icon: ReactNode;
  title: string;
  lead: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 animate-fade-in">
      <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">{title}</h2>
      <p className="text-sm text-gray-600 leading-relaxed mb-6">{lead}</p>
      {children}
    </section>
  );
}
