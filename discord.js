require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const play = require('play-dl');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');

// Configuración de FFMPEG
if (ffmpegPath) {
    process.env.FFMPEG_PATH = ffmpegPath;
    console.log('✅ FFMPEG configurado correctamente');
} else {
    console.error('❌ No se pudo encontrar FFMPEG. Verifica que ffmpeg-static esté instalado.');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

const player = createAudioPlayer();

// Validación de URLs de YouTube
async function validateYouTubeUrl(url) {
    try {
        const urlType = await play.yt_validate(url);
        return urlType === 'video' || urlType === 'playlist';
    } catch {
        return false;
    }
}

// Función para reproducir la canción
async function playSong(url, interaction) {
    try {
        await interaction.deferReply();

        if (!interaction.member.voice.channel) {
            return interaction.editReply("❌ Debes estar en un canal de voz primero.");
        }

        if (!(await validateYouTubeUrl(url))) {
            return interaction.editReply("❌ URL de YouTube no válida.");
        }

        const connection = joinVoiceChannel({
            channelId: interaction.member.voice.channel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        // Obtener información del video
        const info = await play.video_info(url);
        const stream = await play.stream(url, {
            quality: 2,
            discordPlayerCompatibility: true
        });

        if (!stream || !stream.stream) {
            console.error('❌ Stream vacío o no válido');
            return interaction.editReply("❌ No se pudo obtener el stream de audio.");
        }

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });

        connection.subscribe(player);
        player.play(resource);

        console.log('🎧 Reproduciendo:', info.video_details.title);

        const embed = new EmbedBuilder()
            .setTitle('🎵 Reproduciendo ahora')
            .setDescription(`[${info.video_details.title}](${url})`)
            .setThumbnail(info.video_details.thumbnails[0].url)
            .setColor('#00ff00');

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('❌ Error al reproducir:', error);

        if (!interaction.deferred && !interaction.replied) {
            await interaction.reply('❌ Error al reproducir el audio. Intenta con otro enlace.');
        } else {
            await interaction.editReply('❌ Error al reproducir el audio. Intenta con otro enlace.');
        }
    }
}

// Comando /play
const playCommand = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproduce música desde YouTube')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL de YouTube')
                .setRequired(true)),
    async execute(interaction) {
        try {
            const url = interaction.options.getString('url');
            await playSong(url, interaction);
        } catch (error) {
            console.error('❌ Error en el comando /play:', error);
            if (!interaction.deferred && !interaction.replied) {
                await interaction.reply('❌ Ocurrió un error al procesar tu solicitud.');
            }
        }
    }
};

// Eventos del cliente
client.on('ready', () => {
    console.log(`✅ Bot listo como ${client.user.tag}`);
    client.application.commands.create(playCommand.data)
        .then(() => console.log('✅ Comando /play registrado'))
        .catch(console.error);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'play') {
        await playCommand.execute(interaction);
    }
});

// Manejo de errores del reproductor
player.on('error', error => {
    console.error('❌ Error en el reproductor de audio:', error);
});

// Iniciar sesión
client.login(process.env.DISCORD_TOKEN);
