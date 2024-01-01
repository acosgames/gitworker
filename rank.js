var { rating, rate, ordinal } = require('openskill');
const rabbitmq = require('shared/services/rabbitmq');
const room = require('shared/services/room');
const GameService = require('shared/services/game');
const game = new GameService();

const { setPlayerRating } = require('shared/services/room');
const { muRating, clampMu, clampSigma } = require('shared/util/ratingconfig');

class Rank {
    constructor() { }


    async processPlayerHighscores(meta, players, storedPlayerRatings) {

        storedPlayerRatings = storedPlayerRatings || {};

        let roomRatings = await room.findPlayerRatings(meta.room_slug, meta.game_slug);
        if (roomRatings && roomRatings.length > 0) {
            for (var i = 0; i < roomRatings.length; i++) {
                let roomRating = roomRatings[i]
                storedPlayerRatings[roomRating.shortid] = roomRating;
            }
        }

        const game_slug = meta.game_slug;
        const room_slug = meta.room_slug;
        let highScoreList = [];

        let gameinfo = await room.getGameInfo(game_slug);

        for (var id in players) {
            let player = players[id];

            if (!(id in storedPlayerRatings)) {
                storedPlayerRatings[id] = await room.findPlayerRating(id, meta.game_slug);
            }
            if ((typeof player.score === 'undefined')) {
                console.error("Player [" + id + "] (" + player.name + ") is missing score")
                return;
            }

            if (player.score > storedPlayerRatings[id].highscore) {
                highScoreList.push({
                    shortid: id,
                    game_slug: meta.game_slug,
                    highscore: player.score || 0
                });
                player.highscore = player.score;
                console.log("NEW high score for player: ", id, player.score, player.highscore);

                rabbitmq.publishQueue('notifyDiscord', { 'type': 'score', user: player.name, game_title: (gameinfo?.name || game_slug), game_slug, room_slug, score: player.score, highscore: player.score, thumbnail: (gameinfo?.preview_images || '') })
            }
            else {
                player.highscore = storedPlayerRatings[id].highscore;
                highScoreList.push({
                    shortid: id,
                    game_slug: meta.game_slug,
                    highscore: player.highscore || 0
                });
                console.log("OLD high score for player: ", id, player.score, player.highscore);
                rabbitmq.publishQueue('notifyDiscord', { 'type': 'score', user: player.name, game_title: (gameinfo?.name || game_slug), game_slug, room_slug, highscore: player.highscore, score: player.score, thumbnail: (gameinfo?.preview_images || '') })
            }



        }

        if (highScoreList.length > 0)
            room.updateAllPlayerHighscores(highScoreList, meta.maxplayers == 1);



    }

    async processPlayerRatings(meta, players, teams, storedPlayerRatings) {

        const game_slug = meta?.game_slug;
        const room_slug = meta?.room_slug;

        //add saved ratings to players in openskill format
        storedPlayerRatings = storedPlayerRatings || {};
        let playerRatings = {};
        let rankOne = [];
        let rankOther = [];
        let playerList = Object.keys(players);
        let teamList = Object.keys(teams || {});
        if (teamList.length > 0)
            return;


        let roomRatings = await room.findPlayerRatings(playerList, game_slug);
        if (roomRatings && roomRatings.length > 0) {
            for (var i = 0; i < roomRatings.length; i++) {
                let roomRating = roomRatings[i]
                storedPlayerRatings[roomRating.shortid] = roomRating;
            }
        }

        for (var id in players) {
            let player = players[id];

            if (!(id in storedPlayerRatings)) {
                storedPlayerRatings[id] = await room.findPlayerRating(id, game_slug);
            }
            if ((typeof player.rank === 'undefined')) {
                console.error("Player [" + id + "] (" + player.name + ") is missing rank")
                return;
            }

            let playerRating = storedPlayerRatings[id];

            playerRating.rank = player.rank;
            if (teams && player.teamid)
                playerRating.rank = teams[player.teamid].rank;

            if ((typeof player.score !== 'undefined')) {
                playerRating.score = player.score;
            }
            playerRatings[id] = playerRating;

        }

        let lowestRank = 99999;
        for (var id in players) {
            let player = players[id];
            if (player.rank < lowestRank)
                lowestRank = player.rank;
        }
        for (var id in players) {
            let player = players[id];
            if ((typeof player.rank === 'undefined')) {
                console.error("Player [" + id + "] (" + player.name + ") is missing rank")
                return;
            }

            if (player.rank == lowestRank) {
                rankOne.push(storedPlayerRatings[id]);
            }
            else {
                rankOther.push(storedPlayerRatings[id]);
            }
        }

        let isTied = false;
        if (rankOther.length == 0) {
            isTied = true;
            for (var playerRating of rankOne) {
                playerRating.tie++;
            }
        }
        else {
            for (var playerRating of rankOne) {
                playerRating.win++;
            }
            for (var playerRating of rankOther) {
                playerRating.loss++;
            }
        }




        // console.log("Before Rating: ", playerRatings);
        //run OpenSkill rating system
        this.calculateRanks(playerRatings, teams);

        //update player ratings from openskill mutation of playerRatings
        let ratingsList = [];

        let notifyInfo = [];

        for (var id in players) {
            let player = players[id];

            if (!(id in playerRatings)) {
                continue;
            }
            let rating = playerRatings[id];

            rating.played = Number(rating.played) + 1;

            //UPDATE PLAYER data sent back, using private fields to hide the win/loss/tie/played counts from others
            player.rating = rating.rating;
            // player.ratingTxt = game.ratingToRank(rating.rating);
            player._win = rating.win;
            player._loss = rating.loss;
            player._tie = rating.tie;
            player._played = rating.played;



            ratingsList.push({
                shortid: id,
                game_slug: meta.game_slug,
                rating: rating.rating,
                mu: rating.mu,
                sigma: rating.sigma,
                win: rating.win,
                tie: rating.tie,
                loss: rating.loss,
                highscore: rating.score || 0
            });

            delete rating['rank'];
            delete rating['score'];

            setPlayerRating(id, meta.game_slug, rating);
        }


        room.updateAllPlayerRatings(ratingsList);

        // console.log("After Rating: ", storedPlayerRatings);
        return ratingsList;
    }



