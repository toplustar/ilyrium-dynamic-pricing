import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Interaction,
} from 'discord.js';

import { AppLogger } from '~/common/services/app-logger.service';
import { PaymentService } from '~/modules/payment/services/payment.service';
import { PricingEngineService } from '~/modules/pricing/services/pricing-engine.service';
import { ApiKeyService } from '~/modules/api-key/services/api-key.service';
import { UsageService } from '~/modules/pricing/services/usage.service';

import { DiscordUserService } from './discord-user.service';

@Injectable()
export class DiscordBotService implements OnModuleInit {
  private client: Client;
  private readonly logger: AppLogger;
  private readonly rpcEndpoint: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly discordUserService: DiscordUserService,
    private readonly paymentService: PaymentService,
    private readonly pricingEngineService: PricingEngineService,
    private readonly apiKeyService: ApiKeyService,
    private readonly usageService: UsageService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('DiscordBotService');
    this.rpcEndpoint = this.configService.get<string>('app.rpcEndpoint', 'elite.rpc.solanavibestation.com');
  }

  async onModuleInit(): Promise<void> {
    const botToken = this.configService.get<string>('discord.botToken');

    if (!botToken) {
      this.logger.warn('DISCORD_BOT_TOKEN not configured - bot will not start');
      return;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.setupEventHandlers();

    await this.client.login(botToken);
    this.logger.log('Discord bot started successfully');
  }

  private setupEventHandlers(): void {
    this.client.on('ready', () => {
      this.logger.log(`Discord bot logged in as ${this.client.user?.tag}`);
    });

    this.client.on('interactionCreate', async (interaction: Interaction) => {
      try {
        if (interaction.isButton()) {
          await this.handleButtonInteraction(interaction);
        }
      } catch (error) {
        this.logger.error('InteractionError', 'Failed to handle interaction', {}, error as Error);
        if (interaction.isRepliable()) {
          await interaction.reply({
            content: 'Sorry, something went wrong. Please try again later.',
            ephemeral: true,
          }).catch(() => {});
        }
      }
    });
  }

  async sendPurchaseServicesMessage(channelId: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        this.logger.error('ChannelError', 'Channel not found or not text-based', { channelId });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🚀 RPC Services')
        .setDescription('Purchase RPC access to our high-performance Solana nodes with dynamic pricing based on demand.')
        .addFields(
          { name: '📊 Basic', value: 'Perfect for testing\n10 RPS', inline: true },
          { name: '⚡ Ultra', value: 'For production apps\n50 RPS', inline: true },
          { name: '💎 Elite', value: 'High-performance\n200 RPS', inline: true }
        )
        .setFooter({ text: 'Prices adjust dynamically based on network utilization' })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('rpc_services')
          .setLabel('RPC Services')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔗'),
        new ButtonBuilder()
          .setCustomId('view_subscriptions')
          .setLabel('View My Active Subscriptions')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📋')
      );

      await channel.send({ embeds: [embed], components: [row] } as any);
      this.logger.log('Purchase services message sent', { channelId });
    } catch (error) {
      this.logger.error('SendMessageError', 'Failed to send purchase message', { channelId }, error as Error);
    }
  }

  private async handleButtonInteraction(interaction: any): Promise<void> {
    const customId = interaction.customId;

    if (customId === 'rpc_services') {
      await this.showTierSelection(interaction);
    } else if (customId === 'view_subscriptions') {
      await this.showActiveSubscriptions(interaction);
    } else if (customId.startsWith('tier:')) {
      await this.showDurationSelection(interaction);
    } else if (customId.startsWith('duration:')) {
      await this.createPayment(interaction);
    } else if (customId.startsWith('check_payment:')) {
      await this.checkPaymentStatus(interaction);
    } else if (customId === 'back_to_tiers') {
      await this.showTierSelection(interaction);
    }
  }

  private async showTierSelection(interaction: any): Promise<void> {
    const usedRps = await this.pricingEngineService.getCurrentUtilization();
    const totalRps = this.pricingEngineService.getTotalRps();
    const basePrice = this.pricingEngineService.calculateDynamicPrice({
      usedRps,
      totalRps,
      priceMin: this.pricingEngineService.getPriceMin(),
      priceMax: this.pricingEngineService.getPriceMax(),
    });

    const utilization = ((usedRps / totalRps) * 100).toFixed(1);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎯 Select Your Tier')
      .setDescription(`Current Network Utilization: **${utilization}%**\nBase Price: **$${basePrice.toFixed(4)}** per RPS/day`)
      .addFields(
        { name: '📊 Basic', value: `10 RPS\n~$${(basePrice * 10 * 30).toFixed(2)}/month`, inline: true },
        { name: '⚡ Ultra', value: `50 RPS\n~$${(basePrice * 50 * 30).toFixed(2)}/month`, inline: true },
        { name: '💎 Elite', value: `200 RPS\n~$${(basePrice * 200 * 30).toFixed(2)}/month`, inline: true }
      )
      .setFooter({ text: 'Select a tier to continue' })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('tier:Basic')
        .setLabel('Basic')
        .setStyle(ButtonStyle.Success)
        .setEmoji('📊'),
      new ButtonBuilder()
        .setCustomId('tier:Ultra')
        .setLabel('Ultra')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚡'),
      new ButtonBuilder()
        .setCustomId('tier:Elite')
        .setLabel('Elite')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('💎')
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true } as any);
  }

  private async showDurationSelection(interaction: any): Promise<void> {
    const tier = interaction.customId.split(':')[1];

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`${this.getTierEmoji(tier)} ${tier} Tier Selected`)
      .setDescription('How long do you need the service for?')
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`duration:${tier}:1`)
        .setLabel('1 Day')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`duration:${tier}:7`)
        .setLabel('1 Week')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`duration:${tier}:30`)
        .setLabel('1 Month')
        .setStyle(ButtonStyle.Secondary)
    );

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('back_to_tiers')
        .setLabel('← Back')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ embeds: [embed], components: [row, backRow] } as any);
  }

  private async createPayment(interaction: any): Promise<void> {
    await interaction.deferUpdate();

    const parts = interaction.customId.split(':');
    const tier = parts[1];
    const duration = parseInt(parts[2], 10);

    const discordId = interaction.user.id;
    const username = interaction.user.username;
    const globalName = interaction.user.globalName;
    const discriminator = interaction.user.discriminator;

    const user = await this.discordUserService.findOrCreate(
      discordId,
      username,
      globalName,
      discriminator
    );

    const payment = await this.paymentService.createPaymentAttempt({
      userId: user.id,
      tier: tier as any,
      duration,
    });

    const expiryTime = new Date(Date.now() + 10 * 60 * 1000);
    const expiryTimestamp = Math.floor(expiryTime.getTime() / 1000);

    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle('💰 Payment Required')
      .setDescription(`To complete your purchase for **${duration} day(s)**, please send the EXACT amount in SOL to the below address.`)
      .addFields(
        { name: 'Amount', value: `\`${payment.amountExpected}\` SOL`, inline: false },
        { name: 'Address', value: `\`${payment.walletAddress}\``, inline: false },
        { name: 'Memo', value: `\`${payment.memo}\``, inline: false },
        { name: 'Tier', value: tier, inline: true },
        { name: 'Duration', value: `${duration} day(s)`, inline: true },
        { name: 'Expires', value: `<t:${expiryTimestamp}:R>`, inline: false }
      )
      .setFooter({ text: '⚠️ Payment link expires in 10 minutes. If you need more time, just let me know!' })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`check_payment:${payment.id}`)
        .setLabel('Check Payment Status')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('back_to_tiers')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({ embeds: [embed], components: [row] } as any);

    this.logger.log('Payment created for Discord user', {
      userId: user.id,
      discordId,
      paymentId: payment.id,
      tier,
      duration,
      amount: payment.amountExpected,
    });
  }

  private async checkPaymentStatus(interaction: any): Promise<void> {
    await interaction.deferUpdate();

    const paymentId = interaction.customId.split(':')[1];
    const payment = await this.paymentService.getPaymentAttemptById(paymentId);

    if (!payment) {
      await interaction.followUp({
        content: '❌ Payment not found.',
        ephemeral: true,
      });
      return;
    }

    const statusColor = payment.status === 'COMPLETED' ? 0x00ff00 : payment.status === 'PARTIAL' ? 0xffa500 : 0xff0000;

    const embed = new EmbedBuilder()
      .setColor(statusColor)
      .setTitle('💳 Payment Status')
      .addFields(
        { name: 'Status', value: this.getStatusText(payment.status), inline: true },
        { name: 'Amount Paid', value: `${payment.amountPaid}/${payment.amountExpected} SOL`, inline: true },
        { name: 'Memo', value: `\`${payment.memo}\``, inline: false }
      )
      .setTimestamp();

    if (payment.status === 'COMPLETED') {
      const discordUser = await this.discordUserService.getUserById(payment.userId);
      if (discordUser) {
        const apiKey = await this.apiKeyService.createApiKey(discordUser.id, `${payment.tier}-access`);

        embed.setDescription('✅ **Payment Completed Successfully!**\n\nYour RPC access is now active!');
        embed.addFields(
          { name: '🔑 API Key', value: `||\`${apiKey.fullKey}\`||`, inline: false },
          { name: '🌐 RPC Endpoint', value: `\`https://${this.rpcEndpoint}\``, inline: false },
          { name: 'ℹ️ Usage', value: 'Add the API key to your requests using the `X-API-Key` header', inline: false }
        );

        await interaction.editReply({ embeds: [embed], components: [] } as any);
      }
    } else {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`check_payment:${paymentId}`)
          .setLabel('Refresh Status')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId('back_to_tiers')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.editReply({ embeds: [embed], components: [row] } as any);
    }
  }

  private async showActiveSubscriptions(interaction: any): Promise<void> {
    const discordId = interaction.user.id;
    const user = await this.discordUserService.getUserByDiscordId(discordId);

    if (!user) {
      await interaction.reply({
        content: '❌ You need to make a purchase first!',
        ephemeral: true,
      });
      return;
    }

    const purchases = await this.usageService.getActivePurchases(user.id);

    if (purchases.length === 0) {
      await interaction.reply({
        content: '📭 You have no active subscriptions. Click "RPC Services" to purchase!',
        ephemeral: true,
      });
      return;
    }

    const totalRps = purchases.reduce((sum, p) => sum + Number(p.rpsAllocated), 0);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('📋 Your Active Subscriptions')
      .setDescription(`Total Allocated RPS: **${totalRps}**`)
      .setTimestamp();

    for (const purchase of purchases) {
      const expiryTimestamp = Math.floor(purchase.expiresAt.getTime() / 1000);
      embed.addFields({
        name: `${this.getTierEmoji(purchase.tier)} ${purchase.tier}`,
        value: `RPS: ${purchase.rpsAllocated}\nExpires: <t:${expiryTimestamp}:R>`,
        inline: true,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true } as any);
  }

  private getTierEmoji(tier: string): string {
    const emojis: Record<string, string> = {
      Basic: '📊',
      Ultra: '⚡',
      Elite: '💎',
    };
    return emojis[tier] || '📦';
  }

  private getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      PENDING: '⏳ Pending',
      PARTIAL: '⚠️ Partial',
      COMPLETED: '✅ Completed',
      EXPIRED: '❌ Expired',
    };
    return statusMap[status] || '❓ Unknown';
  }
}

