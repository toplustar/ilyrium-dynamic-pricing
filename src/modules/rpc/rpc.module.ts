import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RpcController } from './controllers/rpc.controller';
import { RpcService } from './services/rpc.service';
import { ApiKeyModule } from '../api-key/api-key.module';
import { Purchase } from '../pricing/entities/purchase.entity';
import { UsageMetrics } from '../pricing/entities/usage-metrics.entity';

@Module({
  imports: [ConfigModule, ApiKeyModule, TypeOrmModule.forFeature([Purchase, UsageMetrics])],
  controllers: [RpcController],
  providers: [RpcService],
  exports: [RpcService],
})
export class RpcModule {}
