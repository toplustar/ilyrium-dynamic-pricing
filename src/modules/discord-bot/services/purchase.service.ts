import { Injectable } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonInteraction } from 'discord.js';
import { ButtonStyle } from 'discord.js';

import { ConfigService } from '@nestjs/config';
import { AppLogger } from '~/common/services/app-logger.service';
import { PaymentService } from '~/modules/payment/services/payment.service';
import { UsageService } from '~/modules/pricing/services/usage.service';
import { ApiKeyService } from '~/modules/api-key/services/api-key.service';
import { TierConfigInterface } from '~/config/tier.config';

import { DiscordUserService } from './discord-user.service';
import { DiscordNotificationService } from './discord-notification.service';

@Injectable()
export class PurchaseService {
  private readonly logger: AppLogger;
  private readonly rpcBackendUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly discordUserService: DiscordUserService,
    private readonly discordNotificationService: DiscordNotificationService,
    private readonly paymentService: PaymentService,
    private readonly usageService: UsageService,
    private readonly apiKeyService: ApiKeyService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('PurchaseService');
    this.rpcBackendUrl =
      this.configService.get<string>('urls.rpcBackendUrl') || 'http://localhost:3000/api/rpc';
  }

  async showTierSelection(interaction: ButtonInteraction): Promise<void> {
    const tierConfig = this.configService.get('tiers') as { tiers: TierConfigInterface[] };

    const row = new ActionRowBuilder<ButtonBuilder>();
    tierConfig.tiers.forEach(tier => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`tier:${tier.name}`)
          .setLabel(`${tier.name} (${tier.rps} r/s)`)
          .setStyle(ButtonStyle.Success),
      );
    });

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

    this.discordNotificationService.storeUserInteraction(user.id, discordId, interaction);

    const payment = await this.paymentService.createPaymentAttempt({
      userId: user.id,
      tier: tier as any,
      duration,
    });

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
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + payment.duration);
      const expiryTimestamp = Math.floor(expiresAt.getTime() / 1000);

      embed.setDescription(
        '✅ **Payment Completed Successfully!**\n\nYour RPC access is now active!\n\n🔒 **Your API key has been sent to your DMs for security.**',
      );
      embed.addFields(
        { name: '🌐 Backend URL', value: `\`${this.rpcBackendUrl}\``, inline: false },
        { name: '⏰ Expires', value: `<t:${expiryTimestamp}:F>`, inline: true },
        {
          name: '📊 Tier',
          value: `${payment.tier} (${payment.duration} day${payment.duration > 1 ? 's' : ''})`,
          inline: true,
        },
        {
          name: 'ℹ️ Usage',
          value:
            'Check your DMs for the API key and add it to your requests using the `X-API-Key` header',
          inline: false,
        },
      );

      await interaction.editReply({ embeds: [embed], components: [] } as any);
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
    try {
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
      const activeApiKeys = await this.getActiveApiKeys(user.id);

      if (purchases.length === 0 && activeApiKeys.length === 0) {
        await interaction.reply({
          content: '📭 You have no active subscriptions. Click "RPC Services" to purchase!',
          ephemeral: true,
        });
        return;
      }

      const { embed, components } = this.createSubscriptionsEmbed(user, purchases, activeApiKeys);
      await interaction.reply({
        embeds: [embed],
        components: components.length > 0 ? components : undefined,
        ephemeral: true,
      } as any);

      this.logger.log('Active subscriptions shown', {
        userId: user.id,
        discordId: interaction.user.id,
        activePurchases: purchases.length,
        activeApiKeys: activeApiKeys.length,
      });
    } catch (error) {
      this.logger.error(
        'ShowSubscriptionsError',
        'Failed to show active subscriptions',
        {},
        error as Error,
      );

      await interaction.reply({
        content:
          '❌ Sorry, something went wrong while fetching your subscriptions. Please try again later.',
        ephemeral: true,
      });
    }
  }

  private async getActiveApiKeys(userId: string): Promise<any[]> {
    const userApiKeys = await this.apiKeyService.getUserApiKeys(userId);
    return userApiKeys.filter(key => key.isActive && key.expiresAt > new Date() && !key.revokedAt);
  }

  private createSubscriptionsEmbed(
    user: any,
    purchases: any[],
    activeApiKeys: any[],
  ): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
    const totalRps = purchases.reduce((sum: number, p: any) => sum + Number(p.rpsAllocated), 0);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('📋 Your Active Subscriptions')
      .setDescription(`Total Allocated RPS: **${totalRps}**`)
      .setTimestamp()
      .setFooter({ text: `User: ${user.username || 'Unknown'}` });

    if (purchases.length > 0) {
      for (const purchase of purchases) {
        const expiryTimestamp = Math.floor(purchase.expiresAt.getTime() / 1000);
        embed.addFields({
          name: `${this.getTierEmoji(purchase.tier)} ${purchase.tier}`,
          value: `RPS: ${purchase.rpsAllocated}\n💰 Price: $${purchase.price}\nExpires: <t:${expiryTimestamp}:R>`,
          inline: true,
        });
      }
    }

    if (activeApiKeys.length > 0) {
      const apiKeysText = this.formatApiKeysText(activeApiKeys);
      embed.addFields({
        name: '🔑 Active API Keys',
        value: apiKeysText,
        inline: false,
      });
    }

    embed.addFields({
      name: '🌐 Backend URL',
      value: `\`${this.rpcBackendUrl}\``,
      inline: false,
    });

    const components = this.createApiKeyButtons(activeApiKeys);

    return { embed, components };
  }

  private createApiKeyButtons(activeApiKeys: any[]): ActionRowBuilder<ButtonBuilder>[] {
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    if (activeApiKeys.length === 0) {
      return components;
    }

    for (let i = 0; i < activeApiKeys.length; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      const keysInRow = activeApiKeys.slice(i, i + 5);

      for (const apiKey of keysInRow) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`regenerate_key:${apiKey.id}`)
            .setLabel(`Regenerate ${apiKey.name || 'Key'}`)
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔄'),
        );
      }

      components.push(row);
    }

    return components;
  }

  private formatApiKeysText(activeApiKeys: any[]): string {
    let apiKeysText = '';
    for (const apiKey of activeApiKeys) {
      const expiresIn = Math.ceil(
        (apiKey.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      apiKeysText += `**${apiKey.keyPrefix}*****` + '*'.repeat(20) + `\n`;
      apiKeysText += `🔑 Name: ${apiKey.name || 'Unnamed'}\n`;
      apiKeysText += `⏰ Expires in: ${expiresIn} days\n`;
      if (apiKey.lastUsedAt) {
        apiKeysText += `🕒 Last used: ${apiKey.lastUsedAt.toLocaleDateString()}\n`;
      }
      apiKeysText += '\n';
    }
    return apiKeysText || 'No active API keys';
  }

  /**
   * Handle API key regeneration with confirmation
   */
  async handleKeyRegeneration(interaction: ButtonInteraction): Promise<void> {
    try {
      const keyId = interaction.customId.split(':')[1];
      const discordUser = await this.discordUserService.getUserByDiscordId(interaction.user.id);

      if (!discordUser) {
        await interaction.reply({
          content: '❌ You are not registered in our system.',
          ephemeral: true,
        });
        return;
      }

      const existingKey = await this.apiKeyService.getUserApiKeys(discordUser.id);
      const targetKey = existingKey.find(key => key.id === keyId);

      if (!targetKey) {
        await interaction.reply({
          content: '❌ API key not found or you do not have permission to access it.',
          ephemeral: true,
        });
        return;
      }

      const confirmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Regenerate API Key')
        .setColor(0xff9900)
        .setDescription(
          `**Warning:** This action will **permanently invalidate** your current API key:\n` +
            `\`${targetKey.keyPrefix}*****\`\n\n` +
            `**This action cannot be undone!**\n` +
            `Any applications using this key will stop working immediately.\n\n` +
            `Do you want to continue?`,
        )
        .setFooter({ text: 'This will generate a new key and show it to you once.' });

      const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_regenerate:${keyId}`)
          .setLabel('Yes, Regenerate')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚠️'),
        new ButtonBuilder()
          .setCustomId('cancel_regenerate')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌'),
      );

      await interaction.reply({
        embeds: [confirmEmbed],
        components: [confirmRow],
        ephemeral: true,
      } as any);
    } catch (error) {
      this.logger.error(
        'KeyRegenerationError',
        'Failed to handle key regeneration',
        {},
        error as Error,
      );

      await interaction.reply({
        content: '❌ Sorry, something went wrong. Please try again later.',
        ephemeral: true,
      });
    }
  }

  /**
   * Confirm and execute API key regeneration
   */
  async confirmKeyRegeneration(interaction: ButtonInteraction): Promise<void> {
    try {
      const keyId = interaction.customId.split(':')[1];
      const discordUser = await this.discordUserService.getUserByDiscordId(interaction.user.id);

      if (!discordUser) {
        await interaction.reply({
          content: '❌ You are not registered in our system.',
          ephemeral: true,
        });
        return;
      }

      const existingKeys = await this.apiKeyService.getUserApiKeys(discordUser.id);
      const targetKey = existingKeys.find(key => key.id === keyId);

      if (!targetKey) {
        await interaction.reply({
          content: '❌ API key not found.',
          ephemeral: true,
        });
        return;
      }

      if (keyId) {
        await this.apiKeyService.revokeApiKey(keyId);
      }

      const newKey = await this.apiKeyService.createApiKey(
        discordUser.id,
        targetKey.name || undefined,
        targetKey.expiresAt,
      );

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ API Key Regenerated')
        .setColor(0x00ff00)
        .setDescription(
          `Your API key has been successfully regenerated!\n\n` +
            `**⚠️ IMPORTANT:** This is the **only time** you will see this key.\n` +
            `Please copy and save it securely.\n\n` +
            `**New API Key:**\n` +
            `\`\`\`\n${newKey.fullKey}\n\`\`\`\n\n` +
            `**Key Details:**\n` +
            `• Name: ${newKey.keyPrefix}\n` +
            `• Expires: ${newKey.expiresAt.toLocaleDateString()}\n` +
            `• Backend URL: \`${this.rpcBackendUrl}\``,
        )
        .setFooter({ text: 'Keep this key secure and do not share it with anyone.' })
        .setTimestamp();

      await interaction.reply({
        embeds: [successEmbed],
        ephemeral: true,
      } as any);

      this.logger.log('API key regenerated', {
        userId: discordUser.id,
        discordId: interaction.user.id,
        oldKeyId: keyId,
        newKeyId: newKey.id,
      });
    } catch (error) {
      this.logger.error(
        'ConfirmRegenerationError',
        'Failed to confirm key regeneration',
        {},
        error as Error,
      );

      await interaction.reply({
        content: '❌ Sorry, something went wrong during key regeneration. Please try again later.',
        ephemeral: true,
      });
    }
  }

  private getTierEmoji(tier: string): string {
    const tierConfig = this.configService.get('tiers') as { tiers: TierConfigInterface[] };
    const tierInfo = tierConfig.tiers.find(t => t.name === tier);
    return tierInfo?.emoji || '📦';
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
