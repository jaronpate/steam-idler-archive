const idler = require('./idler')
const rl = require('readline').createInterface({
   input: process.stdin,
   output: process.stdout
 });

class idleManager {
   constructor(){
      this.idlers = []

      /**
       * Spawn a new idler
       * @param config Info to pass to the idler
       */
      this.spawnIdler = function(config){
         let id = config.id || gId();
         let idle = new idler(config);
         this.idlers.push({id: id, worker: idle});
         return id;
      }

      this.editIdler = async function(id, config){
         await this.deleteIdler(id);
         config.id = id;
         return await this.spawnIdler(config);
      }

      this.startIdler = async function(id){
         let i = this.idlers.findIndex(x => x.id === id);
         if(i === -1){return {error: 'No idler found.'}}
         const response = await this.idlers[i].worker.start();
         if(response.error){return {error: response.error}}
         if(response.domain){
            return response;
         }
         return this.idlers[i];
      }

      this.authorizeIdler = async function(id, code){
         let i = this.idlers.findIndex(x => x.id === id);
         if(i === -1){return {error: 'No idler found.'}}
         const response = await this.idlers[i].worker.authorize(code);
         if(response.error){return {error: response.error}}
         return response;
      }

      this.stopIdler = async function(id){
         let i = this.idlers.findIndex(x => x.id === id);
         if(i === -1){return {error: 'No idler found.'}}
         return await this.idlers[i].worker.stop();
      }

      this.restartIdler = async function(id){
         let i = this.idlers.findIndex(x => x.id === id);
         if(i === -1){return {error: 'No idler found.'}}
         return await this.idlers[i].worker.relog();
      }

      this.respawnIdler = async function(id){
         let config = this.idlers.find(x => x.id === id).worker.config;
         if(!config){return {error: 'No idler found.'}}
         await this.deleteIdler(id);
         config.curHours = 0;
         return await this.spawnIdler(config)
      }

      this.deleteIdler = async function(id){
         let i = this.idlers.findIndex(x => x.id === id);
         if(i === -1){return {error: 'No idler found.'}}
         await this.idlers[i].worker.stop();
         this.idlers.splice(i, 1);
         return {message: `Idler ${id} successfully deleted`}
      }

      function gId(){return Math.random().toString(36).substring(2, 9)}
   }
}

module.exports = idleManager