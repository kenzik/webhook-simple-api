var Firebase=require('firebase');
var config=require('./config.json');
var _ = require('lodash');
var restify = require('restify');
var moment = require('moment');
var uslug = require('uslug');
var Q = require('q');
var extend = require('util')._extend;
var util = require('util');

// Setup Firebase
var FB = new Firebase(config.webhook.firebase + '/buckets/' + config.webhook.siteName + '/' + config.webhook.secretKey + '/dev');

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
server.use(restify.fullResponse());
server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());


// Seed content types
var contentTypes = false;
FB.child('contentType').on('value', function(s) {
  contentTypes = s.val();
});

// Seed location types
var locationTypes = false;
FB.child('data/locationtypes').on('value', function(s) {
  locationTypes = s.val();
//  console.log(locationTypes);
});

// Menu stuff
var structuredMenus=[]; // structured with complete children structure
var origMenus={}; // original structure from firebase with ID
var strippedMenus={}; // original structure from firebase without children nodes
FB.child('data/' + config.webhook.menuContentType).on('value', function(s) {
  //
  // Walk menus, store, dupe, strip children 
  // 
  _.forEach(s.val(),function(m,i) {

    // Check for page and add some meta data if it references a page
    addPageMeta(m).then(function(menu) {

      // Id
      menu['_id']=i;

      // Keep a copy
      origMenus[i] = menu;

      // Get a copy
      var s = extend({},menu);

      // delete children
      if(s.children) delete s.children;

      // Add to lookup for later
      strippedMenus[i] = s;


    }, function(err) {
      console.log(err);
      process.exit();
    });
  
  });

});


// Setup routes
// ------------

// Return all content types as array
server.get('/content-types', function(req, res, next) {
  if(!contentTypes) {
    getContentTypes().then(function(data) {
      contentTypes = data;
      res.send(200,contentTypes);
    });
  } else {
    res.send(200,contentTypes);
  }
  return next();
});
 
