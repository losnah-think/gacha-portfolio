import { API_V2, API_V3, getBaseUrl } from '../constants/api';

export type ApiVersion = 'v2' | 'v3' | 'legacy';
export type QueryValue = string | number | boolean | null | undefined;

const API_PREFIX: Record<ApiVersion, string> = {
  v2: API_V2,
  v3: API_V3,
  legacy: '/api',
};

const normalizePath = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
};

const appendQuery = (url: string, query?: Record<string, QueryValue | QueryValue[]>) => {
  if (!query) return url;

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    const values = Array.isArray(value) ? value : [value];
    values.forEach(item => {
      if (item !== null && item !== undefined) {
        params.append(key, String(item));
      }
    });
  });

  const queryString = params.toString();
  if (!queryString) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
};

export const apiUrl = (
  path: string,
  options: {
    version?: ApiVersion;
    query?: Record<string, QueryValue | QueryValue[]>;
    baseUrl?: string;
  } = {}
) => {
  const { version = 'v2', query, baseUrl = getBaseUrl() } = options;
  const normalizedPath = normalizePath(path);

  if (/^https?:\/\//i.test(normalizedPath)) {
    return appendQuery(normalizedPath, query);
  }

  return appendQuery(`${baseUrl}${API_PREFIX[version]}${normalizedPath}`, query);
};

export const apiFetch = (
  path: string,
  init?: RequestInit,
  options?: Parameters<typeof apiUrl>[1]
) => fetch(apiUrl(path, options), init);

export async function apiJson<T>(
  path: string,
  init?: RequestInit,
  options?: Parameters<typeof apiUrl>[1]
): Promise<T> {
  const response = await apiFetch(path, init, options);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}
