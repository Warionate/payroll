# テストガイド (Testing Guide)

このプロジェクトでは、フロントエンドの品質を担保するために **Vitest** を使用したユニットテストとコンポーネントテストを導入しています。

## 1. テストの実行方法

### 基本的な実行

すべてのテストを一度だけ実行します。

```bash
npm test
```

### ウォッチモード（開発中）

ファイルの変更を検知して、関連するテストを自動的に再実行します。開発中に便利です。

```bash
npm test -- --watch
```

### UIモード

ブラウザでテスト結果を視覚的に確認できます。

```bash
npm test -- --ui
```

## 2. テストの構成

テストファイルは、対象のソースコードと同じディレクトリに `*.test.ts` または `*.test.tsx` という名前で配置されています。

### 主なテスト対象

| カテゴリ           | テストファイル                         | 内容                                                                     |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------ |
| **ロジック**       | `src/utils/salaryCalc.test.ts`         | 給与計算（授業給、時給、手当、期間判定）の正確性を検証                   |
|                    | `src/utils/dateUtils.test.ts`          | データベースの日付形式(UTC)のパース処理を検証                            |
|                    | `src/utils/push.test.ts`               | プッシュ通知用VAPIDキーの変換処理を検証                                  |
| **フック**         | `src/hooks/useSwipe.test.ts`           | スワイプ操作（タッチイベント）の検知ロジックを検証                       |
| **UI/操作**        | `src/components/EntryModal.test.tsx`   | 授業登録モーダルの表示、入力、保存処理を検証                             |
|                    | `src/pages/WorkSchedule.test.tsx`      | シフト一括反映ボタンの確認ダイアログと実行フローを検証                   |
|                    | `src/pages/AdminDashboard.test.tsx`    | 管理者権限チェック、パターン作成フォームの動作を検証                     |
| **コンポーネント** | `src/components/ReloadPrompt.test.tsx` | 更新通知（トースト）の表示、リロードボタンによるSW更新、閉じる動作を検証 |

## 3. テスト実行のタイミング

以下のタイミングでテストを実行することを推奨します。

1. **機能追加・修正時**: コードを変更した後、既存の機能が壊れていないか（リグレッションがないか）を確認するため。
2. **リファクタリング時**: コードの構造を変える際、振る舞いが変わっていないことを保証するため。
3. **プルリクエスト作成前**: チーム開発の場合、変更をマージする前に必ずテストがパスすることを確認します。

## 4. 新しいテストの追加方法

新しい機能を追加した場合は、対応するテストファイルを作成してください。

**例: `MyComponent.jsx` を作成した場合**

1. 同じフォルダに `MyComponent.test.tsx` を作成します。
2. 以下のようなテンプレートを使ってテストを書きます。

```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('正しくレンダリングされること', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## 5. トラブルシューティング

- **`ReferenceError: document is not defined`**: テスト環境が `jsdom` に設定されているか確認してください (`vite.config.js`)。
- **APIコールのエラー**: `vi.mock('../api')` を使用して、API呼び出しをモック（偽装）してください。実際のサーバーにはリクエストを送らないようにします。
