import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

import { AppLogger } from '../services/app-logger.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger: AppLogger;

  constructor() {
    this.logger = new AppLogger(this.constructor.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorId = this.generateErrorId();
    const { status, message, messageString } = this.extractErrorInfo(exception);
    const contextData = this.buildContextData(request, errorId, status);
    const errorName = this.getErrorName(exception);

    this.logError(errorName, message, contextData, exception);
    this.sendErrorResponse(response, status, request.url, messageString, errorId);
  }

  private generateErrorId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const ERRORID_LENGTH = 8;
    for (let i = 0; i < ERRORID_LENGTH; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private extractErrorInfo(exception: unknown): {
    status: number;
    message: string;
    messageString: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = exception.message;
      const errorResponse = exception.getResponse();
      const messageString =
        typeof errorResponse === 'string'
          ? errorResponse
          : (errorResponse as any)?.message || message;
      return { status, message, messageString };
    }

    const defaultMessage = 'Internal server error';
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: defaultMessage,
      messageString: defaultMessage,
    };
  }

  private buildContextData(request: Request, errorId: string, status: number): Record<string, any> {
    return {
      context: 'GlobalExceptionFilter',
      errorId,
      url: request.url,
      method: request.method,
      statusCode: status,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      tenantId: request.headers['x-tenantid'],
      userId: (request as any).user?.id,
      timestamp: new Date().toISOString(),
      requestBody: request.body,
      requestQuery: request.query,
      requestParams: request.params,
    };
  }

  private getErrorName(exception: unknown): string {
    if (exception instanceof HttpException || exception instanceof Error) {
      return exception.constructor.name;
    }
    return 'UNKNOWN_ERROR';
  }

  private logError(
    errorName: string,
    message: string,
    contextData: Record<string, any>,
    exception: unknown,
  ): void {
    this.logger.error(
      errorName,
      message,
      contextData,
      exception instanceof Error ? exception : new Error(String(exception)),
    );
  }

  private sendErrorResponse(
    response: Response,
    status: number,
    path: string,
    message: string,
    errorId: string,
  ): void {
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path,
      message,
      errorId,
    });
  }
}
