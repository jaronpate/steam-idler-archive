const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const cron = require('node-cron');

module.exports = class idler {
    config = {};
    online = false;
    client;
    stats = {
        curHours: 0,
        totalHours: 0
    };

    constructor(config) {
        this.config = config;
        const client = new SteamUser({
            autoRelogin: false
        });
        // this.client = client;
        this.stats.curHours = config.curHours || 0
        this.stats.totalHours = config.totalHours || 0
        var authCallback;

        let task = cron.schedule('*/10 * * * *', () => {
            this.stats.curHours += .1;
            this.stats.curHours = Math.round(this.stats.curHours * 10) / 10
        }, {
            scheduled: false
        });

        process.on('SIGINT', function () {
            console.log('Logging off and shutting down')
        });

        this.start = async function () {
            console.log('Initalizing bot...');
            return new Promise((resolve, reject) => {
                client.on('steamGuard', (domain, callback, lastCodeWrong) => {
                    if (config.twofactorsecret) {
                        callback(SteamTotp.getAuthCode(config.twofactorsecret));
                    }
                    if (lastCodeWrong) {
                        client.logOff();
                        reject({ error: 'Incorrect auth code.' });
                    }
                    if (domain) {
                        authCallback = callback;
                        resolve({domain, callback});
                    }
                });

                client.on('loggedOn', (details, parental) => {
                    this.online = true;
                    task.start();
                    client.webLogOn();
                    client.getPersonas([client.steamID], function (err, steamid) {
                        if (err) reject({ error: err });
                        console.log('Logged into Steam as ' + steamid[client.steamID].player_name);
                        client.requestFreeLicense(config.gamestoplay);
                        console.log('Idling: ' + config.gamestoplay.length + ' games, getting ' + (config.gamestoplay.length * 24) + ' hours per day | ' + (config.gamestoplay.length * 336) + ' hours per 2 weeks');
                        client.gamesPlayed(config.gamestoplay);
                        if (config.silent === false) {
                            client.setPersona(SteamUser.EPersonaState.Online);
                        };
                        resolve(client);
                    });
                    resolve(client)
                });

                client.on('disconnected', (e) => {
                    this.online = false;
                    console.log('client disconnected: ' + SteamUser.EResult[e]);
                })

                client.on('error', (e) => {
                    this.online = false;
                    task.stop();
                    console.log('client error: ' + e);
                    reject({ error: e })
                })

                client.logOn({
                    accountName: config.username,
                    password: config.password,
                    promptSteamGuardCode: false,
                    rememberPassword: true
                })
            });

        }

        this.authorize = async function (code){
            await authCallback(code);
            return {message: 'Authorized?'}
        }

        this.stop = async function () {
            this.online = false;
            task.stop();
            await client.logOff();
            console.log('Successfully logged off.')
            return this
        }

        this.relog = async function () {
            this.online = false;
            task.stop();
            console.log('Initiated relog.')
            await client.relog();
            return { message: "Successfully relogged." }
        }

        this.shutdown = function (code) {
            setTimeout(() => { process.exit(code) }, 500);
        }
    }
}
