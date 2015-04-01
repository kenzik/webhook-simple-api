var Firebase=require('firebase');
var config=require('./config.json');
var _ = require('lodash');
var restify = require('restify');
var moment = require('moment');
var uslug = require('uslug');

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

// Setup routes
// ------------

// Return all content types as array
server.get('/content-types', function(req, res, next) {
  FB.child('contentType').once('value', function(s) {
    contentTypes= s.val();
    res.send(200,contentTypes);
  }, function(e) {
    res.send(500,e);
  });
  return next();
});

// Get all content type entries as array: /content-type/foo
// Get a content type entry as object by slug /content-type/foo?slug=bar
server.get('/content-type/:type', function(req,res,next) {

  var contentType = req.params.type;
  var slug = req.query.slug || false;

  // Get current content-types
  FB.child('contentType').once('value', function(s) {
    contentTypes = s.val();
    if(_.keys(contentTypes).indexOf(contentType) == -1) {
      res.send(404,'Not Found: ' + contentType );
    } else {

      var page={};
      var pageValue;

      FB.child('data/' + contentType).once('value', function(s) {
        if(slug) {

          _.forEach(s.val(), function(n, i) {
            page[i]=n;
            pageValue=n;
            // We found a slug that matches the request, send it back
            if(n.slug === slug) {
              res.send(200,page);
              return next;

            } else {

              var pageSlug = slugger({
                name: pageValue.name,
                publish_date: moment(pageValue.publish_date)
              }, contentType, contentTypes[contentType].customUrls ? contentTypes[contentType].customUrls : null);
              console.log(parseCustomUrl(pageSlug,pageValue,contentType));


            }
          });

          process.exit();

          if(typeof page !== 'undefined' && Object.keys(page).length) {
            res.send(200,page);
          } else {
//            console.log(pageValue);
            process.exit();
            // Did not find it by the proper slug, check slugger code
            var pageSlug = slugger({
              name: pageValue.name,
              publish_date: moment(pageValue.publish_date)
            }, contentType, contentTypes[contentType].customUrls ? contentTypes[contentType].customUrls : null);
            console.log(parseCustomUrl(pageSlug,pageValue,contentType));

            res.send(404,'Page Not Found: ' + slug)
          }
        } else if (req.query.something_else) {
          // Filter on something_else
        }
        else {
          res.send(200, s.val());
        }
      }, function(e) {
        return(500,'Error accessing "' + contentType + '".');
      });
    }


  }, function(e) {
    // Catch error
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
  console.log('Connecting to: ' + config.webhook.firebase + '/buckets/' + config.webhook.siteName + '/' + config.webhook.secretKey + '/dev');
  if(err) {
    console.log(err);
    exit;
  } else {    
    console.log('Connected. Firebase authentication successful as ' + config.webhook.username);
  }
}

/*global uslug*/
function slugger(item, type, customUrls) {
  var tmpSlug = '';
  tmpSlug = uslug(item.name).toLowerCase();

  if(customUrls && customUrls.individualUrl) {
    tmpSlug = parseCustomUrl(customUrls.individualUrl, item, type) + '/' + tmpSlug;
  }

  if(customUrls && customUrls.listUrl) {
    tmpSlug = customUrls.listUrl + '/' + tmpSlug;
  } else {
    tmpSlug = type + '/' + tmpSlug;
  }
  return tmpSlug;
}

function parseCustomUrl (url, object, type) {
  //console.log(url);
  var publishDate = object.publish_date ? object.publish_date : object;

  publishDate = moment(publishDate);

  function replacer(match, timeIdent, offset, string){
    if(timeIdent === 'Y') {
      return publishDate.format('YYYY').toLowerCase();
    } else if (timeIdent === 'y') {
      return publishDate.format('YY').toLowerCase();
    } else if (timeIdent === 'm') {
      return publishDate.format('MM').toLowerCase();
    } else if (timeIdent === 'n') {
      return publishDate.format('M').toLowerCase();
    } else if (timeIdent === 'F') {
      return publishDate.format('MMMM').toLowerCase();
    } else if (timeIdent === 'M') {
      return publishDate.format('MMM').toLowerCase();
    } else if (timeIdent === 'd') {
      return publishDate.format('DD').toLowerCase();
    } else if (timeIdent === 'j') {
      return publishDate.format('D').toLowerCase();
    } else if (timeIdent === 'T') {
      return type.toLowerCase();
    } else {
      return match;
    }
  }

  url = url.replace(/#(\w)/g, replacer);
  console.log(url);
  return url;
}