    async processTeamRatings(meta, players, teams, storedPlayerRatings) {

        const game_slug = meta?.game_slug;
        const room_slug = meta?.room_slug;

        //add saved ratings to players in openskill format
        storedPlayerRatings = storedPlayerRatings || {};
        let playerRatings = {};
        let rankOne = [];
        let rankOther = [];
        let playerList = Object.keys(players);
        let teamList = Object.keys(teams || {});
        if (teamList.length == 0)
            return;

        let roomRatings = await room.findPlayerRatings(playerList, game_slug);
        if (roomRatings && roomRatings.length > 0) {
            for (var i = 0; i < roomRatings.length; i++) {
                let roomRating = roomRatings[i]
                storedPlayerRatings[roomRating.shortid] = roomRating;
            }
        }

        for (var id in players) {
            let player = players[id];

            if (!(id in storedPlayerRatings)) {
                storedPlayerRatings[id] = await room.findPlayerRating(id, game_slug);
            }
            if ((typeof player.rank === 'undefined')) {
                console.error("Player [" + id + "] (" + player.name + ") is missing rank")
                return;
            }

            let playerRating = storedPlayerRatings[id];

            playerRating.rank = player.rank;
            if (teams && player.teamid)
                playerRating.rank = teams[player.teamid].rank;

            if ((typeof player.score !== 'undefined')) {
                playerRating.score = player.score;
            }
            playerRatings[id] = playerRating;

        }

        let lowestRank = 99999;
        for (var id in teams) {
            let team = teams[id];
            if (team.rank < lowestRank)
                lowestRank = team.rank;
        }
        for (var id in teams) {
            let team = teams[id];
            if ((typeof team.rank === 'undefined')) {
                console.error("Team [" + id + "] (" + team.name + ") is missing rank")
                return;
            }

            if (team.rank == lowestRank) {
                rankOne.push(id);
            }
            else {
                rankOther.push(id);
            }
        }

        let isTied = false;
        if (rankOther.length == 0) {
            isTied = true;
            for (var id of rankOne) {

                let team = teams[id];
                for (let i = 0; i < team.players.length; i++) {
                    let shortid = team.players[i];
                    let playerRating = storedPlayerRatings[shortid];
                    playerRating.tie++;
                }
            }
        }
        else {
            for (var id of rankOne) {
                let team = teams[id];
                for (let i = 0; i < team.players.length; i++) {
                    let shortid = team.players[i];
                    let playerRating = storedPlayerRatings[shortid];
                    playerRating.win++;
                }
            }
            for (var id of rankOther) {
                let team = teams[id];
                for (let i = 0; i < team.players.length; i++) {
                    let shortid = team.players[i];
                    let playerRating = storedPlayerRatings[shortid];
                    playerRating.loss++;
                }
            }
        }




        // console.log("Before Rating: ", playerRatings);
        //run OpenSkill rating system
        this.calculateRanks(playerRatings, teams);

        //update player ratings from openskill mutation of playerRatings
        let ratingsList = [];

        let notifyInfo = [];

        for (var id in players) {
            let player = players[id];

            if (!(id in playerRatings)) {
                continue;
            }
            let rating = playerRatings[id];

            rating.played = Number(rating.played) + 1;

            //UPDATE PLAYER data sent back, using private fields to hide the win/loss/tie/played counts from others
            player.rating = rating.rating;
            // player.ratingTxt = game.ratingToRank(rating.rating);
            player._win = rating.win;
            player._loss = rating.loss;
            player._tie = rating.tie;
            player._played = rating.played;



            ratingsList.push({
                shortid: id,
                game_slug: meta.game_slug,
                rating: rating.rating,
                mu: rating.mu,
                sigma: rating.sigma,
                win: rating.win,
                tie: rating.tie,
                loss: rating.loss,
                highscore: rating.score || 0
            });

            delete rating['rank'];
            delete rating['score'];

            setPlayerRating(id, meta.game_slug, rating);
        }


        room.updateAllPlayerRatings(ratingsList);

        // console.log("After Rating: ", storedPlayerRatings);
        return ratingsList;
    }




