const idler = require('./idler');

class idleManager {
   constructor(){
      this.idlers = []

      /**
       * Spawn a new idler
       * @param {object} config Info to pass to the idler
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

      this.startIdler = async function(id, code){
         let i = this.idlers.findIndex(x => x.id === id);
         if(i === -1){return {error: 'No idler found.'}}
         let response = await this.idlers[i].worker.start(code);
         if(response.error){return response}
         return this.idlers[i]
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
         config.hours = 0;
         return await this.spawnIdler(config)
      }

      this.deleteIdler = async function(id){
         let i = this.idlers.findIndex(x => x.id === id);
         if(i === -1){return {error: 'No idler found.'}}
         await this.idlers[i].worker.stop();
         this.idlers.splice(i, 1);
         return {message: `Idler ${id} successfully deleted`}
      }

      function gId(){return Math.random().toString(36).substr(2, 9)}
   }
}

module.exports = idleManager