require("dotenv").config();
const tmi = require("tmi.js");
const fs = require("fs");
const path = require("path");

// =========================
// PROTECTION ANTI-DOUBLON
// =========================
if (global.__TWITCH_STARTED__) return;
global.__TWITCH_STARTED__ = true;

// =========================
// HORODATAGE
// =========================
function time() {
  const d = new Date();
  const pad = n => n.toString().padStart(2, "0");
  return `[${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}

// =========================
// ENV
// =========================
const BOT_USERNAME = process.env.BOT_USERNAME;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_NAME = process.env.CHANNEL_NAME;

if (!BOT_USERNAME || !BOT_TOKEN || !CHANNEL_NAME) {
  console.error(`${time()} ❌ [Twitch] Variables d’environnement manquantes`);
  process.exit(1);
}

// =========================
// CLIENT TWITCH
// =========================
const client = new tmi.Client({
  options: { debug: false },
  connection: { secure: true, reconnect: true },
  identity: {
    username: BOT_USERNAME,
    password: BOT_TOKEN
  },
  channels: [CHANNEL_NAME]
});

// =========================
// ÉTAT
// =========================
const pauseState = { isPaused: false, stoppoints: false };

// =========================
// CHARGEMENT COMMANDES
// =========================
const commandes = new Map();
const commandesPath = path.join(__dirname, "commande");

if (fs.existsSync(commandesPath)) {
  fs.readdirSync(commandesPath).forEach(file => {
    if (!file.endsWith(".js")) return;
    try {
      const cmd = require(path.join(commandesPath, file));
      if (cmd?.name && typeof cmd.execute === "function") {
        commandes.set(cmd.name.toLowerCase(), cmd);
        console.log(`${time()} ✅ [Twitch] Commande chargée : !${cmd.name}`);
      }
    } catch (err) {
      console.error(`${time()} ❌ [Twitch] Erreur commande ${file}`, err);
    }
  });
}

// =========================
// CHARGEMENT INTERACTIONS (AVEC LOGS)
// =========================
const interactions = [];
const interactionsPath = path.join(__dirname, "interaction");

if (!fs.existsSync(interactionsPath)) {
  console.error(`${time()} ❌ [Twitch] Dossier interaction introuvable`);
} else {
  const files = fs.readdirSync(interactionsPath);
  console.log(`${time()} 📂 [Twitch] Fichiers interaction détectés :`, files);

  files.forEach(file => {
    if (!file.endsWith(".js")) return;

    try {
      const interaction = require(path.join(interactionsPath, file));

      if (typeof interaction.execute === "function") {
        interactions.push(interaction);
        console.log(`${time()} 🔹 [Twitch] Interaction chargée : ${file}`);
      } else {
        console.error(`${time()} ⚠️ [Twitch] ${file} ignoré (execute manquant)`);
      }

    } catch (err) {
      console.error(`${time()} ❌ [Twitch] Erreur interaction ${file}`, err);
    }
  });
}

console.log(`${time()} 📊 [Twitch] Total interactions chargées : ${interactions.length}`);

// =========================
// CONNEXION TWITCH
// =========================
(async () => {
  try {
    console.log(`${time()} ⌛ [Twitch] Connexion...`);
    await client.connect();
    console.log(`${time()} 🟢 [Twitch] Connecté sur ${CHANNEL_NAME}`);
  } catch (err) {
    console.error(`${time()} ❌ [Twitch] Connexion échouée`, err);
  }
})();

// =========================
// CHAT TWITCH
// =========================
client.removeAllListeners("message");

client.on("message", async (channel, tags, message, self) => {
  if (self) return;

  const username = tags["display-name"] || tags.username;
  console.log(`${time()} 💬 [Twitch] ${username}: ${message}`);

  // INTERACTIONS
  for (const interaction of interactions) {
    try {
      await interaction.execute({
        client,
        channel,
        tags,
        message,
        username,
        pauseState
      });
    } catch (err) {
      console.error(`${time()} ❌ [Twitch] Erreur interaction`, err);
    }
  }

  // COMMANDES
  if (!message.startsWith("!")) return;

  const args = message.slice(1).trim().split(/\s+/);
  const name = args.shift().toLowerCase();

  if (pauseState.isPaused && name !== "play") return;

  const command = commandes.get(name);
  if (!command) return;

  try {
    await command.execute(client, channel, tags, args, pauseState);
    console.log(`${time()} ▶️ [Twitch] !${name} exécutée par ${username}`);
  } catch (err) {
    console.error(`${time()} ❌ [Twitch] Erreur commande !${name}`, err);
  }
});

// =========================
// EXPORT
// =========================
module.exports = { client, pauseState };