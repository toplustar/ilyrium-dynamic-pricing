import { Injectable } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonInteraction } from 'discord.js';
import { ButtonStyle } from 'discord.js';

import { ConfigService } from '@nestjs/config';
import { AppLogger } from '~/common/services/app-logger.service';
import { PaymentService } from '~/modules/payment/services/payment.service';
import { ApiKeyService } from '~/modules/api-key/services/api-key.service';
import { UsageService } from '~/modules/pricing/services/usage.service';

import { DiscordUserService } from './discord-user.service';

@Injectable()
export class PurchaseService {
  private readonly logger: AppLogger;
  private readonly rpcEndpoint: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly discordUserService: DiscordUserService,
    private readonly paymentService: PaymentService,
    private readonly apiKeyService: ApiKeyService,
    private readonly usageService: UsageService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('PurchaseService');
    this.rpcEndpoint = this.configService.get<string>(
      'app.rpcEndpoint',
      'elite.rpc.solanavibestation.com',
    );
  }

  async showTierSelection(interaction: ButtonInteraction): Promise<void> {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('tier:Basic')
        .setLabel('Basic (10 r/s)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('tier:Ultra')
        .setLabel('Ultra (25 r/s)')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('tier:Elite')
        .setLabel('Elite (50 r/s)')
        .setStyle(ButtonStyle.Success),
    );

    await interaction.reply({
      content: 'What tier would you like to purchase? You can choose from:',
      components: [row],
      ephemeral: true,
    } as any);
  }

  async showDurationSelection(interaction: ButtonInteraction): Promise<void> {
    const tier = interaction.customId.split(':')[1] || 'Basic';

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`duration:${tier}:1`)
        .setLabel('1 Day')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`duration:${tier}:7`)
        .setLabel('1 Week')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`duration:${tier}:30`)
        .setLabel('1 Month')
        .setStyle(ButtonStyle.Success),
    );

    await interaction.reply({
      content: 'How long do you need the service for? You can choose from:',
      components: [row],
      ephemeral: true,
    } as any);
  }

  async createPayment(interaction: ButtonInteraction): Promise<void> {
    // Show "Creating payment link..." message
    await interaction.reply({
      content: 'Creating payment link...',
      ephemeral: true,
    } as any);

    const parts = interaction.customId.split(':');
    const tier = parts[1] || 'Basic';
    const duration = parseInt(parts[2] || '1', 10);

    const discordId = interaction.user.id;
    const username = interaction.user.username;
    const globalName = interaction.user.globalName ?? undefined;
    const discriminator = interaction.user.discriminator ?? undefined;

    const user = await this.discordUserService.findOrCreate(
      discordId,
      username,
      globalName,
      discriminator,
    );

    const payment = await this.paymentService.createPaymentAttempt({
      userId: user.id,
      tier: tier as any,
      duration,
    });

    // Format payment details as plain text
    const paymentMessage = `To complete your purchase for **${duration} day(s)**, please send the **EXACT** amount in SOL to the below address.

**Amount**
${payment.amountExpected} SOL

**Address** (Unique for your payment)
\`${payment.walletAddress}\`

⚠️ Send ONLY to this address. No memo required!

⏰ This payment link will expire in 1 hour. Please complete your payment before then!`;

    await interaction.followUp({
      content: paymentMessage,
      ephemeral: true,
    } as any);

    this.logger.log('Payment created for Discord user', {
      userId: user.id,
      discordId,
      paymentId: payment.id,
      tier,
      duration,
      amount: payment.amountExpected,
    });
  }

  async checkPaymentStatus(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferUpdate();

    const paymentId = interaction.customId.split(':')[1] || '';
    const payment = await this.paymentService.getPaymentAttemptById(paymentId);

    if (!payment) {
      await interaction.followUp({
        content: '❌ Payment not found.',
        ephemeral: true,
      });
      return;
    }

    const statusColor =
      String(payment.status) === 'COMPLETED'
        ? 0x00ff00
        : String(payment.status) === 'PARTIAL'
          ? 0xffa500
          : 0xff0000;

    const embed = new EmbedBuilder()
      .setColor(statusColor)
      .setTitle('💳 Payment Status')
      .addFields(
        { name: 'Status', value: this.getStatusText(payment.status), inline: true },
        {
          name: 'Amount Paid',
          value: `${payment.amountPaid}/${payment.amountExpected} SOL`,
          inline: true,
        },
        {
          name: 'Payment Address',
          value: `\`${payment.paymentAddress || 'N/A'}\``,
          inline: false,
        },
      )
      .setTimestamp();

    if (String(payment.status) === 'COMPLETED') {
      const discordUser = await this.discordUserService.getUserById(payment.userId);
      if (discordUser) {
        const apiKey = await this.apiKeyService.createApiKey(
          discordUser.id,
          `${payment.tier}-access`,
        );

        embed.setDescription(
          '✅ **Payment Completed Successfully!**\n\nYour RPC access is now active!',
        );
        embed.addFields(
          { name: '🔑 API Key', value: `||\`${apiKey.fullKey}\`||`, inline: false },
          { name: '🌐 RPC Endpoint', value: `\`https://${this.rpcEndpoint}\``, inline: false },
          {
            name: 'ℹ️ Usage',
            value: 'Add the API key to your requests using the `X-API-Key` header',
            inline: false,
          },
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
          .setStyle(ButtonStyle.Danger),
      );

      await interaction.editReply({ embeds: [embed], components: [row] } as any);
    }
  }

  async showActiveSubscriptions(interaction: ButtonInteraction): Promise<void> {
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
