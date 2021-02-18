const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const dotenv = require("dotenv")
const Idler = require('./models/Idler')
const cron = require('node-cron');

dotenv.config();

const idleManager = new (require('./lib/idle-manager'));

// ===========
// MONGOOSE
// ===========
const mongoose = require('mongoose');
mongoose.connect(process.env.db, { useNewUrlParser: true, useUnifiedTopology: true }).then(db => {
  console.log(`Loaded database.`)
  setTimeout(() => {
    Idler.find({}, (err, idlers) => {
      idlers.forEach(async idler => {
        if(idler.id){idler.settings.id = idler.id}
        idler.settings.hours = idler.stats.hours
        idler.settings.totalHours = idler.stats.totalHours
        await idleManager.spawnIdler(idler.settings);
        console.log(`Spawned ${idler.settings.id || idler.id} idler.`)
      })
    });
  }, 1000);
  cron.schedule('*/5 * * * *', () => {
    idleManager.idlers.forEach(idler => {
      Idler.findOneAndUpdate({id: idler.id}, {'stats.hours': idler.worker.hours}, {useFindAndModify: false, new: true}, (err, newIdler) => {
        if(err){console.log(err)}
      });
    });
  });
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if(req.headers.authorization !== process.env.auth){return res.status(401).json({error: "Unauthorized"})}
  next();
})

app.get('/idlers', (req, res) => {
  res.json(idleManager.idlers);
});

app.post('/idlers/new', async (req, res) => {
  let response = await idleManager.spawnIdler(req.body)
  Idler.create({settings: req.body, id: req.body.id || response}, (err, idler) => {
    if(err && err.code === 11000){return res.json({error: 'Idler with that id/username already exists.'})}
    if(err){return res.json({error: 'Error creating new idler.'})}
    res.json(response);
  });
});

app.post('/idlers/:id/start', async (req, res) => {
  let response = await idleManager.startIdler(req.params.id, req.body.code)
  res.json(response);
});

app.post('/idlers/:id/edit', async (req, res) => {
  let response = await idleManager.editIdler(req.params.id, req.body)
  req.body.id = req.params.id;
  Idler.findOneAndUpdate({id: req.params.id}, {settings: req.body}, (err) => {
    res.json(response);
  });
});

app.post('/idlers/:id/stop', (req, res) => {
  let idler = idleManager.idlers.find(x => {if(x.id === req.params.id){return x}})
  Idler.findOneAndUpdate({id: req.params.id}, {'stats.hours': idler.worker.hours}, {useFindAndModify: false}, async (err, idler) => {
    if(err){return res.json({error: err})}
    let response = await idleManager.stopIdler(req.params.id)
    res.json(response);
  })
});

app.post('/idlers/:id/restart', async (req, res) => {
  res.json(await idleManager.restartIdler(req.params.id));
});

app.post('/idlers/:id/reset', async (req, res) => {
  let idler = idleManager.idlers.find(x => {if(x.id === req.params.id){return x}})
  Idler.findOneAndUpdate({id: req.params.id}, {stats: {hours: 0, totalHours: idler.worker.hours}}, {useFindAndModify: false, new: true}, async (err, newIdler) => {
    let response = await idleManager.respawnIdler(req.params.id)
    console.log(err)
    console.log(newIdler)
    res.json(newIdler);
  })
});

app.post('/idlers/:id/delete', async (req, res) => {
  await Idler.findOneAndDelete({id: req.params.id}, (err) => {
    if(err){return res.json(err)}
  })
  res.json(await idleManager.deleteIdler(req.params.id));
});

app.listen(process.env.PORT || 3000, () => {
  console.log("API listening");
});

let idleConfig = {
  username: 'flyxtradebot',
  password: 'jaron2003',
  // twofactorsecret: 'X0nlomtGCJT5leETieST+zKeKTE=',
  gamestoplay: [730],
  sendautomessage: true,
  automessage: 'I\'m idling m8',
  silent: false
}
