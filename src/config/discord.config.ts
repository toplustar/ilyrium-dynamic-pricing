import { registerAs } from '@nestjs/config';

export default registerAs('discord', () => ({
  botToken: process.env.DISCORD_BOT_TOKEN || '',
  clientId: process.env.DISCORD_CLIENT_ID || '',
  guildId: process.env.DISCORD_GUILD_ID || '',
  purchaseChannelId: process.env.DISCORD_PURCHASE_CHANNEL_ID || '',
}));

