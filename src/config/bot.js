/**
 * bot.js — A starter "OwO-style" Discord economy bot
 * ----------------------------------------------------
 * Features:
 *  - Prefix commands (default: "owo ")
 *  - Currency system (cowoncy) stored in a local JSON file (data.json)
 *  - Hunting & battling with cooldowns and random rewards
 *  - Daily rewards with streak tracking
 *  - Gambling: coinflip (cf) and slots (sl)
 *  - Balance / leaderboard
 *  - Marriage system (marry / divorce / pat)
 *
 * Setup:
 *  1. npm install discord.js
 *  2. Create a `.env` file (or set env var) with DISCORD_TOKEN=your_bot_token
 *  3. node bot.js
 *
 * This is a foundation, not a clone — extend commands, add real animals,
 * shop items, gems, etc. as you go. Data persistence is a flat JSON file,
 * which is fine for small servers but should be swapped for SQLite/Postgres
 * if you expect concurrent writes at scale.
 */

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
} = require('discord.js');

// ---------- CONFIG ----------
const PREFIX = 'owo ';
const TOKEN = process.env.DISCORD_TOKEN || 'PUT_YOUR_TOKEN_HERE';
const DATA_FILE = path.join(__dirname, 'data.json');

const COOLDOWNS = {
  hunt: 10 * 1000,        // 10 seconds
  battle: 10 * 1000,      // 10 seconds
  daily: 24 * 60 * 60 * 1000, // 24 hours
  pat: 5 * 1000,
};

