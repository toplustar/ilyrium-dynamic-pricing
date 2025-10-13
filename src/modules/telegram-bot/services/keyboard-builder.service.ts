import { Injectable } from '@nestjs/common';
import { Markup } from 'telegraf';

@Injectable()
export class KeyboardBuilderService {
  /**
   * Build main menu keyboard
   */
  buildMainMenu(): any {
    return Markup.keyboard([
      ['📊 View Tiers', '💳 Buy Access'],
      ['🔑 My API Keys', '📈 Usage Stats'],
      ['💰 Balance', '❓ Help'],
    ])
      .resize()
      .oneTime(false);
  }

  /**
   * Build tier selection keyboard
   */
  buildTierSelection(): any {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('🚀 Starter', 'tier:Starter'),
        Markup.button.callback('💻 Developer', 'tier:Developer'),
      ],
      [
        Markup.button.callback('⚡ Professional', 'tier:Professional'),
        Markup.button.callback('💎 Enterprise', 'tier:Enterprise'),
      ],
      [Markup.button.callback('« Back', 'back:main')],
    ]);
  }

  /**
   * Build duration selection keyboard for a specific tier
   */
  buildDurationSelection(tier: string): any {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('7 Days', `duration:${tier}:7`),
        Markup.button.callback('15 Days', `duration:${tier}:15`),
      ],
      [
        Markup.button.callback('30 Days', `duration:${tier}:30`),
        Markup.button.callback('60 Days', `duration:${tier}:60`),
      ],
      [
        Markup.button.callback('90 Days', `duration:${tier}:90`),
        Markup.button.callback('180 Days', `duration:${tier}:180`),
      ],
      [Markup.button.callback('« Back to Tiers', 'back:tiers')],
    ]);
  }

  /**
   * Build payment confirmation keyboard
   */
  buildPaymentConfirmation(paymentAttemptId: string): any {
    return Markup.inlineKeyboard([
      [Markup.button.callback('✅ Check Payment Status', `check:${paymentAttemptId}`)],
      [Markup.button.callback('❌ Cancel', 'cancel:payment')],
    ]);
  }

  /**
   * Build API key actions keyboard
   */
  buildApiKeyActions(): any {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Create New Key', 'key:create'),
        Markup.button.callback('🗑️ Revoke Key', 'key:revoke'),
      ],
      [Markup.button.callback('« Back', 'back:main')],
    ]);
  }

  /**
   * Build key revocation selection keyboard
   */
  buildKeyRevocationList(keys: Array<{ id: string; name: string; prefix: string }>): any {
    const buttons = keys.map(key => [Markup.button.callback(`🗑️ ${key.name || key.prefix}`, `revoke:${key.id}`)]);

    buttons.push([Markup.button.callback('« Cancel', 'back:keys')]);

    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Build usage period selection keyboard
   */
  buildUsagePeriodSelection(): any {
    return Markup.inlineKeyboard([
      [Markup.button.callback('Today', 'usage:1'), Markup.button.callback('7 Days', 'usage:7')],
      [Markup.button.callback('30 Days', 'usage:30'), Markup.button.callback('All Time', 'usage:all')],
      [Markup.button.callback('« Back', 'back:main')],
    ]);
  }

  /**
   * Build simple back button
   */
  buildBackButton(action: string): any {
    return Markup.inlineKeyboard([[Markup.button.callback('« Back', action)]]);
  }

  /**
   * Remove keyboard
   */
  removeKeyboard(): any {
    return Markup.removeKeyboard();
  }
}
