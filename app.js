var Firebase=require('firebase');
var config=require('./config.json');
var _ = require('lodash');
var restify = require('restify');

// Setup Firebase
var FB = new Firebase(config.webhook.firebase + '/buckets/' + config.webhook.siteName + '/' + config.webhook.secretKey + '/dev');

// Login to Firebase
FB.authWithPassword({
  email: config.webhook.username,
  password: config.webhook.password
},fbAuthHandler);

// Setup server
var server = restify.createServer( {
  name: config.server.name,
  version: config.server.version
});
server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

// Setup routes
// ------------

// Return all content types as array
server.get('/content-types', function(req, res, next) {
  FB.child('contentType').once('value', function(s) {
    res.send(200,_.keys(s.val()));
  });
  return next();
});

// Get all content type entries as array: /content-type/foo
// Get a content type entry as object by slug /content-type/foo?slug=bar
server.get('/content-type/:type', function(req,res,next) {
  FB.child('data/' + req.params.type).once('value', function(s) {
    if(req.query.slug) {
      res.send(200,_.filter(s.val(), function(n) {
        return n.slug == req.query.slug;
      })[0]);      
    } else if (req.query.something_else) {
      // Filter on something_else
    } 
    else {
      res.send(200,_.values(s.val()));
    }
  });
  return next();
});

// Listen
server.listen(config.server.port, function() {
  console.log('%s listening at %s', server.name, server.url);
});


// Utils
//
function fbAuthHandler(err,authData) {
  console.log('Firebase: Connecting to: ' + config.webhook.firebase + '/buckets/' + config.webhook.siteName + '/' + config.webhook.secretKey + '/dev');
  if(err) {
    console.log(err);
    exit;
  } else {    
    console.log('Firebase: Authentication Successful as ' + config.webhook.username);
  }
}