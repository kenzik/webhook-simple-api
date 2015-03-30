# Simple Webhook Content API

We wanted to read our Webhook content directly from Firebase, rather than relying on [subtemplates and swig filters](http://www.webhook.com/docs/common-patterns/#quicky_json_jsonp_api).

This is a simple node.js application that uses [restify](http://restifyjs.com/) to assist with the requests.


### Installation

1. ```npm install```
2. Create a ```config.json``` file. A sample one is provided.
3. ```npm start```


### Usage

It supports the following routes:

1. ```/content-types``` - To retrieve an array of content types
2. ```/content-type/:type``` - To retrieve all records for a particular content type
3. ```/content-type/:type?slug=:slug``` - To retrieve a single content record via slug

NOTE: There seems to be a [slug bug](http://forums.webhook.com/t/possible-bug-no-slug-on-initial-save/604) in Webhook, so YMMV with #3.

