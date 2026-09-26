import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { config } from '../config.js';
import { submitPost, resolveIncident } from './post-submit.js';
import { updatePost, getPost, getSetting, setSetting, setMaintenanceMode, getStatusSummary } from './post.js';

let client: Client | null = null;

const commands = [
  new SlashCommandBuilder()
    .setName('post')
    .setDescription('ステータス投稿を作成')
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('投稿タイプ')
        .setRequired(true)
        .addChoices(
          { name: '障害', value: 'incident' },
          { name: 'メンテナンス', value: 'maintenance' },
          { name: 'アップデート', value: 'update' },
          { name: '復旧', value: 'resolved' },
        ),
    )
    .addStringOption((opt) =>
      opt.setName('title').setDescription('タイトル').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('content').setDescription('本文 (Markdown対応)').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('status')
        .setDescription('ステータス (省略時はタイプに合わせて自動設定)')
        .addChoices(
          { name: 'なし', value: 'none' },
          { name: '予定（メンテ予告など）', value: 'scheduled' },
          { name: '調査中', value: 'investigating' },
          { name: '原因特定', value: 'identified' },
          { name: '経過観察', value: 'monitoring' },
          { name: '解決済み', value: 'resolved' },
        ),
    ),

  new SlashCommandBuilder()
    .setName('update')
    .setDescription('既存の投稿を更新')
    .addIntegerOption((opt) =>
      opt.setName('id').setDescription('投稿ID').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('content').setDescription('更新内容').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('status')
        .setDescription('ステータス変更')
        .addChoices(
          { name: '予定（メンテ予告など）', value: 'scheduled' },
          { name: '調査中', value: 'investigating' },
          { name: '原因特定', value: 'identified' },
          { name: '経過観察', value: 'monitoring' },
          { name: '解決済み', value: 'resolved' },
        ),
    ),

  new SlashCommandBuilder()
    .setName('resolve')
    .setDescription('障害を解決済みにしてリダイレクトを再開')
    .addIntegerOption((opt) =>
      opt.setName('id').setDescription('投稿ID (省略で最新の未解決の障害)'),
    )
    .addStringOption((opt) =>
      opt.setName('message').setDescription('復旧のお知らせ本文 (指定すると「復旧」を投稿して通知)'),
    ),

  new SlashCommandBuilder()
    .setName('toggle')
    .setDescription('リダイレクトの ON/OFF を切り替え'),

  new SlashCommandBuilder()
    .setName('maintenance')
    .setDescription('メンテナンスモードの ON/OFF を切り替え')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('明示的に指定 (省略でトグル)')
        .addChoices(
          { name: 'ON', value: 'on' },
          { name: 'OFF', value: 'off' },
        ),
    ),

  new SlashCommandBuilder()
    .setName('check')
    .setDescription('現在のステータスを確認'),
];

function isOwner(interaction: ChatInputCommandInteraction): boolean {
  return interaction.user.id === config.discordOwnerId;
}

/**
 * 返信は応答期限切れ（Unknown interaction）などで失敗しうる。discord.js のイベント
 * ハンドラから例外が漏れると client の 'error' 経由で uncaughtException になり、
 * プロセスごと終了する（= payroll-app の障害監視が止まる）ので、失敗はログだけにする。
 */
async function safeReply(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error('[Discord Bot] Reply failed:', (err as Error).message);
  }
}

