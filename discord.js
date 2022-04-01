
const credutil = require('shared/util/credentials');
const credentials = credutil();
const redis = require('shared/services/redis');
const rabbitmq = require('shared/services/rabbitmq');

// Require the necessary discord.js classes
const { Client, Intents, MessageEmbed } = require('discord.js');

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


let messageReferences = {};


// When the client is ready, run this code (only once)
client.once('ready', async () => {
    console.log('Ready!');



    while (!rabbitmq.isActive() || !redis.isActive()) {
        console.warn("[GitWorker] waiting on rabbitmq and redis...");
        await sleep(1000);
    }


    await rabbitmq.subscribeQueue('notifyDiscord', onNotifyDiscord);
});

async function onNotifyDiscord(msg) {
    try {
        await notifyDiscord(msg);

    }
    catch (e) {
        console.error(e);
    }
}

async function notifyDiscord(msg) {

    if (!msg) {
        console.error("Missing message: ", msg);
        return;
    }

    let type = msg.type;
    if (!type) {
        console.error("Message Type invalid: ", type);
        return;
    }

    console.log("Received Discord Message: ", msg);
    const channelLog = client.channels.cache.get('959286082518790184');
    const channelQueue = client.channels.cache.get('959305194477322260');
    if (!channelLog || !channelQueue) {
        console.error("Channel does not exist.", channelLog, channelQueue);
        return;
    }
    let playerOutput = '';
    let thumbnail = 'https://cdn.acos.games/file/acospub/g/' + msg.game_slug + '/preview/' + msg.thumbnail;
    let embed = new MessageEmbed();
    embed = embed
        .setColor('#0099ff')
        .setTitle(msg.game_title)

        .setThumbnail(thumbnail)
        .setTimestamp()

    var msgRef = null;
    switch (type) {
        case 'queue':
            try {
                // let queuePlayers = await redis.hgetall('queuePlayers');
                // let queueExists = await redis.hgetall('queueExists');

                // for (var q in queueExists) {
                //     let parts = q.split('/');
                //     let mode = parts[0];
                //     let game_slug = parts[1];
                let key = msg.mode + '/' + msg.game_slug;
                let queueList = await redis.smembers('queues/' + key);
                let shortid;
                let username;

                for (var i = 0; i < queueList.length; i++) {
                    shortid = queueList[i];
                    username = await redis.hget('queuePlayers', shortid);

                    playerOutput += (i + 1) + '. ' + username.replace(/"/ig, '');
                    // this.addToQueue(shortid, username, game_slug, mode, true);
                }

                embed = embed
                    .setAuthor({ name: msg.mode.toUpperCase() + ' Queue' })
                    .setURL('https://acos.games/join/' + msg.game_slug + '+' + msg.mode)
                    .setDescription(`Join now by clicking thumbnail.\n\n${playerOutput}`)
                // channelLog.send({ embeds: [embed] });

                playerOutput += '**Players waiting in queue**\n';


                console.log(queueList);
                // this.addToQueue()
                // }
                // console.log(queuePlayers);

                if (!(key in messageReferences)) {
                    msgRef = await channelQueue.send({ embeds: [embed] })
                    messageReferences[key] = msgRef;
                }
                else {
                    let alreadyCreated = false;
                    msgRef = messageReferences[key];
                    if (!msgRef) {
                        msgRef = await channelQueue.send({ embeds: [embed] })
                        alreadyCreated = true;
                        if (!msgRef) {
                            console.error("Message Ref does not exist: ", key);
                            return;
                        }
                    }

                    if (!alreadyCreated)
                        msgRef.edit({ embeds: [embed] })
                }

                if (queueList.length == 0) {
                    if (msgRef) {
                        try {
                            await msgRef.delete();
                        }
                        catch (e) {
                            console.error(e);
                        }
                    }
                    delete messageReferences[key];
                }

            }
            catch (e) {
                console.error(e);
            }

            break;
        case 'join':
            playerOutput += '**Players**\n'
            for (var i = 0; i < msg.actions.length; i++) {
                let action = msg.actions[i];
                if (!action)
                    continue;
                let player = action.user;
                if (!player)
                    continue;
                playerOutput += (i + 1) + '. ' + player.name + '\n';
            }

            embed = embed
                .setAuthor({ name: 'New Game Started' })
                .setDescription(`${playerOutput}`)
                .setURL('https://acos.games/g/' + msg.game_slug)
            channelLog.send({ embeds: [embed] });
            break;
        case 'score':
            let title = 'Game Over';
            let desc = `**${msg.user}** ended with score ${msg.score}.  Their highest score is ${msg.highscore}`;
            if (msg.score >= msg.highscore) {
                title = "NEW HIGHSCORE!"
                desc = `**${msg.user}** got a new highscore of **${msg.highscore}**!`;
            }
            embed = embed
                .setAuthor({ name: title })
                .setDescription(desc)
                .setURL('https://acos.games/g/' + msg.game_slug)
            channelLog.send({ embeds: [embed] });
            break;
        case 'gameover':


            msg.users.sort((a, b) => {
                return a.rank - b.rank;
            })

            playerOutput += '**Room Ranking**\n'
            for (var i = 0; i < msg.users.length; i++) {
                let player = msg.users[i];
                playerOutput += (player.rank) + '. ' + player.name + ' (' + player.rating + ' / ' + player.ratingTxt + ')\n';
            }

            embed = embed
                .setAuthor({ name: 'Game Over' })
                .setDescription(`${playerOutput}`)
                .setURL('https://acos.games/g/' + msg.game_slug)

            channelLog.send({ embeds: [embed] });
            break;
    }

    // inside a command, event listener, etc.



}



// Login to Discord with your client's token
client.login(credentials.discord.token);
