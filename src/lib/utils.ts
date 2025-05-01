// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * tailwindクラス名を結合するためのユーティリティ関数
 * shadcn/uiコンポーネント用に必要
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}