// Get all content type entries as array: /content-type/foo
// Get a content type entry as object by slug /content-type/foo?slug=bar
// Get a content type entry as object by FB key id /content-type/foo?id=-FJfkfjjf234r334fzznFF-
server.get('/content-type/:type', function(req,res,next) {

  var contentType = req.params.type;
  var slug = req.query.slug || false;
  var id = req.query.id || false;
  var asArray = req.query.array || false; //?array=true
  var expandRelated = req.query.expand || false; //?expand=true

  if(slug || id) {
    getEntry(contentType,slug,id,expandRelated).then(
      function(data) {
        res.send(200,data);
      }, function(err) {
        res.send(404,"Not Found: " + slug);
      }
    );
  } 
  else if(!slug && !id) {
    getEntries(contentType,asArray,expandRelated).then(
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

// Get a structured object representing the menu
// If your menu structure is different than 'menu-structure.json' then you 
// may need modifications to:
//  -- getMenus();
//  -- replaceChildren();
//  -- menu seed code at top of this file
//
server.get('/menu', function(req, res, next) {
  getMenus().then(function(data) {
    res.send(200,data);
  }, function(err) {
    res.send(500,error);
  });
  return next;
});


// Location Support
server.get('/locations', function(req, res, next){
  getLocations().then(function(data) {
    res.send(200,data);
  }, function(err) {
    res.send(500,error);
  });
  return next;
});

// End Routes

// Listen
server.listen(config.server.port, function() {
  console.log('%s listening at %s', server.name, server.url);
});


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

function getEntries(contentType, asArray, expandRelated) {
  var entries = {};

  var deferred = Q.defer();
  
  if(!contentType) {
    deferred.reject("You must provide the content type");
  }

  // This content type in our list?
  // TODO: Might be nice to not rely on indexOf, since 'page' would match 'Home Page', 'Pages', etc.
  if(_.keys(contentTypes).indexOf(contentType) == -1) {
    deferred.reject('Content type not found: ' + contentType);
  }  

  FB.child('data/' + contentType).once('value', function(snap) {
    var s = snap.val();

    if(!contentTypes[contentType].oneOff) { 
      // If it's a list, iterate it 
      _.forEach(s, function(n,i) {
        // We have a special case for a page entry
        if(contentType == 'pages') {
          var processedEntry = processContentEntry(n,i,contentType,expandRelated);
          entries[processedEntry.slug]=processedEntry;
        } else {
          // Send it back as-is
          console.log("Processing!");
          processContentEntry(n,i,contentType,expandRelated).then(
            function(processedEntry) {
              entries[processedEntry.slug]=processedEntry;
              //console.log("Entry", processedEntry);
            }
          );
        }
      });
    } else {
      // One off. Just send it all back.
      deferred.resolve(s);
    }
    console.log("Sending back: ", entries);
    deferred.resolve(asArray ? _.values(entries) : entries) ;
  }, function(e) {
    deferred.reject(e);
  });  

  return deferred.promise;  
}

function getEntry(contentType, slug, id, expandRelated) {

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
    // console.log("Looking up " + contentType + " with ID: " + id);
    FB.child('data/' + contentType + '/' + id).once('value', function(s) {
      entryLocated = true;
      deferred.resolve(processContentEntry(s.val(),id, contentType, expandRelated));
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
        entry = processContentEntry(n,i,contentType, expandRelated);

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

function getMenus() {
  // TODO: Add/process page for Urls

  var deferred = Q.defer();
  if(structuredMenus.length > 0) {
    deferred.resolve(structuredMenus);
  } else {
    _.forEach(origMenus, function(menu, mi) {
      
      if(menu.level === 'First') {
        // console.log("Level 1 Processing: " + menu.name + ' - ' + menu['_id']);
        structuredMenus.push(replaceChildren(menu));
      }
    });
    deferred.resolve(structuredMenus);
  }
  return deferred.promise;
}

function getLocations() {
  var deferred = Q.defer();

  // Grab/watch all locations
  FB.child('data/locations').on('value', function(snap) {
    var s = snap.val();
    var processedLocations = [];
    // Walk locations
    _.forEach(s, function(l, li) {
      l['_id'] = li;
      l.location_type = locationTypes[l.location_type.split(' ')[1]];
      processedLocations.push(l)
    });
    deferred.resolve(processedLocations);
  });

  return deferred.promise;
}

// Potatos
//
function replaceChildren(menu) {
  var s = extend({}, menu);
  delete s.children;
  if(menu.children) {
    s.children=[];
    // console.log("-- Found Children: ", menu.children);
    _.forEach(menu.children, function(child, ci) {
      var childId = child.split(' ')[1];
      // console.log("---- Comparing " + childId + "to parent: " + menu['_id']);
      // Level 2 - That's as far as we can go.
      if(childId !== menu['_id']) {
        // console.log("------ Adding copy to strippedMenus");
        s.children.push(strippedMenus[childId]);
      }
    });
  }  
  return s;
}

function addPageMeta(menu) {
  var deferred = Q.defer();

  var s = extend({}, menu);
  if(menu.page) {
    // console.log("Adding page meta to menu: " + menu.name);
    getEntry('pages', false, menu.page.split(' ')[1]).then(
      function(data) {
        delete s.page;
        s.page = {
          name: data.name,
          title: data.title || null,
          subtitle: data.subtitle || null,
          breadcrumb_title: data.breadcrumb_title || null,
          mobile_title: data.mobile_title || null,
          slug: data.slug || null,
          _id: data['_id']
        }
        deferred.resolve(s);
      }, function(err) {
        deferred.resolve(menu);
      }
    );
  } else {
    deferred.resolve(menu);
  }

  return deferred.promise;
}


// Utensils
//
function fbAuthHandler(err,authData) {
  if(err) {
    console.log(err);
    process.exit();
  } else {    
    console.log('Connected. Firebase authentication successful as ' + config.webhook.username);
  }
}

function processContentEntry(entry,id,contentType,expandRelated) {  
  if(!entry) return false;
  var deferred = Q.defer();

  entry['_id']=id;

  if(!entry.slug) {
    var entrySlug = slugger({
      name: entry.name,
      publish_date: moment(entry.publish_date)
    }, contentType, contentTypes[contentType].customUrls ? contentTypes[contentType].customUrls : null);
    entry['slug']=entrySlug.substring(entrySlug.indexOf('/') + 1);
  }

  if(expandRelated) {
    console.log("Expanding relations in " + contentType + ' - ' + id);
    // console.log(contentTypes[contentType]);
    var relationFields={};

    // Get the relation field for this type
    _.forEach(contentTypes[contentType].controls, function(v,k) {
      if(v.controlType === 'relation') {
         console.log("Checking relation...");
         if(_.indexOf(relationFields,v.name) === -1) {
          console.log("FOUND " + v.name);

          relationFields[v.name]=v.meta.contentTypeId;
         }
      }
    });
    console.log("Fields to walk: ", relationFields);
    _.forEach(relationFields,function(v,k) {
      // Go get the entry
      console.log(v,k);
      // getEntry(v, slug, id, expandRelated)
      getEntry(v,false,entry[k].split(' ')[1],false).then(
        function(result) {
          console.log("Added " + result.name + " to object");
          entry[k]=result;
          //console.log(entry);
          deferred.resolve(entry);
        }
      );
    });
  } else {
    deferred.resolve(entry);
  }

  return deferred.promise;

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


