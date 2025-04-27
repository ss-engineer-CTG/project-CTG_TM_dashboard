/**
 * 型ガードユーティリティ
 * 型安全な処理を保証するためのヘルパー関数を提供します
 */

import { isElectronEnvironment } from './environment';
import { APIError } from '../types/models';

/**
 * エラーオブジェクトがAPIエラーであることを確認する型ガード
 */
export function isApiError(error: unknown): error is APIError {
  return (
    typeof error === 'object' && 
    error !== null && 
    'isApiError' in error && 
    (error as any).isApiError === true
  );
}

/**
 * Electron環境であることをアサートするアサーション関数
 * Electron環境でない場合は例外をスローする
 */
export function assertElectron(): void {
  if (!isElectronEnvironment()) {
    throw new Error('この機能はElectron環境でのみ利用可能です');
  }
}

/**
 * オブジェクトのプロパティが存在することを確認する型ガード
 */
export function hasProperty<T extends object, K extends PropertyKey>(
  obj: T,
  prop: K
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

/**
 * 値が配列であることを確認する型ガード
 */
export function isArray<T>(value: unknown): value is Array<T> {
  return Array.isArray(value);
}

/**
 * 値が文字列であることを確認する型ガード
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string' || value instanceof String;
}

/**
 * 値が数値であることを確認する型ガード
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * 値が日付オブジェクトであることを確認する型ガード
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}