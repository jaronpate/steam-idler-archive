const express = require('express'),
      app = express(),
      dotenv = require('dotenv'),
      mongoose = require('mongoose'),
      passport = require('passport'),
      bodyParser = require('body-parser'),
      methodOverride = require('method-override'),
      flash = require('connect-flash'),
      User = require('./models/User'),
      axios = require('axios'),
      cron = require('node-cron'),
      session = require('express-session'),
      MongoDBStore = require('connect-mongodb-session')(session);

dotenv.config();

const stripe = require('stripe')(process.env.stripeKey);

app.set("view engine", "ejs");
app.use('/assets', express.static(__dirname + '/public'));
app.use((req, res, next) => {
   if (req.originalUrl === '/stripe') {
     next();
   } else {
     bodyParser.json()(req, res, next);
   }
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(flash())

if (process.env.NODE_ENV === 'development') {
   // only use in development
   app.use(errorHandler());
} else {
   app.use((err, req, res, next) => {
     console.error(err);
     res.status(500).send('Server Error');
   });
}

axios.defaults.headers.common['Authorization'] = process.env.apiAuth;

// =========
// MONGOOSE
// =========
var store = new MongoDBStore({
   uri: process.env.db,
   collection: 'sessions'
}, function(err){
   if(err){return console.log(err)}
   console.log('Store connected.')
});

mongoose.connect(process.env.db, { useNewUrlParser: true, useUnifiedTopology: true }).then(db => {
   console.log(`Loaded database.`)

   cron.schedule('*/5 * * * *', () => {
      axios.get(`${process.env.apiHost}/idlers`)
      .then(result => {
         result.data.forEach(account => {
            User.find({'accounts.id' : account.id}, (err, user) => {
               if(account.worker.hours >= user[0].subscription.hourLimit){
                  axios.post(`${process.env.apiHost}/idlers/${account.id}/stop`, null).catch(console.error);
               }
            });
         });
      }).catch(console.error);
   });

   cron.schedule('*/10 * * * *', () => {
      User.find({}, (err, users) => {
         users.forEach(user => {
            let diffInTime = Date.now() - user.subscription.started; 
            let diffInDays = diffInTime / (1000 * 3600 * 24);
            if(diffInDays > 30){
               user.subscription.started = Date.now();
               user.active = true;
               user.accounts.forEach((account, i) => {
                  axios.post(`${process.env.apiHost}/idlers/${account.id}/reset`, null).catch(console.error);
               })
               user.save();
            }
         });
      });
   });

   console.log('Scheduled cron jobs.')
});


// ===========
// PASSPORT
// ===========
app.use(session({ secret: 'klo', resave: true, saveUninitialized: true, store: store }));
app.use(passport.initialize())
app.use(passport.session());

app.use((req, res, next) => { res.locals.message = req.flash(); next(); })

passport.serializeUser(function(user, done) {
   done(null, user);
});
 
passport.deserializeUser(function(user, done) {
   User.findOne({username: user.username}, (err, newUser) => {
      done(err, newUser);
   });
});

var SteamStrategy = require("passport-steam")

passport.use(new SteamStrategy({
   returnURL: `${process.env.protocol}://${process.env.host}/auth/steam/return`,
   realm: `${process.env.protocol}://${process.env.host}`,
   apiKey: process.env.steamApiKey
 },
 function(identifier, profile, done) {
      User.findOne({ openId: identifier }, function (err, user) {
         if(!user){
            stripe.customers.create(
               {
                 metadata: {avatar: profile._json.avatarmedium, username: profile.displayName, steamId: profile.id}
               },
               function(err, customer) {
                  User.create({openId: identifier, customer: customer.id, profile: {avatar: profile._json.avatarmedium, username: profile.displayName, steamId: profile.id}}, (err, user) => {
                     return done(err, user);
                  });
               }
             );
         } else { return done(err, user); }
      });
   }
));

app.get('/', (req, res) => {
   res.render('index', {title: "Steam Idler", user: req.user})
});

app.get('/support', (req, res) => {
   res.redirect('https://steamcommunity.com/id/jaronxp/')
});

app.get('/dashboard', loggedIn, (req, res) => {
   res.redirect('/dashboard/accounts');
});

app.get('/dashboard/accounts', loggedIn, (req, res) => {
   axios.get(`${process.env.apiHost}/idlers`)
   .then(result => {
      req.user.accounts.forEach(account => {
         let apiAccount = result.data.find(x => x.id === account.id)
         req.user.accounts[req.user.accounts.indexOf(account)].online = apiAccount.worker.online
         req.user.accounts[req.user.accounts.indexOf(account)].hours = apiAccount.worker.hours
         req.user.accounts[req.user.accounts.indexOf(account)].totalHours = apiAccount.worker.totalHours
      });
      res.render('dashboard/index', {css: "dashboard/index", title: "Dashboard", user: req.user});
   }).catch(console.error);
});

app.get('/dashboard/accounts/add', loggedIn, (req, res) => {
   if(req.user.accounts.length >= req.user.subscription.accountLimit){
      req.flash('error', 'Account limit reached. Please upgrade in order to add more accounts');
      return res.redirect('/dashboard/accounts')
   }
   res.render('dashboard/new', {css: "dashboard/index", title: "Dashboard", user: req.user});
});

app.post('/dashboard/accounts/add', loggedIn, (req, res) => {
   if(req.user.accounts.length >= req.user.subscription.accountLimit){
      req.flash('error', 'Account limit reached. Please upgrade in order to add more accounts');
      return res.redirect('/dashboard/accounts');
   }
   req.body.gamestoplay = req.body.gamestoplay.map(x => Number(x))
   req.body.gamestoplay = req.body.gamestoplay.slice(0, req.user.subscription.gameLimit)
   axios.post(`${process.env.apiHost}/idlers/new`, req.body)
   .then((result) => {
      User.findByIdAndUpdate(req.user._id, {$push: {accounts: {id: result.data, settings: req.body}}}, {useFindAndModify: true, new: true}, (err, newUser) => {
         if(err){res.redirect('/')}
         res.json(newUser)
      });
   }).catch(console.error);
});

app.get('/dashboard/accounts/:id', loggedIn, (req, res) => {
   let owned = req.user.accounts.map(x => {if(x.id === req.params.id){return x}});
   if(owned){
      return res.render('dashboard/edit', {css: "dashboard/index", title: "Dashboard", account: owned[0], user: req.user});
   }
   res.redirect('/dashboard/accounts');
});

app.post('/dashboard/accounts/:id/edit', loggedIn, (req, res) => {
   req.body.gamestoplay = req.body.gamestoplay.map(x => Number(x))
   req.body.gamestoplay = req.body.gamestoplay.slice(0, req.user.subscription.gameLimit)
   let owned = req.user.accounts.map(x => x.id === req.params.id);
   if(owned){
      axios.post(`${process.env.apiHost}/idlers/${req.params.id}/edit`, req.body)
      .then(result => {
         User.update({'accounts.id': req.params.id}, {'$set': {'accounts.$.settings': req.body}}, (err, user) => {
            res.json(result.data)
         })
      })
   }
});

app.post('/dashboard/accounts/:id/start', loggedIn, (req, res) => {
   let owned = req.user.accounts.map(x => {if(x.id === req.params.id){return x}})[0];
   axios.get(`${process.env.apiHost}/idlers`)
   .then(result => {
      let apiAccount = result.data.find(x => x.id === req.params.id)
      if(owned && apiAccount.worker.hours < req.user.subscription.hourLimit){
         axios.post(`${process.env.apiHost}/idlers/${req.params.id}/start`, req.body)
         .then(result => {
            res.json(result.data)
         })
      } else if (apiAccount.worker.hours >= req.user.subscription.hourLimit){
         res.json({error: 'Hour limit reached, please upgrade to idle more hours per month'})
      } else {res.json({error: 'Error proccessing request.'})}
   }).catch(console.error);
});

app.post('/dashboard/accounts/:id/stop', loggedIn, (req, res) => {
   let owned = req.user.accounts.map(x => x.id === req.params.id);
   if(owned){
      axios.post(`${process.env.apiHost}/idlers/${req.params.id}/stop`, null)
      .then(result => {
         res.json(result.data)
      })
   }
});

app.get('/dashboard/accounts/:id/delete', loggedIn, (req, res) => {
   let owned = req.user.accounts.map(x => x.id === req.params.id);
   if(owned){
      User.findByIdAndUpdate(req.user._id, {$pull: {accounts: {id: req.params.id}}}, {useFindAndModify: false}, (err) => {
         if(err){return res.redirect('/')}
         axios.post(`${process.env.apiHost}/idlers/${req.params.id}/delete`, null)
         .then((result) => { 
            return res.redirect('/dashboard')
         }).catch(console.error);
      });
   } else {res.redirect('/');}
});

// =====
// AUTH
// =====
app.get('/login', (req, res) => {
   if (req.user) { return res.redirect('/'); }
   res.render('dashboard/login',  {css: "login", title: "Login"});
});

app.get('/register', (req, res) => {
   res.render('dashboard/register',  {css: "login", title: "Register"});
});

app.get('/logout', (req, res) => {
   req.logOut();
   res.redirect('/');
});

// ==========
// Steam AUTH
// ==========
app.get('/auth/steam', passport.authenticate('steam'));

app.get('/auth/steam/return',
   passport.authenticate('steam', { failureRedirect: '/login' }),
   oauthError,
   function(req, res) {
      let redirect = req.session.returnTo
      delete req.session.returnTo
      res.redirect(redirect || '/');
});

// ======
// STRIPE
// ======

app.get('/dashboard/upgrade', loggedIn, (req, res) => {
   if(req.user.subscription.type !== 'free'){return res.redirect('/dashboard/billing')}
   res.render('dashboard/upgrade', {css: "dashboard/index", title: "Dashboard", stripeKey: process.env.publicStripeKey, user: req.user});
});

app.post('/dashboard/upgrade', loggedIn, (req, res) => {
   if(!req.body.paymentMethod || !req.body.subType){
      res.json({error: 'Missing subscription type or card.'})
   }
   function paymentError(req, res, err){
      console.log(err.raw.message)
      res.json({error: err.raw.message || 'There was an error processing your payment.'})
   }
   console.log(req.body.paymentMethod)
   console.log(req.user.customer)
   stripe.customers.retrieve(req.user.customer, async (err, customer) => {
      console.log(customer.default_source, customer.sources.length)
      let attachedPaymentMethod = false
      if(!customer.default_source && customer.sources.data.length >= 0){
         console.log("Adding payment method to customer")
         await new Promise((resolve, reject) => {
            stripe.paymentMethods.attach( req.body.paymentMethod, {customer: req.user.customer},
            function(err, paymentMethod) {
               if(err){paymentError(req, res, err); return reject(err);}
               attachedPaymentMethod = true
               resolve(paymentMethod);
            });
         })
      }
      let options = {
         customer: req.user.customer,
         items: [
            {price: req.body.subType},
         ],
      }
      if(attachedPaymentMethod){
         options.default_payment_method = req.body.paymentMethod
      }
      stripe.subscriptions.create(options,
      function(err, subscription) {
         if(err){return paymentError(req, res, err)}
         else if(subscription.status === 'active'){
            stripe.products.retrieve(subscription.plan.product, (err, product) => {
               console.log(product)
               product.metadata.started = Date.now()
               User.findByIdAndUpdate(req.user._id, {subscription: product.metadata}, {useFindAndModify: false, new: true}, (err, newUser) => {
                  res.json({success: `Your account has been upgraded to ${newUser.subscription.type.toUpperCase()}`})
               });
            });
         }
      });
   });
});

app.get('/dashboard/billing', loggedIn, async (req, res) => {
   let session = await stripe.billingPortal.sessions.create({
      customer: req.user.customer,
      return_url: `${process.env.protocol}://${process.env.host}/dashboard`,
   });
   res.redirect(session.url);
});

app.post('/stripe', bodyParser.raw({type: 'application/json'}), (req, res) => {
   const sig = req.headers['stripe-signature'];

   let event;

   try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.endpointSecret);
   }
   catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
   }
   let update = {}
   let customer = event.data.object.customer

   // Handle the event
   switch (event.type) {
     case 'customer.subscription.created':
         stripe.products.retrieve(event.data.object.plan.product, (err, product) => {
            update = product.metadata
            update.started = Date.now();
            res.status(200);
            updateUser(update, customer);
         });
      break;
     case 'customer.subscription.updated':
         if(event.data.object.status !== 'active'){
            update = {
               type: 'free',
               hourLimit: 10,
               gameLimit: 1,
               accountLimit: 1,
               started: Date.now()
            }
            res.status(200)
         } else {
            stripe.products.retrieve(event.data.object.plan.product, (err, product) => {
               update = product.metadata
               update.started = Date.now();
               res.status(200);
            });
         }
         updateUser(update, customer);
      break;
     case 'customer.subscription.deleted':
         update = {
            type: 'free',
            hourLimit: 10,
            gameLimit: 1,
            accountLimit: 1,
            started: Date.now()
         }
         res.status(200);
         updateUser(update, customer);
      break;
     default:
         return res.status(400).end();
   }

   function updateUser(update, customer){
      User.findOneAndUpdate({customer: customer}, {subscription: update}, {useFindAndModify: false, new: true}, (err, newUser) => {})
   }
   res.json({received: true});
});

app.get('*', (req, res) => {
   res.redirect('/')
})

// APP LISTEN
app.listen(process.env.PORT || 8080, function () {
   console.log(`Web server is listening!`);
});

function loggedIn(req, res, next) {
   if (req.user) {
      next();
   } else {
      req.session.returnTo = req.url
      res.redirect('/login');
   }
}

function oauthError (err, req, res, next) { 
   if (err === 'Email already registered') {
      req.flash("warning", err)
      res.redirect('/login')
   }
}