async function handlePost(interaction: ChatInputCommandInteraction): Promise<void> {
  const type = interaction.options.getString('type', true);
  const title = interaction.options.getString('title', true);
  const content = interaction.options.getString('content', true);
  const status = interaction.options.getString('status');

  const post = submitPost({ type, title, content, status, source: 'discord' });

  await interaction.reply({
    content: `投稿 #${post.id} を作成しました\n**${title}**\nタイプ: ${type} / ステータス: ${post.status}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleUpdate(interaction: ChatInputCommandInteraction): Promise<void> {
  const id = interaction.options.getInteger('id', true);
  const content = interaction.options.getString('content', true);
  const status = interaction.options.getString('status');

  const existing = getPost(id);
  if (!existing) {
    await interaction.reply({ content: `❌ 投稿 #${id} が見つかりません`, flags: MessageFlags.Ephemeral });
    return;
  }

  const updateData: { content: string; status?: string } = { content };
  if (status) updateData.status = status;

  updatePost(id, updateData);

  await interaction.reply({
    content: `✅ 投稿 #${id} を更新しました`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleResolve(interaction: ChatInputCommandInteraction): Promise<void> {
  const result = resolveIncident({
    id: interaction.options.getInteger('id'),
    message: interaction.options.getString('message'),
    resumeRedirect: true,
    source: 'discord',
  });

  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.error}`, flags: MessageFlags.Ephemeral });
    return;
  }

  const lines = [
    `✅ 投稿 #${result.incident.id}「${result.incident.title}」を解決済みにしました`,
    'リダイレクトを再開しました',
  ];
  if (result.recoveryPost) lines.push(`復旧のお知らせ #${result.recoveryPost.id} を投稿しました`);
  if (getSetting('last_health_status') === 'down') {
    lines.push('⚠️ ヘルスチェックはまだ応答なしのため、応答が戻るまで表示は障害発生中のままです');
  }

  await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
}

async function handleToggle(interaction: ChatInputCommandInteraction): Promise<void> {
  const current = getSetting('redirect_enabled') === 'true';
  const newValue = !current;
  setSetting('redirect_enabled', String(newValue));
  // 手動操作なので、復旧時の自動 ON 対象から外す
  setSetting('redirect_auto_disabled', 'false');

  await interaction.reply({
    content: newValue
      ? '🔄 リダイレクト ON — payroll.warionate.com へ転送します'
      : '📋 リダイレクト OFF — ステータスページを表示します',
    flags: MessageFlags.Ephemeral,
  });
}

async function handleMaintenance(interaction: ChatInputCommandInteraction): Promise<void> {
  const mode = interaction.options.getString('mode');
  let newValue: boolean;
  if (mode === 'on') newValue = true;
  else if (mode === 'off') newValue = false;
  else newValue = !(getSetting('maintenance_mode') === 'true');

  setMaintenanceMode(newValue);

  await interaction.reply({
    content: newValue
      ? '🛠 メンテナンスモード ON — Cloudflare Worker がメンテナンスページを返します'
      : '✅ メンテナンスモード OFF — 通常運用に戻りました',
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCheck(interaction: ChatInputCommandInteraction): Promise<void> {
  const summary = getStatusSummary();

  const lastCheck = summary.lastCheckAt
    ? new Date(summary.lastCheckAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    : '未チェック';

  const redirectLine = summary.redirectEnabled
    ? summary.redirectActive
      ? 'ON'
      : `ON (停止中: ${summary.status})`
    : 'OFF';

  await interaction.reply({
    content: [
      `**ステータス**: ${summary.status}${summary.statusOverride !== 'auto' ? ' (手動)' : ''}`,
      `**リダイレクト**: ${redirectLine}`,
      `**メンテナンス**: ${summary.maintenanceMode ? 'ON' : 'OFF'}`,
      `**ヘルスチェック**: ${summary.lastHealthStatus}`,
      `**最終チェック**: ${lastCheck}`,
      `**投稿数**: ${summary.recentPosts.length}件`,
    ].join('\n'),
    flags: MessageFlags.Ephemeral,
  });
}

export async function startDiscordBot(): Promise<void> {
  if (!config.discordBotToken) {
    console.warn('[Discord Bot] Token not configured, skipping bot initialization');
    return;
  }

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(config.discordBotToken);

  try {
    if (config.discordGuildId) {
      await rest.put(
        Routes.applicationGuildCommands(
          (await rest.get(Routes.oauth2CurrentApplication()) as { id: string }).id,
          config.discordGuildId,
        ),
        { body: commands.map((c) => c.toJSON()) },
      );
      console.log('[Discord Bot] Slash commands registered (guild)');
    }
  } catch (err) {
    console.error('[Discord Bot] Failed to register commands:', (err as Error).message);
  }

  // Start bot
  client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.on('clientReady', () => {
    console.log(`[Discord Bot] Logged in as ${client!.user?.tag}`);
  });

  // 'error' の受け手が無いと、Gateway の切断などでも例外として投げられてプロセスが落ちる
  client.on('error', (err) => {
    console.error('[Discord Bot] Client error:', err.message);
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!isOwner(interaction)) {
      await safeReply(interaction, '❌ 権限がありません');
      return;
    }

    try {
      switch (interaction.commandName) {
        case 'post':
          await handlePost(interaction);
          break;
        case 'update':
          await handleUpdate(interaction);
          break;
        case 'resolve':
          await handleResolve(interaction);
          break;
        case 'toggle':
          await handleToggle(interaction);
          break;
        case 'maintenance':
          await handleMaintenance(interaction);
          break;
        case 'check':
          await handleCheck(interaction);
          break;
        default:
          await interaction.reply({ content: '❌ 不明なコマンド', flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      console.error('[Discord Bot] Command error:', (err as Error).message);
      if (!interaction.replied) {
        await safeReply(interaction, '❌ エラーが発生しました');
      }
    }
  });

  await client.login(config.discordBotToken);
}
