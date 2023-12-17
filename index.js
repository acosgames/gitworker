

require('./gitwebhook');
require('./discord');
require('./replaymanager');

console.log("STARTING GITWORKER!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")

process.on('SIGTERM', signal => {
    cleanup();
    console.error(`Process ${process.pid} received a SIGTERM signal`, signal)
    process.exit(0)
})

process.on('SIGINT', signal => {
    cleanup();
    console.error(`Process ${process.pid} has been interrupted`, signal)
    process.exit(0)
})
process.on('beforeExit', code => {
    cleanup();
    console.error(`Process will exit with code: ${code}`)
    process.exit(code)
});

process.on('uncaughtException', err => {
    cleanup();
    console.error(`Uncaught Exception: ${err.message}`)
    process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
    cleanup();
    console.error('Unhandled rejection at ', promise, `reason: ${reason}`)
    process.exit(1)
})

process.on('message', function (msg) {
    if (msg == 'shutdown' || msg.type == 'shutdown') {
        cleanup();
        console.error('Message Shutdown ', msg)
    }
});


function cleanup() {

}
