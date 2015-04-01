var Firebase=require('firebase');
var config=require('./config.json');
var _ = require('lodash');
var restify = require('restify');

// Setup Firebase
var FB = new Firebase(config.webhook.firebase + '/buckets/' + config.webhook.siteName + '/' + config.webhook.secretKey + '/dev');

// Content types
var contentTypes = [];

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

// Middleware
//server.use(restify.CORS());
server.use(restify.fullResponse());
server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());


// Populate Content Types
FB.child('contentType').once('value', function(s) {
  contentTypes = s.val();
  //contentTypes = _.keys(s.val());
}, function(e) {
  // Catch error
});

// Setup routes
// ------------

// Return all content types as array
server.get('/content-types', function(req, res, next) {
  res.send(200,contentTypes);
  return next();
});

// Get all content type entries as array: /content-type/foo
// Get a content type entry as object by slug /content-type/foo?slug=bar
server.get('/content-type/:type', function(req,res,next) {

  var contentType = req.params.type;
  var slug = req.query.slug || false;

  if(contentTypes.indexOf(contentType) == -1) {
    res.send(404,'Not Found: ' + contentType );
  } else {
    FB.child('data/' + contentType).once('value', function(s) {
      if(slug) {

        var page = _.filter(s.val(), function(n,i) {
          n['_id']=i;
          return n.slug == slug;
        })[0];

        if(typeof page !== 'undefined' && page.name) {
          res.send(200,page);
        } else {
          res.send(404,'Page Not Found: ' + slug)
        }
      } else if (req.query.something_else) {
        // Filter on something_else
      } 
      else {
        var pages = _.filter(s.val(), function(n,i) {
          n['_id'] = i;
          return true;
        });
        res.send(200,pages);
      }
    }, function(e) {
      return(500,'Error accessing "' + contentType + '".');
    });
  }
  return next();
});

// Listen
server.listen(config.server.port, function() {
  console.log('%s listening at %s', server.name, server.url);
});


// Utils
//
function fbAuthHandler(err,authData) {
  console.log('Connecting to: ' + config.webhook.firebase + '/buckets/' + config.webhook.siteName + '/' + config.webhook.secretKey + '/dev');
  if(err) {
    console.log(err);
    exit;
  } else {    
    console.log('Connected. Firebase authentication successful as ' + config.webhook.username);
  }
}