// ---------- DATA LAYER ----------
// Structure:
// {
//   "userId": {
//     cowoncy: 0,
//     lastHunt: 0,
//     lastBattle: 0,
//     lastDaily: 0,
//     lastPat: 0,
//     dailyStreak: 0,
//     marriedTo: null,
//     animals: []
//   }
// }

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getUser(data, id) {
  if (!data[id]) {
    data[id] = {
      cowoncy: 0,
      lastHunt: 0,
      lastBattle: 0,
      lastDaily: 0,
      lastPat: 0,
      dailyStreak: 0,
      marriedTo: null,
      animals: [],
    };
  }
  return data[id];
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

function onCooldown(lastTimestamp, cooldownMs) {
  const now = Date.now();
  const remaining = lastTimestamp + cooldownMs - now;
  return remaining > 0 ? remaining : 0;
}

function fmtTime(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

// ---------- GAME CONTENT ----------
const ANIMALS = [
  { name: 'Rabbit', rarity: 'common', value: 10 },
  { name: 'Fox', rarity: 'common', value: 15 },
  { name: 'Owl', rarity: 'uncommon', value: 30 },
  { name: 'Wolf', rarity: 'uncommon', value: 45 },
  { name: 'Panda', rarity: 'rare', value: 100 },
  { name: 'Dragon', rarity: 'legendary', value: 500 },
];

function randomAnimal() {
  const roll = Math.random();
  if (roll < 0.55) return ANIMALS[0];
  if (roll < 0.75) return ANIMALS[1];
  if (roll < 0.88) return ANIMALS[2];
  if (roll < 0.96) return ANIMALS[3];
  if (roll < 0.995) return ANIMALS[4];
  return ANIMALS[5];
}

const BATTLE_MONSTERS = ['a slime', 'a goblin', 'a wild boar', 'a rogue knight', 'a shadow beast'];

// ---------- CLIENT ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.toLowerCase().startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  const data = loadData();
  const userId = message.author.id;
  const user = getUser(data, userId);

  try {
    switch (command) {
      case 'hunt': {
        const wait = onCooldown(user.lastHunt, COOLDOWNS.hunt);
        if (wait > 0) {
          return message.reply(`⏳ You're tired from your last hunt. Try again in ${fmtTime(wait)}.`);
        }
        user.lastHunt = Date.now();

        const animal = randomAnimal();
        const cowoncyGain = Math.floor(animal.value * (0.5 + Math.random() * 0.5));
        user.cowoncy += cowoncyGain;
        user.animals.push(animal.name);

        saveData(data);
        return message.reply(
          `🏹 You went hunting and found a **${animal.name}** (${animal.rarity})! You earned **${fmt(cowoncyGain)} cowoncy**.`
        );
      }

      case 'battle': {
        const wait = onCooldown(user.lastBattle, COOLDOWNS.battle);
        if (wait > 0) {
          return message.reply(`⏳ You're recovering from your last battle. Try again in ${fmtTime(wait)}.`);
        }
        user.lastBattle = Date.now();

        const monster = BATTLE_MONSTERS[Math.floor(Math.random() * BATTLE_MONSTERS.length)];
        const won = Math.random() < 0.7; // 70% win chance
        if (won) {
          const reward = 20 + Math.floor(Math.random() * 80);
          user.cowoncy += reward;
          saveData(data);
          return message.reply(`⚔️ You fought ${monster} and **won**! You earned **${fmt(reward)} cowoncy**.`);
        } else {
          const loss = Math.min(user.cowoncy, 10 + Math.floor(Math.random() * 30));
          user.cowoncy -= loss;
          saveData(data);
          return message.reply(`💀 You fought ${monster} and **lost**. You dropped **${fmt(loss)} cowoncy** fleeing.`);
        }
      }

      case 'daily': {
        const wait = onCooldown(user.lastDaily, COOLDOWNS.daily);
        if (wait > 0) {
          return message.reply(`⏳ You've already claimed today's reward. Come back in ${fmtTime(wait)}.`);
        }
        // streak resets if more than 48h have passed since last claim
        const brokeStreak = Date.now() - user.lastDaily > COOLDOWNS.daily * 2;
        user.dailyStreak = brokeStreak ? 1 : user.dailyStreak + 1;
        user.lastDaily = Date.now();

        const base = 100;
        const streakBonus = Math.min(user.dailyStreak * 10, 200);
        const total = base + streakBonus;
        user.cowoncy += total;

        saveData(data);
        return message.reply(
          `🎁 Daily reward claimed! You earned **${fmt(total)} cowoncy** (streak: ${user.dailyStreak} days).`
        );
      }

      case 'balance':
      case 'bal': {
        const target = message.mentions.users.first() || message.author;
        const targetUser = getUser(data, target.id);
        saveData(data);
        return message.reply(`💰 **${target.username}** has **${fmt(targetUser.cowoncy)} cowoncy**.`);
      }

      case 'zoo': {
        if (user.animals.length === 0) {
          return message.reply(`🦊 You haven't caught any animals yet. Try \`${PREFIX}hunt\`.`);
        }
        const counts = {};
        for (const a of user.animals) counts[a] = (counts[a] || 0) + 1;
        const list = Object.entries(counts)
          .map(([name, count]) => `${name} x${count}`)
          .join(', ');
        return message.reply(`🦁 Your zoo: ${list}`);
      }

      case 'cf':
      case 'coinflip': {
        const amount = parseInt(args[0], 10);
        if (!amount || amount <= 0) {
          return message.reply(`Usage: \`${PREFIX}cf <amount>\``);
        }
        if (amount > user.cowoncy) {
          return message.reply(`You don't have that much cowoncy. Balance: ${fmt(user.cowoncy)}.`);
        }
        const win = Math.random() < 0.5;
        if (win) {
          user.cowoncy += amount;
          saveData(data);
          return message.reply(`🪙 Heads! You won **${fmt(amount)} cowoncy**. New balance: ${fmt(user.cowoncy)}.`);
        } else {
          user.cowoncy -= amount;
          saveData(data);
          return message.reply(`🪙 Tails! You lost **${fmt(amount)} cowoncy**. New balance: ${fmt(user.cowoncy)}.`);
        }
      }

      case 'sl':
      case 'slots': {
        const amount = parseInt(args[0], 10);
        if (!amount || amount <= 0) {
          return message.reply(`Usage: \`${PREFIX}sl <amount>\``);
        }
        if (amount > user.cowoncy) {
          return message.reply(`You don't have that much cowoncy. Balance: ${fmt(user.cowoncy)}.`);
        }
        const symbols = ['🍒', '🍋', '🍇', '⭐', '💎'];
        const spin = () => symbols[Math.floor(Math.random() * symbols.length)];
        const [a, b, c] = [spin(), spin(), spin()];
        let multiplier = 0;
        if (a === b && b === c) multiplier = 5;
        else if (a === b || b === c || a === c) multiplier = 1.5;

        const result = Math.floor(amount * multiplier) - amount;
        user.cowoncy += result;
        saveData(data);

        return message.reply(
          `🎰 [ ${a} | ${b} | ${c} ]\n${result >= 0 ? `You won **${fmt(result)} cowoncy**!` : `You lost **${fmt(-result)} cowoncy**.`} New balance: ${fmt(user.cowoncy)}.`
        );
      }

      case 'marry': {
        const target = message.mentions.users.first();
        if (!target || target.id === userId) {
          return message.reply(`Mention someone to propose to: \`${PREFIX}marry @user\``);
        }
        if (user.marriedTo) {
          return message.reply(`You're already married to <@${user.marriedTo}>. Divorce first with \`${PREFIX}divorce\`.`);
        }
        const targetUser = getUser(data, target.id);
        if (targetUser.marriedTo) {
          return message.reply(`That person is already married to someone else.`);
        }
        user.marriedTo = target.id;
        targetUser.marriedTo = userId;
        saveData(data);
        return message.reply(`💍 Congratulations! You are now married to <@${target.id}>!`);
      }

      case 'divorce': {
        if (!user.marriedTo) {
          return message.reply(`You're not married to anyone.`);
        }
        const partner = getUser(data, user.marriedTo);
        partner.marriedTo = null;
        user.marriedTo = null;
        saveData(data);
        return message.reply(`💔 You are now divorced.`);
      }

      case 'pat': {
        const target = message.mentions.users.first();
        if (!target) {
          return message.reply(`Mention someone to pat: \`${PREFIX}pat @user\``);
        }
        const wait = onCooldown(user.lastPat, COOLDOWNS.pat);
        if (wait > 0) {
          return message.reply(`⏳ Slow down! Try again in ${fmtTime(wait)}.`);
        }
        user.lastPat = Date.now();
        const reward = 1 + Math.floor(Math.random() * 5);
        user.cowoncy += reward;
        saveData(data);
        return message.reply(`🖐️ You gave <@${target.id}> a nice pat and found **${fmt(reward)} cowoncy** on the ground!`);
      }

      case 'leaderboard':
      case 'lb': {
        const sorted = Object.entries(data)
          .sort((a, b) => b[1].cowoncy - a[1].cowoncy)
          .slice(0, 10);
        if (sorted.length === 0) return message.reply('No one has any cowoncy yet!');

        const embed = new EmbedBuilder()
          .setTitle('🏆 Cowoncy Leaderboard')
          .setColor(0xffcc00);

        let description = '';
        for (let i = 0; i < sorted.length; i++) {
          const [id, u] = sorted[i];
          description += `**${i + 1}.** <@${id}> — ${fmt(u.cowoncy)} cowoncy\n`;
        }
        embed.setDescription(description);
        return message.reply({ embeds: [embed] });
      }

      case 'help': {
        const embed = new EmbedBuilder()
          .setTitle('📖 Bot Commands')
          .setColor(0x00b0f4)
          .setDescription(
            [
              `\`${PREFIX}hunt\` — hunt for animals & cowoncy`,
              `\`${PREFIX}battle\` — fight monsters for cowoncy`,
              `\`${PREFIX}daily\` — claim your daily reward`,
              `\`${PREFIX}balance [@user]\` — check cowoncy balance`,
              `\`${PREFIX}zoo\` — view your collected animals`,
              `\`${PREFIX}cf <amount>\` — coinflip gamble`,
              `\`${PREFIX}sl <amount>\` — slots gamble`,
              `\`${PREFIX}marry @user\` / \`${PREFIX}divorce\` — marriage system`,
              `\`${PREFIX}pat @user\` — pat someone for a small reward`,
              `\`${PREFIX}leaderboard\` — top cowoncy holders`,
            ].join('\n')
          );
        return message.reply({ embeds: [embed] });
      }

      default:
        return; // unknown command, ignore
    }
  } catch (err) {
    console.error('Command error:', err);
    return message.reply('⚠️ Something went wrong running that command.');
  }
});

client.login(TOKEN);
