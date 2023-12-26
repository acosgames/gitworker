
const credutil = require('shared/util/credentials');
const credentials = credutil();
const redis = require('shared/services/redis');
const rabbitmq = require('shared/services/rabbitmq');
const storage = require('./storage');

const rank = require('./rank');

const ObjectStorageService = require("shared/services/objectstorage");
const s3 = new ObjectStorageService();

const room = require('shared/services/room');

const MIN_UPDATES_REQUIRED = 1;


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    while (!rabbitmq.isActive() || !redis.isActive()) {
        console.warn("[GitWorker] waiting on rabbitmq and redis...");
        await sleep(1000);
    }


    console.log("NODE_APP_INSTANCE = ", process.env.NODE_APP_INSTANCE);

    setTimeout(async () => {

        let qWS = await rabbitmq.findExistingQueue('gameover');;
        await rabbitmq.subscribeQueue(qWS, onRoomGameover);

        setTimeout(async () => {

            let queueKey = await rabbitmq.subscribe('ws', 'onRoomGameover', onRoomGameover, qWS);
        }, 100)
    }, 100)

}

let replays = {};
let roomMetas = {};

async function onRoomGameover(msg) {
    // profiler.StartTime('onRoomUpdate');
    let room_slug = msg.room_slug;
    if (!room_slug)
        return true;

    if (process.env.NODE_ENV == 'localhost' || process.env.NODE_ENV == 'mobile') {
        //return true;
    }

    try {
        let gamestate = structuredClone(msg);// JSON.parse(JSON.stringify(msg));

        if (gamestate.type == 'gameover') {

            try {
                let meta = await storage.getRoomMeta(room_slug);

                if (meta.mode != 'rank') {
                    console.warn('Post Game Manager only created for RANK modes: ' + room_slug, meta.mode);
                    return true;
                }

                onGameover(meta, gamestate)
                return true;
            }
            catch (e) {
                console.error(e);
            }

        }

        return true;
    }
    catch (e) {
        console.error(e);
    }
    return false;
}

async function onGameover(meta, gamestate) {

    console.log("GAMEOVER: ", meta, gamestate)
    if (room.getGameModeName(meta.mode) == 'rank' || meta.mode == 'rank') {
        let storedPlayerRatings = {};
        if (gamestate?.timer?.sequence > 2) {
            if (meta.maxplayers > 1) {
                await rank.processPlayerRatings(meta, gamestate.players, gamestate.teams, storedPlayerRatings);
                await room.updateLeaderboard(meta.game_slug, gamestate.players);
            }
        }

        if (meta.lbscore || meta.maxplayers == 1) {
            console.log("Updating high scores: ", gamestate.players);
            await rank.processPlayerHighscores(meta, gamestate.players, storedPlayerRatings);
            await room.updateLeaderboardHighscore(meta.game_slug, gamestate.players);
        }
    }
}

run();