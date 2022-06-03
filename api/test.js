const idleManager = new (require('./lib/idle-manager'));

async function main(){
    const bot = await idleManager.spawnIdler({
        gamestoplay: [
            440
        ],
        sendautomessage: false,
        silent: false,
        username: "flyxtradebot",
        password: "jaron2003",
        automessage: "",
        id: "mso6plyn1"
    });
    console.log(`Spawned idler.`)
    let response = await idleManager.startIdler("mso6plyn1")
    // console.log(response);
}

main();