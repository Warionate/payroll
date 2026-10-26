/**
 * @testing-library/jest-dom のマッチャー（toBeInTheDocument など）を vitest 5 の expect に載せる型。
 * vitest 5 で拡張の場所が Assertion から Matchers<R, T> に変わったが、jest-dom 7.0 の型
 * （@testing-library/jest-dom/vitest）はまだ Assertion<T> を拡張しているため、ここで Matchers を拡張する。
 * jest-dom が vitest 5 に対応したら、このファイルは消して setup.ts の import を jest-dom/vitest にする。
 */
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<unknown, R> {}
}
