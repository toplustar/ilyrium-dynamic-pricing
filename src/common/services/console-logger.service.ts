import { EnvironmentUtil } from '~/common/utils/environment.util';

export class ConsoleLogger {
  log(message: string, context: string): void {
    if (!EnvironmentUtil.isLocal) return;
    const formattedMessage = this.formatMessage('log', message, context);
    console.log(formattedMessage);
  }

  error(message: string, context: string, stack?: string): void {
    if (!EnvironmentUtil.isLocal) return;
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const formattedMessage = `\x1b[31m[Nest] ${process.pid}  - \x1b[37m${timestamp}\x1b[31m     ERROR \x1b[33m[${context}]\x1b[31m ${message}\x1b[0m`;
    console.error(formattedMessage);

    if (stack) {
      console.error(`\x1b[31m${stack}\x1b[0m`);
    }
  }

  warn(message: string, context: string): void {
    if (!EnvironmentUtil.isLocal) return;
    const formattedMessage = this.formatMessage('warn', message, context);
    console.warn(`\x1b[33m${formattedMessage.replace('\x1b[32m', '\x1b[33m')}\x1b[0m`);
  }

  debug(message: string, context: string): void {
    console.debug(
      this.formatMessage('debug', message, context).replace('DEBUG', '\x1b[35mDEBUG\x1b[32m'),
    );
  }

  verbose(message: string, context: string): void {
    if (!EnvironmentUtil.isLocal) return;
    const formattedMessage = this.formatMessage('verbose', message, context);
    console.log(`\x1b[36m${formattedMessage.replace('\x1b[32m', '\x1b[36m')}\x1b[0m`);
  }

  redisQuery(query: string, duration: number, result?: string): void {
    if (!EnvironmentUtil.isLocal) return;
    const parts = query.split(' ');
    const command = parts[0];
    const key = parts[1];
    const data = parts.slice(2).join(' ');

    let coloredQuery = `\x1b[31mredis:\x1b[0m \x1b[34m${command}\x1b[0m \x1b[37m${key}\x1b[0m`;
    if (data) {
      coloredQuery += ` \x1b[2m\x1b[37m${data}\x1b[0m`;
    }
    const durationAndResult = `\x1b[2m\x1b[37m-- Duration: ${duration}ms${result ? ` -- Result: ${result}` : ''}\x1b[0m`;

    console.log(`${coloredQuery} ${durationAndResult}`);
  }

  httpRequest(
    method: string,
    url: string,
    duration: number,
    status?: number,
    error?: { response?: { status?: number; data?: unknown } },
    requestData?: unknown,
    responseData?: unknown,
  ): void {
    if (!EnvironmentUtil.isLocal) return;

    let coloredRequest = `\x1b[36mhttp:\x1b[0m \x1b[34m${method}\x1b[0m \x1b[37m${url}\x1b[0m`;

    if (error) {
      const errorStatus = error.response?.status || 'Unknown';
      const statusInfo = `\x1b[31m-- Status: ${errorStatus}\x1b[0m`;
      const durationInfo = `\x1b[2m\x1b[37m-- Duration: ${duration}ms\x1b[0m`;
      const requestDataInfo = requestData
        ? ` \x1b[2m\x1b[37m-- \x1b[33mRequest:\x1b[0m\x1b[2m\x1b[37m ${JSON.stringify(requestData)}\x1b[0m`
        : '';
      const errorResponseInfo = error.response?.data
        ? ` \x1b[31m-- \x1b[33mError Response:\x1b[0m\x1b[31m ${JSON.stringify(error.response.data)}\x1b[0m`
        : '';
      console.log(
        `${coloredRequest} ${statusInfo} ${durationInfo}${requestDataInfo}${errorResponseInfo}`,
      );
    } else {
      const statusInfo = `\x1b[2m\x1b[37m-- Status: ${status}\x1b[0m`;
      const durationInfo = `\x1b[2m\x1b[37m-- Duration: ${duration}ms\x1b[0m`;
      const requestDataInfo = requestData
        ? ` \x1b[2m\x1b[37m-- \x1b[33mRequest:\x1b[0m\x1b[2m\x1b[37m ${JSON.stringify(requestData)}\x1b[0m`
        : '';
      const responseDataInfo = responseData
        ? ` \x1b[2m\x1b[37m-- \x1b[33mResponse:\x1b[0m\x1b[2m\x1b[37m ${JSON.stringify(responseData)}\x1b[0m`
        : '';
      console.log(
        `${coloredRequest} ${statusInfo} ${durationInfo}${requestDataInfo}${responseDataInfo}`,
      );
    }
  }

  private formatMessage(level: string, message: any, context: string): string {
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const pid = process.pid;

    return `\x1b[32m[Nest] ${pid}  - \x1b[37m${timestamp}\x1b[32m     ${level.toUpperCase()} \x1b[33m[${context}]\x1b[32m ${message}\x1b[0m`;
  }
}
