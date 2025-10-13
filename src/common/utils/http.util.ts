import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import axios from 'axios';
import { HttpException, HttpStatus } from '@nestjs/common';

import { ConsoleLogger } from '~/common/services/console-logger.service';

import type { HttpConfig, HttpResponse, HttpError } from './http-config.interface';

export class HttpUtil {
  private readonly axiosInstance: AxiosInstance;
  private readonly logger: ConsoleLogger;

  constructor(config: HttpConfig) {
    this.logger = new ConsoleLogger();

    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    // Request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      request => {
        this.logger.httpRequest(
          request.method?.toUpperCase() || 'UNKNOWN',
          `${request.baseURL || ''}${request.url || ''}`,
          0,
        );
        return request;
      },
      (error: Error) => Promise.reject(error),
    );

    // Response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      response => {
        this.logger.httpRequest(
          response.config.method?.toUpperCase() || 'UNKNOWN',
          `${response.config.baseURL || ''}${response.config.url || ''}`,
          0,
          response.status,
        );
        return response;
      },
      (error: Error) => {
        this.handleError(error);
        return Promise.reject(error);
      },
    );
  }

  async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.get(url, config);
      const duration = Date.now() - startTime;
      this.logger.httpRequest('GET', url, duration, response.status);
      return this.formatResponse(response);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.httpRequest('GET', url, duration, undefined, error);
      throw this.transformError(error);
    }
  }

  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<HttpResponse<T>> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.post(url, data, config);
      const duration = Date.now() - startTime;
      this.logger.httpRequest('POST', url, duration, response.status);
      return this.formatResponse(response);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.httpRequest('POST', url, duration, undefined, error);
      throw this.transformError(error);
    }
  }

  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<HttpResponse<T>> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.put(url, data, config);
      const duration = Date.now() - startTime;
      this.logger.httpRequest('PUT', url, duration, response.status);
      return this.formatResponse(response);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.httpRequest('PUT', url, duration, undefined, error);
      throw this.transformError(error);
    }
  }

  async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<HttpResponse<T>> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.patch(url, data, config);
      const duration = Date.now() - startTime;
      this.logger.httpRequest('PATCH', url, duration, response.status);
      return this.formatResponse(response);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.httpRequest('PATCH', url, duration, undefined, error);
      throw this.transformError(error);
    }
  }

  async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const startTime = Date.now();
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.delete(url, config);
      const duration = Date.now() - startTime;
      this.logger.httpRequest('DELETE', url, duration, response.status);
      return this.formatResponse(response);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.httpRequest('DELETE', url, duration, undefined, error);
      throw this.transformError(error);
    }
  }

  createWithAdditionalHeaders(headers: Record<string, string>): HttpUtil {
    const currentConfig = this.axiosInstance.defaults;
    const currentHeaders = currentConfig.headers as Record<string, string>;
    return new HttpUtil({
      baseURL: currentConfig.baseURL || '',
      timeout: currentConfig.timeout,
      headers: {
        ...currentHeaders,
        ...headers,
      },
    });
  }

  private formatResponse<T>(response: AxiosResponse<T>): HttpResponse<T> {
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
    };
  }

  private handleError(error: unknown): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      this.logger.httpRequest(
        axiosError.config?.method?.toUpperCase() || 'UNKNOWN',
        `${axiosError.config?.baseURL || ''}${axiosError.config?.url || ''}`,
        0,
        axiosError.response?.status,
        axiosError,
      );
    }
  }

  private transformError(error: unknown): HttpException {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const httpError: HttpError = {
        message: axiosError.message,
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        config: {
          method: axiosError.config?.method,
          url: axiosError.config?.url,
        },
      };

      const status = axiosError.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        (axiosError.response?.data as { message?: string })?.message ||
        axiosError.message ||
        'HTTP request failed';

      return new HttpException(
        {
          statusCode: status,
          message,
          error: httpError,
        },
        status,
      );
    }

    return new HttpException(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
        error: error instanceof Error ? error.message : String(error),
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
