# Forcetek
Minimal Javascript wrapper for the [Force.com REST API](https://developer.salesforce.com/page/REST_API)

## Contents

- Overview
- Usage
- Examples
- Error Handling
- Notes
- Changelog

## Overview

This Javascript module allows you to authenticate with [Salesforce](https://www.salesforce.com) and send requests to the REST API. We started building this due to the fact we use @developerforce's own [Force.com Toolkit](https://github.com/developerforce/Force.com-JavaScript-REST-Toolkit) for a lot of our projects, but didn't want the jQuery dependency. We then added a built-in authentication function, and an API usage function, as these were things always built in for in our ForceTK apps. It has been designed to be used in Visualforce, Web, [Cordova](https://cordova.apache.org/), and [Electron](https://electron.atom.io/) environments.

To get started you will first need to create a [Connected App](https://help.salesforce.com/articleView?id=connected_app_overview.htm&type=0) in Salesforce.

Go to `Setup > Create > Apps`, go down to Connected Apps and click 'New'. You'll need to give it at least a name and an email address, but setting the logo / icon / image and description will help the user know what they are giving access to.

Under `API (Enable OAuth Settings)` tick the checkbox and you'll be able to see all the OAuth options. Here you enter a Callback Url, which your user will be redirected back to after logging in successfully. You can then set the OAuth scopes you need, which you'll want to add at least full, api, refresh\_token, visualforce, and web. Press 'Save' once your done and Salesforce will create your Connected App, and take you to the detail page. were you will be able to get your Consumer Key for your app. 

If you go to your app in `Setup > Manage Apps > Connected Apps` you'll be able to click 'Edit Policies' and set the lifespan of your refresh token. If you set to never expire, you can have your apps only ever ask for the user to authenticate to Salesforce once!

## Usage

To get started in Javascript, all you need to do is create a new Forcetek instance with `var Force = new Forcetek()`

However if using Forcetek outside of a Visualforce page, you will need to pass a configuration object to the instance with the following keys:

**apiVersion** - The version of the Force.com REST API you want to use.  
*Optional. defaults to 'v35.0'*

**callbackUrl:** - The Callback Url for redirecting the user after login. 
*Required for non-VF. This has to be the same as the one you put in the Connected App settings. Please note that unless the redirect url is a non-HTTP/HTTPS scheme or 'https://login.salesforce.com/services/oauth2/success', you will not be able to get a refresh\_token when you authenticate. This is only an issue for Web environments.*

**consumerKey** - The Consumer Key of the Connected App you created.  
*Required for non-VF. See the Overview section on making a Connected App*

**loginUrl:** - The url of the Salesforce login page to use.  
*Optional, defaults to 'https://login.salesforce.com/'*

**proxyUrl:** - The url of your proxy server.  
*Required for Web environments. A proxy is needed to get around CORS errors from sending requests from a non-Salesforce domain. The proxy should be running on the same domain as your Web app. An minimal proxy example is included in this repository for you to test with.*

```javascript
var Force = new Forcetek({
  callbackUrl: 'PATH_TO_MY_APP/success.html',
  consumerKey: 'MY_CONNECTED_APP_ID',
  loginUrl: 'https://test.salesforce.com/'
  proxyUrl: 'PATH_TO_MY_APP/proxy.php',
});
```

You can see some examples of using Forcetek in Visualforce, Web, Cordova, and Electron environments in the Examples section.

Now you have initialised Forcetek, you can use the following functions:

#### Forcetek.login(callback)

Opens a window for the user to login to, based on the loginUrl you set. Once successfully logged in, it passes back a client object used internally to make requests with. This object can be stored to be refreshed later with `Forcetek.refresh()`

```javascript
Force.login(function(client) {
  console.log('store me for later!', client);
  // you can now start running any of the request functions
});
```

#### Forcetek.session(sessionId)

If you're using Forcetek in a Visualforce page, you don't need to call `Forcetek.login()`, as you already have a session id directly available in the page thanks to `'{!$Api.Session_ID}'`. No client object is returned as it is not required.

```javascript
Force.session('{!$Api.Session_ID}');
// you can now start running any of the request functions
```

#### Forcetek.refresh(client, callback)

If you did use `Forcetek.login()` to authenticate your user, and you stored the client, you can refresh the client by calling this function, meaning you won't have to recall Forcetek.login() for as long as their refresh\_token is valid! As mentioned before, unless the callbackUrl you used for your Connected App is a non-HTTP/HTTPS scheme or 'https://login.salesforce.com/services/oauth2/success', you will not be able to get a refresh\_token when you authenticate, and so will not be able to use this function, and instead you will need to re-login the user.

It's worth noting that when any of the request functions are called, if the session has expired Forcetek will automatically try and refresh it if there's a refresh\_token available.

```javascript
Force.refresh(storedClient, function(err, refreshedClient) {
  if (err) return console.log(err);
  // you can now start running any of the request functions
});
```

#### Forcetek.query(soql, callback)

Request function that runs a SOQL query.

```javascript
Force.query('SELECT Name FROM Account LIMIT 10', function(err, res) {
  if (err) return console.log(err);
  // var accounts = res.records
});
```

#### Forcetek.create(sobject, record, callback)

Request function to create a record in Salesforce.

```javascript
var record = {
  Name: 'newAccount'
};
Force.create('Account', record, function(err, res) {
  if (err) return console.log(err);
  // var newId = res.Id
});
```

#### Forcetek.update(sobject, id, updates, callback)

Request function to update a specific record in Salesforce

```javascript
var updates = {
  Name: 'updatedName'
};
Force.update('Account', '0015800000tPiBa', updates, function(err) {
  if (err) return console.log(err);
  // record is update, now do stuff
});
```

#### Forcetek.del(sobject, id, callback)

Request function to delete a specific record in Salesforce

```javascript
Force.del('Account', '0015800000tPiBa', function(err) {
  if (err) return console.log(err);
  // record is deleted, now do stuff
});
```

#### Forcetek.raw(url, method, payload, callback)

Request function that exposes the internal function that sends requests directly to the REST API. The url is any REST API url, from '/services/data/'. Valid methods are GET, POST, PUT, PATCH, DELETE, HEAD. The payload is any data you want to send, and must be in JSON format, if you're not sending anything, must be null.

```javascript
var url = 'v35.0/sobjects/Account/describe';
Force.raw(url, 'GET', null, function(err, res) {
  if (err) return console.log(err);
  // res.fields => my org's account fields
});
```

#### Forcetek.usage()

Once you've used at least one request function you'll be able to get the current Daily REST API usage and Daily REST API limits for the organisation you're connected to by calling this function.

```javascript
var usage = Force.usage();
// usage.used => current daily usage
// usage.limit => organisation daily limit
```

## Examples

The following examples have been tested and working at the time of v1.0.0, if you have any issues with them or are not completely 100% on how to use them, please create an issue on this repository and we'll have a look!

#### Visualforce Environments

If you're using Forcetek in a Visualforce environment, all you need to do is upload Forcetek.js to your static resources and build your page.

```html
<apex:page title="Forcetek | VF Example">

  <script type="text/javascript" src="{!$Resource.Forcetek}"></script>
  <script type="text/javascript">
    // create a new instance of Forcetek and set the session token
    var Force = new Forcetek();
    Force.session('{!$Api.Session_ID}');
    // you can now run any of the request functions, like Force.query()
    Force.query('SELECT Name FROM Account LIMIT 10', function(err, result) {
      if (err) return console.error(err);
      // do something with the data, i.e. show the records in the page
      var mount = document.getElementById('accounts');
      for (var a = 0; a < result.records.length; a++) {
        mount.innerHTML += '<li>' + result.records[a].Name + '</li>';
      }
      // you can now get the current daily REST API limits for this org
      console.log(Force.usage());
    })
  </script>
  
  <!-- mount for the account records -->
  <ul id="accounts"></ul>

</apex:page>
```

#### Web Environments and Electron Environments

If you're using Forcetek in a Web or Electron environments, then you'll need to make sure you've set config values for consumerKey, callbackUrl. Web environments will also need a value for proxyUrl, or you'll run into CORS issues. 

Please bear in mind with web pages that due to CORS restrictions, unless your callbackUrl is a non-HTTP/HTTPS domain you won't be able to get a refresh\_token, so `Force.refresh()` will throw an error telling you you need to re-login the user. Electron does not have this issue, and as such you can set the callbackUrl to https://login.salesforce.com/services/oauth2/success to get a refresh\_token, allowing you to store the client and keep calling `Force.refresh()` for as long as the refresh\_token is valid!

```html
<!DOCTYPE html>

<html>
  
<head>
  <meta charset="UTF-8">
  <title>Forcetek | Web Example</title>
  <script type="text/javascript" src="Forcetek.js"></script>
  <script type="text/javascript">
    // create a new instance of Forcetek
    var Force = new Forcetek({
      callbackUrl: 'PATH_TO_YOUR_APP/success.html' // must be on same domain
      consumerKey: 'YOUR_CONNECTED_APP_ID', // your sf connected app id
      proxyUrl: 'PATH_TO_YOUR_APP/proxy.php', // proxy for requests
    });
    // call the login popup
    Force.login(function(client) {
      // client can be stored and later refreshed with Force.refresh(client)
      // you can now run any of the request functions, like Force.query()
      Force.query('SELECT Name FROM Account LIMIT 10', function(err, result) {
        if (err) return console.error(err);
        // do something with the data, i.e. show the records in the page
        var mount = document.getElementById('accounts');
        for (var a = 0; a < result.records.length; a++) {
          mount.innerHTML += '<li>' + result.records[a].Name + '</li>';
        }
        // you can now get the current daily REST API limits for this org
        console.log(Force.usage());
      })
    })
  </script>
</head>

<body>
  <!-- mount for the account records -->
  <ul id="accounts"></ul>
</body>

</html>
```

#### Cordova Environments

Similar to an Electron environment, in a Cordova environment you'll need to make sure you've set config values for consumerKey, callbackUrl. Also similar to an Electron environment you can set the callbackUrl to https://login.salesforce.com/services/oauth2/success to get a refresh\_token, allowing you to store the client and keep calling `Force.refresh()` for as long as the refresh\_token is valid!

```html
<!DOCTYPE html>

<html>

<head>
  <meta name="viewport" content="initial-scale=1, width=device-width">
  <title>Forcetek | Cordova Example</title>
  <script type="text/javascript" src="cordova.js"></script>
  <script type="text/javascript" src="js/Forcetek.js"></script>
  <script type="text/javascript">
    // wait for the device to be ready
    document.addEventListener("deviceready", function() {
      // create a new instance of Forcetek
      var Force = new Forcetek({
        callbackUrl: 'PATH_TO_YOUR_APP/success.html' // must be on same domain
        consumerKey: 'YOUR_CONNECTED_APP_ID', // your sf connected app id
      });
      // call the login popup
      Force.login(function(client) {
        // client can be stored and later refreshed with Force.refresh(client)
        // you can now run any of the request functions, like Force.query()
        Force.query('SELECT Name FROM Account LIMIT 10', function(err, result) {
          if (err) return console.error(err);
          // do something with the data, i.e. show the records in the page
          var mount = document.getElementById('accounts');
          for (var a = 0; a < result.records.length; a++) {
            mount.innerHTML += '<li>' + result.records[a].Name + '</li>';
          }
          // you can now get the current daily REST API limits for this org
          console.log(Force.usage());
        })
      })
    });
  </script>
</head>

<body>
  <!-- mount for the account records -->
  <div id="accounts"></div>
</body>

</html>

```

## Error Handling

If any of the request functions result in an error, they will return an error object that Salesforce sends made up of at least an errorCode key and a message key. If it's a Forcetek error, we've kept the structure the same. Here's a list of the main errorCodes you will potentially come across, and what they mean:

**DELETE_FAILED** - tried to delete a record you can't delete  
**ENTITY_IS_DELETED** - record by the given id is deleted  
**INVALID_FIELD** - invalid field in a soql query or record you are trying to create / update  
**INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST** - self-explanatory, inserting a picklist value that's not allowed  
**INVALID_SESSION_ID** - the access token has expired, Forcetek will try and auto-refresh first time it sees this   
**INVALID_TYPE** - invalid object in a soql query  
**JSON_PARSER_ERROR** - incorrect type of data for a field  
**MALFORMED_QUERY** - invalid soql in a soql query  
**REQUIRED_FIELD_MISSING** - fields missing from record you are trying to create / update  
**NO_REFRESH_TOKEN** - Forcetek error, no refresh token is available  

The message key will normally explain more clearly exactly what the problem is, so you can use this to tell the users of the app what's wrong with what they tried to do.

## Notes

Always keep in mind the [Force.com API Request Limits](https://developer.salesforce.com/docs/atlas.en-us.salesforce_app_limits_cheatsheet.meta/salesforce_app_limits_cheatsheet/salesforce_app_limits_platform_api.htm) when building apps with Forcetek, because when your organisation hits the daily limit, your app and all other systems using the API will get locked out, so it's worth thinking about using `Force.usage()` to build cooldown points in your app.

If you have any issues or question, please create an issue on this repository and we'll have a look at it! We'd appreciate any feedback on the examples, or any suggestions of functions you'd find useful.

## Changelog

**1.0.1**  
- Fixed Visualforce environments missing default apiVersion if never set in config

**1.0.0**  
- Initial Commit
