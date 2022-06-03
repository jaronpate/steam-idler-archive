const mongoose = require('mongoose');

const idlerSchema = new mongoose.Schema({
  stats: {
    curHours: {type: Number, default: 0},
    totalHours: {type: Number, default: 0}
  },
  id: {type: String, unique: true},
  settings: {
   username: {type: String, unique: true},
   password: String,
   gamestoplay: Array,
   twofactorsecret: String,
   sendautomessage: {type: Boolean, default: false},
   automessage: String,
   silent: {type: Boolean, default: false}
  },
}, { timestamps: true });

const Idler = mongoose.model('Idler', idlerSchema);

module.exports = Idler;
