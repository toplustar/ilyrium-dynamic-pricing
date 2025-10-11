export interface HttpConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface HttpError {
  message: string;
  status?: number;
  data?: unknown;
  config?: {
    method?: string;
    url?: string;
  };
}
