const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  openId: {type: String, unique: true},

  accounts: {type: Array, default: []},

  customer: String,

  subscription: {
    type: {type: Object, default: 'free'},
    gameLimit: {type: Number, default: 1},
    accountLimit: {type: Number, default: 1},
    hourLimit: {type: Number, default: 10},
    started: {type: Date, default: Date.now()},
    active: {type: Boolean, default: true}
  },

  profile: {
    username: String,
    avatar: String,
    steamId: String
  },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
