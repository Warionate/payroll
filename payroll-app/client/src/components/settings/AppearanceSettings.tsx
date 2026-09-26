import { Sun, Moon, MonitorSmartphone, Palette } from 'lucide-react';
import { useTheme, type ThemePreference } from '../../hooks/useTheme';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'ライト', icon: Sun },
  { value: 'dark', label: 'ダーク', icon: Moon },
  { value: 'system', label: '端末に合わせる', icon: MonitorSmartphone },
];

export default function AppearanceSettings() {
  const { preference, setTheme } = useTheme();

  return (
    <section>
      <h2 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
        <Palette className="text-blue-600" size={20} />
        外観
      </h2>
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <p className="text-sm text-gray-500 mb-3">テーマ</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={preference === value}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${
                preference === value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Icon
                size={20}
                className={preference === value ? 'text-blue-600' : 'text-gray-400'}
              />
              <span
                className={`text-xs font-medium ${
                  preference === value ? 'text-blue-700' : 'text-gray-600'
                }`}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
