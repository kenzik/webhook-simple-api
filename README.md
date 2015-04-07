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

When requesting content via a slug (#3), it will check for an explicit slug first (set during content creation). If it does not have a set slug, it will compare the slug parameter to a default slug (see note below.)

### Issues

* I only perform an indexOf against the system slug with the slug parameter. This may cause issues if you have similar slugs across the system, eg: /pages/foo & /categories/foo
* A good chunk of code is borrowed from webhook-cms for creating and parsing the slug. That code is only used if the entry does not have an explicit slug set during entry creation in Webhook. I build a default URL based on the content type (customUrls) and content type entry (name) and compare the generated slug to the slug paramater. It would be much cleaner if Webhook refactored this aspect of the platform, and always stored the canonical slug (currently they don't store that key if it's not explicitly set.) Here is an issue I raised about it: https://github.com/webhook/webhook-cms/issues/225



