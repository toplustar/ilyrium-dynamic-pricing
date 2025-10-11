export enum Environment {
  LOCAL = 'local',
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
}

export class EnvironmentUtil {
  private static currentEnvironment: Environment;

  static initialize(): void {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase() || 'local';

    switch (nodeEnv) {
      case 'local':
      case 'development':
        this.currentEnvironment = Environment.LOCAL;
        break;
      case 'dev':
        this.currentEnvironment = Environment.DEV;
        break;
      case 'uat':
      case 'staging':
        this.currentEnvironment = Environment.UAT;
        break;
      case 'prd':
      case 'production':
        this.currentEnvironment = Environment.PRD;
        break;
      default:
        this.currentEnvironment = Environment.LOCAL;
    }
  }

  static getCurrentEnvironment(): Environment {
    if (!this.currentEnvironment) {
      this.initialize();
    }
    return this.currentEnvironment;
  }

  static isLocal(): boolean {
    return this.getCurrentEnvironment() === Environment.LOCAL;
  }

  static isDev(): boolean {
    return this.getCurrentEnvironment() === Environment.DEV;
  }

  static isUat(): boolean {
    return this.getCurrentEnvironment() === Environment.UAT;
  }

  static isPrd(): boolean {
    return this.getCurrentEnvironment() === Environment.PRD;
  }

  static isNonProd(): boolean {
    return !this.isPrd();
  }

  static requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  static getEnv(key: string, defaultValue?: string): string | undefined {
    return process.env[key] ?? defaultValue;
  }
}

// Initialize on module load
EnvironmentUtil.initialize();
