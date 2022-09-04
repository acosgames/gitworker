
const credutil = require('shared/util/credentials');
const credentials = credutil();
const redis = require('shared/services/redis');
const rabbitmq = require('shared/services/rabbitmq');

const zlib = require("zlib");

const storage = require('./storage');
const { encode } = require('shared/util/encoder');

const BackBlazeService = require("./BackBlazeService");
const s3 = new BackBlazeService();
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


    let qWS = await rabbitmq.findExistingQueue('replayManager');;
    await rabbitmq.subscribeQueue(qWS, onRoomUpdate);

    setTimeout(async () => {
        let queueKey = await rabbitmq.subscribe('ws', 'onRoomUpdate', onRoomUpdate, qWS);
    }, 3000)

}

let replays = {};
let roomMetas = {};

async function onRoomUpdate(msg) {
    // profiler.StartTime('onRoomUpdate');
    let room_slug = msg.room_slug;
    if (!room_slug)
        return true;

    try {

        let history = replays[room_slug];
        if (!history) {
            history = [];
        }

        // let gamestate = delta.merge(previousGamestate, msg.payload);
        // if (!gamestate) {
        //     return true;
        // }

        // let playerList = Object.keys(gamestate.players || {});
        // console.log("Delta: ", msg);
        // console.log("Updated Game: ", gamestate);

        //remove private variables and send individually to palyers
        let copy = JSON.parse(JSON.stringify(msg));
        // let hiddenState = delta.hidden(copy.payload.state);
        // let hiddenPlayers = delta.hidden(copy.payload.players);

        // storage.setRoomState(room_slug, gamestate);


        // if (hiddenPlayers)
        // {

        // }

        if (copy.type == 'noshow' || copy.type == 'error') {
            if (replays[room_slug]) {
                delete replays[room_slug];
                delete roomMetas[room_slug];
                return;
            }
        }

        if (copy.type == 'join') {
            roomMetas[room_slug] = await storage.getRoomMeta(room_slug);
        }

        history.push(copy)

        if (copy.type == 'gameover') {

            try {
                saveReplay(room_slug);
            }
            catch (e) {
                console.error(e);
                if (replays[room_slug]) {
                    delete replays[room_slug];
                    delete roomMetas[room_slug];
                    return;
                }
            }

        }

        replays[room_slug] = history;

        // setTimeout(() => {
        // let encoded = encode(copy);
        // console.log("Publishing [" + room_slug + "] with " + encoded.byteLength + ' bytes', JSON.stringify(copy, null, 2));
        // app.publish(room_slug, encoded, true, false)
        // // }, 200)

        // profiler.EndTime('ActionUpdateLoop');

        return true;
    }
    catch (e) {
        console.error(e);
    }
    return false;
}

async function saveReplay(room_slug) {

    return new Promise((rs, rj) => {
        let history = replays[room_slug];
        if (!history) {
            rj(new Error('Missing history' + room_slug));
            return;
        }

        if (history.length < MIN_UPDATES_REQUIRED) {
            rj(new Error('Not enough history for ' + room_slug + ', history count: ' + history.length));
            return;
        }

        let meta = roomMetas[room_slug];
        if (!meta) {
            rj(new Error('Missing room meta for ' + room_slug));
            return;
        }
        // return;

        let encoded = encode(history);

        const finalBuffer = Buffer.from(encoded);

        const base64String = finalBuffer.toString('base64');

        //let b64 = encoded.toString('base64');
        let json = `"${base64String}"`

        zlib.gzip(json, async (err, buffer) => {
            if (!err) {

                try {
                    let filename = `${Date.now()}.json`;
                    let Key = `g/${meta.game_slug}/replays/${meta.version}/${meta.mode}/${filename}`
                    let response = await s3.multiPartUpload('acospub', Key, buffer)

                    delete replays[room_slug];
                    delete roomMetas[room_slug];

                    await room.createRoomReplay(meta.game_slug, meta.version, meta.mode, filename);

                    // console.log(buffer.toString('base64'));
                    console.log("Created Replay at: ", Key);
                    rs(response);
                }
                catch (e) {
                    rj(e);
                }

            }
            else {
                rj(err);
            }
        })
    })
}

run();