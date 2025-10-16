import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  Interaction,
  TextChannel,
  Message,
  GatewayIntentBits,
  ButtonStyle,
} from 'discord.js';
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

  async sendPurchaseServicesMessage(channelId: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        this.logger.error('ChannelError', 'Channel not found or not text-based', { channelId });
        return;
      }

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
    } catch (err) {
      this.logger.error(
        'SendMessageError',
        'Failed to send purchase messages',
        { channelId },
        err as Error,
      );
    }
  }

  private setupEventHandlers(): void {
    this.client.on('ready', (): void => {
      this.logger.log(`Discord bot logged in as ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', (message: Message): void => {
      void this.handleMessage(message).catch(err =>
        this.logger.error('MessageError', 'Failed to handle message', {}, err as Error),
      );
    });

    this.client.on('interactionCreate', (interaction: Interaction): void => {
      void (async (): Promise<void> => {
        try {
          if (interaction.isButton()) {
            await this.handleButtonInteraction(interaction);
          }
        } catch (err) {
          this.logger.error('InteractionError', 'Failed to handle interaction', {}, err as Error);
          if (interaction.isRepliable()) {
            await interaction
              .reply({
                content: 'Sorry, something went wrong. Please try again later.',
                ephemeral: true,
              })
              .catch(() => {});
          }
        }
      })();
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.author.bot) return;

    const content = message.content.trim().toLowerCase();
    const isAdmin = message.member?.permissions.has('Administrator') || false;

    if (isAdmin && ['!purchase', '!setup', '!buy'].includes(content)) {
      await this.sendPurchaseServicesMessage(message.channelId);
      await message.delete().catch(() => {});
      return;
    }

    if (!isAdmin && message.channel.isTextBased()) {
      const channel = message.channel as TextChannel;
      const name = channel.name?.toLowerCase() || '';
      const isPurchaseChannel =
        name.includes('purchase') || name.includes('buy') || name.includes('service');

      if (isPurchaseChannel) {
        await message.delete().catch(() => {});
        const msg = await channel
          .send({
            content: `<@${message.author.id}> Please use the buttons to interact with the purchase system.`,
          })
          .catch(() => undefined);

        if (msg) {
          setTimeout(() => {
            void msg.delete().catch(() => {});
          }, 3000);
        }
      }
    }
  }

  private async handleButtonInteraction(interaction: any): Promise<void> {
    const { customId } = interaction;

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
