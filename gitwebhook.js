var http = require('http')
var createHandler = require('github-webhook-handler')
var handler = createHandler({ path: '/webhook', secret: 'XyNmjfdmVpNw7RRt' })
const SmeeClient = require('smee-client')

const PersonService = require('fsg-shared/services/person');
const person = new PersonService();
const DevGameService = require('fsg-shared/services/devgame');
const devgame = new DevGameService();
const credutil = require('fsg-shared/util/credentials');
const credentials = credutil();

const gh = require('fsg-shared/services/github');
var port = process.env.PORT || credentials.platform.gitworker.port;
const FSG = process.env.FSG;



if (FSG != 'prod' && FSG != 'production') {

    const smee = new SmeeClient({
        source: 'https://smee.io/8QuTFTiTnF8fmjYw',
        target: 'http://localhost:9000/webhook',
        logger: console
    })

    const events = smee.start()

    // // Stop forwarding events
    // events.close()
}
//https://github.com/orgs/acosgames/invitation

http.createServer(function (req, res) {
    handler(req, res, function (err) {
        res.statusCode = 404
        //res.end('no such location')
    })
}).listen(port)

handler.on('error', function (err) {
    console.error('Error:', err.message)
})

handler.on('push', function (event) {
    console.log('Received a push event for %s to %s',
        event.payload.repository.name,
        event.payload.ref)
})

handler.on('issues', function (event) {
    console.log('Received an issue event for %s action=%s: #%d %s',
        event.payload.repository.name,
        event.payload.action,
        event.payload.issue.number,
        event.payload.issue.title)
})

handler.on('repository_import', async function (event) {
    console.log('Received an repository_import event', event.payload);

    switch (event.payload.status) {
        case 'success': {
            try {

                let repoName = event.payload.repository.name;
                let parts = repoName.split('-');
                let type = parts.pop();
                repoName = parts.join('-');

                let game = { game_slug: repoName };
                let existing = await devgame.findGame(game);
                // let existing = await person.findUser(user);
                if (existing) {

                    let update = {};
                    if (type == 'server') {
                        update.git_server = game.shortid + '-server';
                    } else if (type == 'client') {
                        update.git_client = game.shortid + '-client';
                    }

                    let result = await devgame.updateGame(update, { id: existing.ownerid });
                    console.log(result);
                }
            }
            catch (e) {
                console.error(e);
            }
            break;
        }
        case 'cancelled': {
            console.error("Import cancelled");
            break;
        }
        case 'failure': {
            console.error("Import failure");
            break;
        }
    }
});

handler.on('repository', async function (event) {
    console.log('Received an repository event', event.payload);

    switch (event.payload.action) {
        case 'created': {
            try {
                // let user = { github_id: event.payload.membership.user.id };

                // let existing = await person.findUser(user);
                // if (existing) {

                //     user = { id: existing.id, isdev: 1 };
                //     let updateResult = await person.updateUser(user);
                //     console.log(updateResult);
                //     let teamResult = await person.createGithubUserTeam(existing);
                //     console.log(teamResult);
                // }
            }
            catch (e) {
                console.error(e);
            }
            break;
        }
        case 'renamed': {

            break;
        }
        case 'deleted': {

            break;
        }
    }
});

handler.on('organization', async function (event) {
    console.log('Received an organization event', event.payload);


    switch (event.payload.action) {
        case 'member_added': {
            try {
                let user = { github_id: event.payload.membership.user.id };
                let existing = await person.findUser(user);
                if (existing) {

                    // let teamResult = await person.createGithubUserTeam(existing);

                    // if (!teamResult || !teamResult.data) {
                    //     console.error(existing);
                    //     throw new Error("Invalid team result");
                    // }
                    // console.log(teamResult.data);

                    user = { id: existing.id, isdev: 1 };
                    let updateResult = await person.updateUser(user);
                    console.log(updateResult);

                }
            }
            catch (e) {
                console.error(e);
            }
            break;
        }
        case 'member_removed': {
            try {
                let user = { github_id: event.payload.membership.user.id };
                let existing = await person.findUser(user);
                if (existing) {

                    user = { id: existing.id, isdev: 0 };
                    let result = await person.updateUser(user);
                }
            }
            catch (e) {
                console.error(e);
            }
            break;
        }
    }
})

handler.on('team', function (event) {
    console.log('Received an team event', event.payload);
})

handler.on('team_add', function (event) {
    console.log('Received an team_add event', event.payload);
})


handler.on('push', function (event) {
    console.log('Received an push event', event.payload);
})


handler.on('member', function (event) {
    console.log('Received an member event', event.payload);
})

handler.on('membership', function (event) {
    console.log('Received an membership event', event.payload);
})