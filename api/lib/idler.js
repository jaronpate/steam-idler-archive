class idler {
  constructor(config){
    const Steam = require('steam');
    const SteamUser = require('steam-user');
    const SteamTotp = require('steam-totp');
    const cron = require('node-cron');

    let playme = config.gamestoplay;
    let responded = [];

    this.config = config;

    this.online = false;

    let client = new SteamUser({
      autoRelogin: true
    });

    this.hours = config.hours || 0
    this.totalHours = config.totalHours || 0

    let task = cron.schedule('*/10 * * * *', () =>  {
      this.hours += .1;
      this.hours = Math.round(this.hours * 10) / 10
    }, {
      scheduled: false
    });
    
    client.on('friendMessage', function (steamid, message) {
      if (config.sendautomessage === true && responded.indexOf(steamid.getSteamID64()) === -1) {
        if (message == 'Invited you to play a game!') return;
        client.getPersonas([steamid], function (err, steamids) {
          if (err) console.log('Error: ' + err)
          console.log('Message from ' + steamids[steamid].player_name + ' ID:[' + steamid.getSteamID64() + ']: ' + message)
          client.chatMessage(steamid, config.automessage)
          responded.push(steamid.getSteamID64())
        })
      };
    });
    
    client.on('lobbyInvite', function (inviterID, lobbyID) {
      if (config.sendautomessage === true && responded.indexOf(inviterID.getSteamID64()) === -1) {
        responded.push(inviterID.getSteamID64())
        client.chatMessage(inviterID, config.automessage)
      };
    });
    
    process.on('SIGINT', function () {
      console.log('Logging off and shutting down')
      setTimeout(() => {process.exit(0)}, 500)
    });
    
    this.start = function(code){
      client = new SteamUser({
        autoRelogin: true
      });
      console.log('Initalizing bot...');
      return new Promise((resolve, reject) => {
        client.logOn({
          accountName: config.username,
          password: config.password,
          promptSteamGuardCode: false,
          rememberPassword: true
        })
        client.on('steamGuard', (domain, c, lastCodeWrong) => {
          if(lastCodeWrong){
            client.logOff();
            resolve({error: 'Incorrect auth code.'});
          }
          if(domain) {c(code);}
          else if(code) {
            c(code)}
          else {c(SteamTotp.getAuthCode(config.twofactorsecret));}
        });
        
        client.on('loggedOn', (details, parental) => {
          this.online = true;
          task.start();
          
          client.webLogOn();
          client.getPersonas([client.steamID], function (err, steamid) {
            if (err) reject({error: err});
            console.log('Logged into Steam as ' + steamid[client.steamID].player_name);
            client.requestFreeLicense(playme);
            console.log('Idling: ' + playme.length + ' games, getting ' + (playme.length * 24) + ' hours per day | ' + (playme.length * 336) + ' hours per 2 weeks');
            client.gamesPlayed(playme);
            if (config.silent === false) {
              client.setPersona(Steam.EPersonaState.Online);
            };
            resolve(client);
          });
        });
        client.on('error', (e) => {
          this.online = false;
          task.stop();
          console.log('Client error: ' + e);
          client.logOff();
          resolve({error: e})
        })

      });

    }

    this.stop = async function(){
      this.online = false;
      task.stop();
      await client.logOff();
      console.log('Successfully logged off.')
      return this
    }

    this.relog = async function(){
      this.online = false;
      task.stop();
      await client.relog();
      return {message: "Initiated relog."}
    }

    this.shutdown= function(code){
      setTimeout(()=>{process.exit(code)}, 500);
    }
  }
}

module.exports = idler;
