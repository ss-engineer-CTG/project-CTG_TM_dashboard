import useSWR from 'swr';

// データフェッチャー関数
async function fetcher(url: string, filePath: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: filePath }),
  });

  if (!response.ok) {
    const error = new Error('データの取得に失敗しました');
    error.cause = await response.text();
    throw error;
  }

  return response.json();
}

export function useDashboardData(filePath: string) {
  const { data, error, isLoading, mutate } = useSWR(
    filePath ? ['http://localhost:8000/api/load-data', filePath] : null,
    ([url, path]) => fetcher(url, path),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 10000, // 10秒間は同じリクエストを重複させない
    }
  );

  return {
    data,
    isLoading,
    error,
    mutate,
  };
}