    calculateRanks(players, teams) {

        if (teams && teams.length > 0) {
            return this.calculateTeams(players, teams);
        }

        return this.calculateFFA(players);
    }

    calculateTeams(players, gameteams) {
        let rank = [];
        let score = [];
        let ratings = [];
        let teams = [];

        if (!players)
            return false;

        try {
            let results = null;

            //rate based on teams
            for (var teamid of gameteams) {
                let team = gameteams[teamid];
                let playerids = team.players;
                let teamplayers = [];
                let teamratings = [];
                for (var playerid of playerids) {
                    let player = players[playerid];
                    let playerRating = rating({ mu: player.mu, sigma: player.sigma });
                    teamratings.push(playerRating);
                    teamplayers.push(playerid);
                }
                ratings.push(teamratings);
                teams.push(teamplayers);
                rank.push(team.rank);
                if (team?.score)
                    score.push(team.score);
            }

            //calculate the results 
            if (score.length != rank.length) {
                results = rate(ratings, { rank });
            } else {
                results = rate(ratings, { rank, score });
            }

            //update player ratings for saving to storage
            for (var i = 0; i < teams.length; i++) {
                let team = teams[i];
                for (var j = 0; j < team.length; j++) {
                    let id = team[j];
                    let player = players[id];
                    let playerRating = results[i][j];
                    player.mu = clampMu(playerRating.mu);
                    player.sigma = clampSigma(playerRating.sigma);
                    player.rating = muRating(playerRating.mu);
                }
            }

            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }

    calculateFFA(players) {
        let rank = [];
        let score = [];
        let ratings = [];
        let teams = [];

        if (!players)
            return false;

        try {
            //create the arrays required by openskill library
            //sync teams and players list to match with the ratings list
            for (var id in players) {
                let player = players[id];
                let playerRating = rating({ mu: player.mu, sigma: player.sigma });
                ratings.push([playerRating]);
                teams.push([id]);
                rank.push(player.rank);
                if (player.score)
                    score.push(player.score);
            }

            //calculate the results 
            let results = null;
            if (score.length != rank.length) {
                results = rate(ratings, { rank });
            } else {
                results = rate(ratings, { rank, score });
            }

            //update player ratings for saving to storage
            for (var i = 0; i < teams.length; i++) {
                let team = teams[i];
                for (var j = 0; j < team.length; j++) {
                    let id = team[j];
                    let player = players[id];
                    let playerRating = results[i][j];
                    player.mu = clampMu(playerRating.mu);
                    player.sigma = clampSigma(playerRating.sigma);
                    player.rating = muRating(playerRating.mu);
                }
            }

            return true;
        }
        catch (e) {
            console.error(e);
            return false;
        }
    }
}


function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
}

function test() {

    let r = new Rank();

    let players = {};

    //create players
    // for (var i = 0; i < 2; i++) {
    //     let id = i;
    //     let mu = i == 0 ? 25 : 10;
    //     let sigma = 3;
    //     players[i] = {
    //         id, mu, sigma
    //     };
    // }



    // players[0] = { id: 0, mu: 25, sigma: 1.33, rank: 1, score: 100 };
    // players[1] = { id: 1, mu: 25, sigma: 1.33, rank: 2, score: 50 };

    for (let i = 0; i < 100; i++) {
        players[i] = { id: i, mu: 25 + (i / 10), sigma: 1.33, rank: i + 1, score: 100 - (i) };
    }
    // players[2] = { id: 2, mu: 25, sigma: 1.33, rank: 3, score: 50 };
    // players[3] = { id: 3, mu: 25, sigma: 1.33, rank: 4, score: 50 };
    for (var i = 0; i < 100; i++) {
        r.calculateFFA(players);
        // players[0].rank = i % 2 == 0 ? 1 : 4;
        // players[3].rank = i % 2 == 0 ? 4 : 1;
    }


    for (var id in players) {
        console.log("Player [" + id + "] - mu:" + players[id].mu + ', sigma:' + players[id].sigma);
    }

    // process.exit();




}

// test();

module.exports = new Rank();