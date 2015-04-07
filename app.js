var Firebase=require('firebase');
var config=require('./config.json');
var _ = require('lodash');
var restify = require('restify');
var moment = require('moment');
var uslug = require('uslug');
var Q = require('q');

// Setup Firebase
var FB = new Firebase(config.webhook.firebase + '/buckets/' + config.webhook.siteName + '/' + config.webhook.secretKey + '/dev');

// Content types
var contentTypes = false;

// Login to Firebase
console.log('Connecting to: ' + config.webhook.firebase + '/buckets/' + config.webhook.siteName + '/' + config.webhook.secretKey + '/dev');
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


// Seed content types
getContentTypes().then(
  function(data) {
    contentTypes = data;
  }
);

// Setup routes
// ------------

// Return all content types as array
server.get('/content-types', function(req, res, next) {
  console.log("In /content-types");
  getContentTypes().then(
    function(data) {
      contentTypes = data;
      res.send(200,contentTypes);
    }, function(err) {
      res.send(500,error);
    }
  );
  return next();
});
 
server.get('/menu', function(req, res, next) {

  getMenus().then(function(data) {
    res.send(200,data);
  }, function(err) {
    res.send(500,error);
  });

});

// Get all content type entries as array: /content-type/foo
// Get a content type entry as object by slug /content-type/foo?slug=bar
// Get a content type entry as object by FB key id /content-type/foo?id=-FJfkfjjf234r334fzznFF-
server.get('/content-type/:type', function(req,res,next) {

  var contentType = req.params.type;
  var slug = req.query.slug || false;
  var id = req.query.id || false;

  if(slug || id) {
    getEntry(contentType,slug,id).then(
      function(data) {
        res.send(200,data);
      }, function(err) {
        res.send(404,"Not Found: " + slug);
      }
    );
  } 
  else if(!slug && !id) {
    getEntries(contentType).then(
      function(data) {
        res.send(200,data);
      }, function(err) {
        res.send(404,"Not Found: " + contentType);
      }
    );
  }
  else {
    res.send(500,"Server Error");
  }

  return next;
});


// Listen
server.listen(config.server.port, function() {
  console.log('%s listening at %s', server.name, server.url);
});


// Utils
//
function fbAuthHandler(err,authData) {
  if(err) {
    console.log(err);
    process.exit();
  } else {    
    console.log('Connected. Firebase authentication successful as ' + config.webhook.username);
  }
}

function processContentEntry(entry,id,contentType) {  
  // console.log(page);
  if(!entry) return false;
  entry['_id']=id;

  if(!entry.slug) {
    var entrySlug = slugger({
      name: entry.name,
      publish_date: moment(entry.publish_date)
    }, contentType, contentTypes[contentType].customUrls ? contentTypes[contentType].customUrls : null);
    entry['slug']=entrySlug.substring(entrySlug.indexOf('/') + 1);
  }

  return entry;
}

function processMenu(menu,id) {
  menu['_id']=id;

  // TODO: Populate children
  if(menu.children) {
    var children = [];
    _.forEach(menu.children, function(m,i) {
      children.push(processMenu(m.split(' ')[1]));
    });
    menu.children=children;
  }

  // TODO: Find page for creating URL

  return menu;

}

function processMenuChildren(children) {
  var children = [];
}

// Functionality from webhook-cms
// https://github.com/webhook/webhook-cms/issues/225
//
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

// Functionality from webhook-cms
// https://github.com/webhook/webhook-cms/issues/225
//
function parseCustomUrl (url, object, type) {
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
  return url;
}

// Meat
//
function getContentTypes() {

  var deferred = Q.defer();
  if(contentTypes.length > 0) deferred.resolve(contentTypes); 
  FB.child('contentType').on('value', function(s) {
    contentTypes = s.val();
    deferred.resolve(contentTypes);
  }, function(e) {
    deferred.reject(e);
  });

  return deferred.promise;
}

function getEntries(contentType) {
  var entries = [];

  var deferred = Q.defer();
  
  if(!contentType) {
    deferred.reject("You must provide the content type");
  }

  // This content type in our list?
  // TODO: Might be nice to not rely on indexOf, since 'page' would match 'Home Page', 'Pages', etc.
  if(_.keys(contentTypes).indexOf(contentType) == -1) {
    deferred.reject('Content type not found: ' + contentType);
  }  

  FB.child('data/' + contentType).once('value', function(s) {
    _.forEach(s.val(), function(n,i) {
      processing(i);
      entries.push(processContentEntry(n,i,contentType));
    });
    deferred.resolve(entries);
  }, function(e) {
    deferred.reject(e);
  });  

  return deferred.promise;  
}

function getMenus() {

  var deferred = Q.defer();
  var menus=[];

  FB.child('data/menus').on('value', function(s) {
    _.forEach(s.val(), function(n,i) {
      menus.push(processMenu(n,i));
    });
    deferred.resolve(menus);
  }, function(e) {
    deferred.reject(e);
  });

  return deferred.promise;
}

function getMenu(id) {

  var deferred = Q.defer();

  // Need some parameters
  if(!id) {
    deferred.reject("Invalid parameters. You must provide a slug or id");
  }

  FB.child('data/menus/' + id).once('value', function(s) {
    deferred.resolve(processMenu(s.val()));
  }, function(e) {
    deferred.reject(e);
  });

  return deferred.promise;

}


function getEntry(contentType, slug, id) {

  var deferred = Q.defer();

  // Need some parameters
  if(!contentType) {
    deferred.reject("You must provide the content type");
  }
  // Need some parameters
  if(!slug && !id) {
    deferred.reject("Invalid parameters. You must provide a slug or id");
  }
  // This content type in our list?
  // TODO: Might be nice to not rely on indexOf, since 'page' would match 'Home Page', 'Pages', etc.
  if(_.keys(contentTypes).indexOf(contentType) == -1) {
    deferred.reject('Content type not found: ' + contentType);
  }

  // We have not found the entry 
  var entryLocated = false;

  // id takes priority
  if(id) {
    FB.child('data/' + contentType + '/' + id).once('value', function(s) {
      entryLocated = true;
      deferred.resolve(processContentEntry(s.val()));
    }, function(e) {
      deferred.reject(e);
    });
  }
  // then slug
  else if(slug) {
    var entry={};
    FB.child('data/' + contentType).once('value', function(s) {
      _.forEach(s.val(), function(n, i) {
        
        // Clean things up a bit
        entry = processContentEntry(n,i,contentType);

        // We found a slug that matches the request, send it back
        if(entry.slug === slug) {
          entryLocated = true;
          deferred.resolve(entry);
        } 
      });

      // The forEach loop was not fruitful
      if(!entryLocated) {
        deferred.reject('Not Found: ' + slug);
      }

    }, function(e) {
      deferred.reject(e);
    });
  } else {
      if(!entryLocated) {
        deferred.reject('Not Found: ' + id ? id : slug);    
      }
  }

  return deferred.promise;

}


