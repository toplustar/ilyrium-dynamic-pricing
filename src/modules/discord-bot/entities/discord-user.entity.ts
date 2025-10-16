import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('discord_users')
@Index(['discordId'], { unique: true })
export class DiscordUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'discord_id', unique: true })
  discordId: string;

  @Column({ nullable: true })
  username?: string;

  @Column({ name: 'global_name', nullable: true })
  globalName?: string;

  @Column({ name: 'discriminator', nullable: true })
  discriminator?: string;

  @Column({ name: 'last_interaction_at', type: 'timestamp', nullable: true })
  lastInteractionAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
