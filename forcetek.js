/*
 *  @file Minimal Javascript wrapper for the Force.com REST API
 *  @author Appitek <support@appitek.com>
 *  @copyright Appitek Ltd. 2018
 *  @license MIT
 *  @version 1.0.0
 *
 *  @constructor Forcetek(config)
 *  @desc creates a new instance of Forcetek
 *
 *  @param {object} config - an object made of the following keys:
 *    apiVersion - version of the REST API to use, defaults to 'v35.0'
 *    consumerKey - the salesforce connected app id 
 *    callbackUrl - the redirect url of the connected app
 *    proxyUrl - proxy url if using Forcetek outside of Visualforce 
 *    loginUrl - login page to load, defaults to login.salesforce.com
 */
var Forcetek = (function(config) {
  'use strict';
  var _apiUsage, _apiVersion, _callbackUrl, _client = {}, _consumerKey, 
    _loginUrl, _popupConfig, _proxyUrl, _watcher;
  // set default values if no config is passed
  if (config) {
    _apiVersion = config.apiVersion || 'v35.0';
    _callbackUrl = config.callbackUrl || null;
    _consumerKey = config.consumerKey || null;
    _loginUrl = config.loginUrl || 'https://login.salesforce.com/';
    _popupConfig = config.popupConfig || 'height=600, width=400';
    _proxyUrl = config.proxyUrl || null;
  }
  /*
   *  @method _sendRequest() [private]
   *  @desc sends a HTTP request to a specified Salesforce REST API endpoint
   *
   *  @param {string} url - REST API path relative to /services/data/
   *  @param {string} method - GET || POST || PUT || PATCH || DELETE || HEAD
   *  @param {object|null} payload - data to be turned into JSON and sent
   *  @callback - function to call back to in the form of function(err, res)
   *  @param {boolean} retried - used by the function itself, do not add
   */
  function _sendRequest(url, method, payload, callback, retried) {
    var err, header, request, xhttp;
    if (!_client.session_id) {
      err = {
        errorCode: 'NO_SESSION_ID',
        message: 'There is no session id on this client, please login first.'
      };
      return callback(err, null);
    }
    request = _client.instance_url + '/services/data/' + url;
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (xhttp.readyState == 4) {
        if (xhttp.status > 199 && xhttp.status < 300) {
          // need to check we actually have a value for limit info as some
          // requests like /services/data/ for versions info don't return this
          _apiUsage = xhttp.getResponseHeader('Sforce-Limit-Info') ? 
            xhttp.getResponseHeader('Sforce-Limit-Info').split('=')[1] : _apiUsage;
          callback(null, JSON.parse(xhttp.responseText || null));
        } else {
          /**
           *  @note possible returned err.errorCode values:
           *    DELETE_FAILED - tried to delete a record you can't delete
           *    ENTITY_IS_DELETED - record by the given id is deleted
           *    INVALID_FIELD - invalid field in query or record to C/U
           *    INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST - self-explanatory
           *    INVALID_SESSION_ID - access token has expired
           *    INVALID_TYPE - invalid object in query
           *    JSON_PARSER_ERROR - incorrect type of data for a field
           *    MALFORMED_QUERY - invalid soql in query
           *    REQUIRED_FIELD_MISSING - fields missing from record to C/U
           *    NO_REFRESH_TOKEN - custom, no refresh token is available
           */
          err = JSON.parse(xhttp.responseText)[0];
          // if we get an invalid session error and we haven't already retried
          // we call a refresh to update the session id and try again
          if (err.errorCode == 'INVALID_SESSION_ID' && !retried) {
            _refreshClient(function(err, res) {
              if (err) return callback(err, null);
              _sendRequest(url, method, payload, callback, true);
            });
          } else {
            callback(err, null);
          }
        }
      } 
    };
    // if in a web page using a proxy we need to change the auth header name
    header = _client.proxy_url ? 'X-AUTHORIZATION' : 'AUTHORIZATION';
    xhttp.open(method, _client.proxy_url || request, true);
    xhttp.setRequestHeader('CONTENT-TYPE', 'application/json');
    xhttp.setRequestHeader('SALESFORCEPROXY-ENDPOINT', request);
    xhttp.setRequestHeader(header, 'Bearer ' + _client.session_id);
    xhttp.send(JSON.stringify(payload));
  }
  /*
   *  @method _refreshClient() [private]
   *  @desc refreshes the _client's access token
   *
   *  @callback - function to call back to in the form of function(err, res)
   */
  function _refreshClient(callback) {
    var err, request, xhttp;
    if (!_client.refresh_token) {
      err = {
        errorCode: 'NO_REFRESH_TOKEN',
        message: 'There is no refresh token on this client to refresh with.'
      };
      return callback(err, null);
    }
    request = _loginUrl + '/services/oauth2/token?grant_type=refresh_token&client_id=' + 
      _consumerKey + '&refresh_token=' + _client.refresh_token;
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (xhttp.readyState == 4) {
        if (xhttp.status > 199 && xhttp.status < 300) {
          var refreshed_token = JSON.parse(xhttp.responseText).access_token;
          _client.access_token = refreshed_token;
          _client.session_id = decodeURIComponent(refreshed_token);
          callback(null, _client);
        } else {
          callback(JSON.parse(xhttp.responseText)[0], null);
        }
      }
    };
    xhttp.open('POST', _client.proxy_url || request, true);
    xhttp.setRequestHeader('SALESFORCEPROXY-ENDPOINT', request);
    xhttp.send();
  }
  /*
   *  @method _watchLogin() [private]
   *  @desc watches the login window until it reaches the redirect page, then
   *    extracts the url parameters to create the _client 
   *
   *  @param {window} win - the popup login window currently active
   *  @param {string} location - window location, given initially if we're in a
   *    Cordova environment, otherwise populated with win.location later
   *  @callback - function to call back to in the form of function(client)
   */
  function _watchLogin(win, location, callback) {
    _watcher = setInterval(function() {
      // try block as CORS will prevent us reading location until we log in
      // and get redirected to our same-domain callbackUrl
      if (win.closed == true) { clearInterval(_watcher); }
      try {
        // if we have a location from the cordova InAppBrowser loadstop event
        // use that, otherwise try the current win.location
        url = location ? location : JSON.stringify(win.location);
        if (_callbackUrl && url.includes(_callbackUrl) == true) {
          win.close();
          clearInterval(_watch);
          parameters = url.split('#')[1].split('&');
          for (i = 0; i < parameters.length; i++) {
            _client[parameters[i].split('=')[0]] = parameters[i].split('=')[1];
          }
          // need to decode these two or you'll get errors when using them
          _client.instance_url = decodeURIComponent(_client.instance_url);
          _client.session_id = decodeURIComponent(_client.access_token);
          // store proxyUrl incase we store the client and use Forcetek.refresh()
          _client.proxy_url = _proxyUrl;
          if (callback) { callback(_client); }
        }
      } catch(e) {} 
    }, 100);
  }
  return {
    /*
     * @method Forcetek.client()
     * @desc Returns the internal client object so you can access some of it's
     *   variables, such as the instance_url or access_token
     * 
     * @return {object} - object containing the following keys:
     *   
     * 
     * 
     */
    client: function() {
      return _client;
    },
    /*
     *  @method Forcetek.create()
     *  @desc creates a record for a given sObject in Salesforce
     *
     *  @param {string} sobject - type of object to create
     *  @param {object} record - the record to create
     *  @callback - function to call back to in the form of function(err, res)
     */
    create: function(sobject, record, callback) {
      var url = _apiVersion + '/sobjects/' + sobject;
      _sendRequest(url, 'POST', record, callback, false);
    },
    /*
     *  @method Forcetek.del()
     *  @desc deletes a specific record by it's id
     *
     *  @param {string} sobject - type of object that will be deleted
     *  @param {object} id - the sfid of the record to delete
     *  @callback - function to call back to in the form of function(err, res)
     */
    del: function(sobject, id, callback) {
      var url = _apiVersion + '/sobjects/' + sobject + '/' + id;
      _sendRequest(url, 'DELETE', null, callback, false);
    },
    /*
     *  @method Forcetek.login()
     *  @desc opens a window for the user to login, once successfully logged in, 
     *    updates the _client and passes it to the callback for storing
     *
     *  @callback - function to call back to in the form of function(client)
     */
    login: function(callback) {
      var config, url, win;
      url = _loginUrl + 'services/oauth2/authorize?display=popup' +
        '&response_type=token&client_id=' + escape(_consumerKey) + 
        '&redirect_uri=' + escape(_callbackUrl);
      win = window.open(url, 'Log In', _popupConfig);
      // if running cordova we can't access window.location and instead need to
      // listen for the loadstop event that Cordova InAppBrowser adds
      if (window.cordova) {
        win.addEventListener('loadstop', function(ev) {
          _watchLogin(win, ev.url, callback);
        });
      } else {
        _watchLogin(win, null, callback);
      }
    },
    /*
     *  @method Forcetek.query()
     *  @desc sends a SOQL query to the Salesforce REST API
     *
     *  @param {string} soql - the soql query to send
     *  @callback - function to call back to in the form of function(err, res)
     */
    query: function(soql, callback) {
      var url = _apiVersion + '/query?q=' + encodeURIComponent(soql);
      _sendRequest(url, 'GET', null, callback, false);
    },
    /*
     *  @method Forcetek.raw()
     *  @desc raw exposure of the _sendRequest to allow custom REST API calls
     *
     *  @param {string} url - REST API path relative to /services/data/
     *  @param {string} method - GET || POST || PUT || PATCH || DELETE || HEAD
     *  @param {object | null} payload - data to send for a POST || PATCH
     *  @callback - function to call back to in the form of function(err, res)
     */
    raw: function(url, method, payload, callback) {
      _sendRequest(url, method, payload, callback, false);
    },
    /*
     *  @method Forcetek.refresh(client, callback)
     *  @desc sets the given client and refreshes it, re-activated it
     *  @note you need to have a refresh_token key on the client, which you will
     *    only get from sf oauth if your redirect url is not HTTP/HTTPS or if
     *    you use https://login.salesforce.com/services/oauth2/success
     *    due to CORS you'll only be able to get a refresh token in something 
     *    like Electron or Cordova, not in a standard web page.
     *
     *  @param {object} client - a client previously made from force.login()
     *  @callback - function to call back to in the form of function(err, res)
     */
    refresh: function(client, callback) {
      _client = client;
      _refreshClient(callback);
    },
    /*
     *  @method Forcetek.session()
     *  @desc creates a client from just a session id (for VF page usage)
     *
     *  @param {string} id - session id from VF i.e. using {!$Api.Session_ID}
     */
    session: function(id) {
      _client.session_id = id;
      _apiVersion = _apiVersion ? _apiVersion : 'v35.0';
      // @note does this work for a custom non-sf domain acting as a 301?
      _client.instance_url = window.location.href.split('.com')[0] + '.com';
    },
    /*
     *  @method Forcetek.update()
     *  @desc updates a specific record with the fields given
     *
     *  @param {string} sobject - type of object to create
     *  @param {string} id - sfid of the record to update
     *  @param {object} record - the record values to update on the record
     *  @callback - function to call back to in the form of function(err, res)
     */
    update: function(sobject, id, updates, callback) {
      var url = _apiVersion + '/sobjects/' + sobject + '/' + id;
      _sendRequest(url, 'PATCH', updates, callback, false);
    },
    /*
     *  @method Forcetek.usage()
     *  @desc returns the current REST API usage and limit
     *
     *  @return {object} - contains a 'used' and a 'limit' key, both will be
     *    null if no REST calls have been made in the module's lifetime
     */
    usage: function() {
      return {
        used: _apiUsage ? _apiUsage.split('/')[0] : null,
        limit: _apiUsage ? _apiUsage.split('/')[1] : null
      };
    }
  };
});