import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  Interaction,
  TextChannel,
  Message,
} from 'discord.js';
// @ts-ignore - Type conflicts in discord.js
import { GatewayIntentBits, ButtonStyle } from 'discord.js';

import { AppLogger } from '~/common/services/app-logger.service';

import { PurchaseService } from './purchase.service';

@Injectable()
export class DiscordBotService implements OnModuleInit {
  private client: Client;
  private readonly logger: AppLogger;

  constructor(
    private readonly configService: ConfigService,
    private readonly purchaseService: PurchaseService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('DiscordBotService');
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

  /**
   * Sends two separate messages for purchase flow:
   * 1. Purchase service button (blue)
   * 2. View subscriptions button (red)
   */
  async sendPurchaseServicesMessage(channelId: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        this.logger.error('ChannelError', 'Channel not found or not text-based', { channelId });
        return;
      }

      // Message 1: Purchase service button
      const purchaseRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('rpc_services')
          .setLabel('RPC Services')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔗'),
      );

      await (channel as TextChannel).send({
        content: '**Click the button to purchase service**',
        components: [purchaseRow] as any,
      });

      // Message 2: View subscriptions button
      const subscriptionsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('view_subscriptions')
          .setLabel('View My Active Subscriptions')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('📋'),
      );

      await (channel as TextChannel).send({
        content: '**Click the button to view your current service subscription**',
        components: [subscriptionsRow] as any,
      });

      this.logger.log('Purchase services messages sent', { channelId });
    } catch (error) {
      this.logger.error(
        'SendMessageError',
        'Failed to send purchase messages',
        { channelId },
        error as Error,
      );
    }
  }

  private setupEventHandlers(): void {
    this.client.on('ready', () => {
      this.logger.log(`Discord bot logged in as ${this.client.user?.tag}`);
    });

    // Handle text messages for commands
    this.client.on('messageCreate', async (message) => {
      try {
        // Ignore bot messages
        if (message.author.bot) return;

        const content = message.content.trim().toLowerCase();

        // Check if user is admin/owner
        const isAdmin = message.member?.permissions.has('Administrator') || false;

        // Admin command to setup purchase buttons
        if (content === '!purchase' || content === '!setup' || content === '!buy') {
          if (isAdmin) {
            await this.sendPurchaseServicesMessage(message.channelId);
            
            // Delete the command message
            try {
              await message.delete();
            } catch (error) {
              // Ignore if we can't delete (no permissions)
            }
          }
        } else if (!isAdmin) {
          // Delete non-admin messages in purchase channels to keep them clean
          const channel = message.channel;
          if (channel && 'name' in channel) {
            const channelName = (channel as any).name?.toLowerCase() || '';
            if (channelName.includes('purchase') || channelName.includes('buy') || channelName.includes('service')) {
              try {
                await message.delete();
                // Optionally send ephemeral message
                if (message.channel.isTextBased() && 'send' in message.channel) {
                  await (message.channel as TextChannel).send({
                    content: `<@${message.author.id}> Please use the buttons to interact with the purchase system.`,
                  }).then((msg: Message) => {
                    setTimeout(() => msg.delete().catch(() => {}), 3000);
                  }).catch(() => {});
                }
              } catch (error) {
                // Ignore if we can't delete (no permissions)
              }
            }
          }
        }
      } catch (error) {
        this.logger.error('MessageError', 'Failed to handle message', {}, error as Error);
      }
    });

    this.client.on('interactionCreate', async (interaction: Interaction) => {
      try {
        if (interaction.isButton()) {
          await this.handleButtonInteraction(interaction);
        }
      } catch (error) {
        this.logger.error('InteractionError', 'Failed to handle interaction', {}, error as Error);
        if (interaction.isRepliable()) {
          await interaction
            .reply({
              content: 'Sorry, something went wrong. Please try again later.',
              ephemeral: true,
            })
            .catch(() => {});
        }
      }
    });
  }

  // Private methods

  private async handleButtonInteraction(interaction: any): Promise<void> {
    const customId = interaction.customId;

    if (customId === 'rpc_services') {
      await this.purchaseService.showTierSelection(interaction);
    } else if (customId === 'view_subscriptions') {
      await this.purchaseService.showActiveSubscriptions(interaction);
    } else if (customId.startsWith('tier:')) {
      await this.purchaseService.showDurationSelection(interaction);
    } else if (customId.startsWith('duration:')) {
      await this.purchaseService.createPayment(interaction);
    } else if (customId.startsWith('check_payment:')) {
      await this.purchaseService.checkPaymentStatus(interaction);
    } else if (customId === 'back_to_tiers') {
      await this.purchaseService.showTierSelection(interaction);
    }
  }

}
