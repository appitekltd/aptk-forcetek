/*
 *  @file Minimal Javascript wrapper for the Force.com REST API
 *  @author Appitek Ltd. <support@appitek.com>
 *  @copyright Appitek Ltd. 2017
 *  @license MIT
 *  @version 1.0.1
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
  var _client, 
      _apiUsage, 
      _apiVersion, 
      _callbackUrl, 
      _consumerKey, 
      _loginUrl, 
      _proxyUrl;
  _client = {};
  if (config) {
    _apiVersion = config.apiVersion || 'v35.0';
    _callbackUrl = config.callbackUrl || null;
    _consumerKey = config.consumerKey || null;
    _loginUrl = config.loginUrl || 'https://login.salesforce.com/';
    _proxyUrl = config.proxyUrl || null;
  };
  /*
   *  @function _sendRequest() [private]
   *  @desc sends a HTTP request to a specified Salesforce REST API endpoint
   *
   *  @param {string} url - REST API path relative to /services/data/
   *  @param {string} method - GET || POST || PUT || PATCH || DELETE || HEAD
   *  @param {object|null} payload - data to be turned into JSON and sent
   *  @callback - function to call back to in the form of function(err, res)
   *  @param {boolean} retried - used by the function itself, do not add
   * type for blobs
   */
  function _sendRequest(url, method, payload, callback, retried, type) {
    'use strict';
    var err, 
        header, 
        request, 
        xhttp;
    if (!_client.session_id) {
      err = {
        errorCode: 'NO_SESSION_ID',
        message: 'There is no session id on this client, please login first.'
      };
      return callback(err, null);
    };
    request = _client.instance_url + '/services/data/' + url;
    if (method == 'GETINFO') {
      request = url;
      method = 'GET';
    }
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (xhttp.readyState == 4) {
        if (xhttp.status > 199 && xhttp.status < 300) {
          // need to check we actually have a value for limit info as some
          // requests like /services/data/ for versions info don't return this
          _apiUsage = xhttp.getResponseHeader('Sforce-Limit-Info') ? 
            xhttp.getResponseHeader('Sforce-Limit-Info').split('=')[1] : _apiUsage;
          if (type) {
            return callback(null, xhttp.response || null);
          }
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
          console.error(xhttp.responseText);
          err = JSON.parse(xhttp.responseText)[0];
          // if we get an invalid session error and we haven't already retried
          // we call a refresh to update the session id and try again
          if (err.errorCode == 'INVALID_SESSION_ID' && !retried) {
            _refreshClient(function(err, res) {
              if (err) return callback(err, null);
              _sendRequest(url, method, payload, callback, true);
            })
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
    if (type) {
      console.log(type);
      xhttp.responseType = type;
    }
    xhttp.send(JSON.stringify(payload));
  };
  /*
   *  @function _refreshClient() [private]
   *  @desc refreshes the _client's access token
   *
   *  @callback - function to call back to in the form of function(err, res)
   */
  function _refreshClient(callback) {
    'use strict';
    var err,
        request, 
        xhttp;
    if (!_client.refresh_token) {
      err = {
        errorCode: 'NO_REFRESH_TOKEN',
        message: 'There is no refresh token on this client to refresh with.'
      };
      return callback(err, null);
    }
    request = _loginUrl + '/services/oauth2/token?grant_type=refresh_token&client_id=' 
      + _consumerKey + '&refresh_token=' + _client.refresh_token;
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (xhttp.readyState == 4) {
        if (xhttp.status > 199 && xhttp.status < 300) {
          var refreshed_token = JSON.parse(xhttp.responseText).access_token;
          _client.access_token = refreshed_token;
          _client.session_id = decodeURIComponent(refreshed_token);
          callback(null, _client);
        } else {
          console.log(xhttp.response);
          callback(JSON.parse(xhttp.responseText)[0], null)
        }
      }
    };
    xhttp.open('POST', _client.proxy_url || request, true);
    xhttp.setRequestHeader('SALESFORCEPROXY-ENDPOINT', request);
    xhttp.send();
  };
  /*
   *  @function _watchLogin() [private]
   *  @desc watches the login window until it reaches the redirect page, then
   *    extracts the url parameters to create the _client 
   *
   *  @param {window} win - the popup login window currently active
   *  @param {string} location - window location, given initially if we're in a
   *    Cordova environment, otherwise populated with win.location later
   *  @callback - function to call back to in the form of function(client)
   */
  function _watchLogin(win, location, callback) {
    'use strict';
    var i,
        parameters,
        url;
    setTimeout(function() {
      // try block as CORS will prevent us reading location until we log in
      // and get redirected to our same-domain callbackUrl
      try {
        // if we have a location from the cordova InAppBrowser loadstop event
        // use that, otherwise try the current win.location
        url = location ? location : JSON.stringify(win.location);
        if (_callbackUrl && url.includes(_callbackUrl) == true) {
          win.close();
          parameters = url.split('#')[1].split('&');
          for (i = 0; i < parameters.length; i++) {
            _client[parameters[i].split('=')[0]] = parameters[i].split('=')[1]
          };
          // need to decode these two or you'll get errors when using them
          _client.instance_url = decodeURIComponent(_client.instance_url);
          _client['session_id'] = decodeURIComponent(_client.access_token);
          // store proxyUrl incase we store the client and use Forcetek.refresh()
          _client['proxy_url'] = _proxyUrl;
          // get user info needs fix
          var userinfo = decodeURIComponent(_client.id);
          _sendRequest(userinfo, 'GETINFO', null, function(err, res) {
            _client.email = res.email;
            if (callback) { callback(_client); }
          });
        } else {
          _watchLogin(win, location, callback);
        }
      } catch(e) {
        _watchLogin(win, location, callback);
      }
    }, 100)
  };
  return {
    /*
     *  @function Forcetek.create()
     *  @desc creates a record for a given sObject in Salesforce
     *
     *  @param {string} sobject - type of object to create
     *  @param {object} record - the record to create
     *  @callback - function to call back to in the form of function(err, res)
     */
    create: function(sobject, record, callback) {
      'use strict';
      var url = _apiVersion + '/sobjects/' + sobject;
      _sendRequest(url, 'POST', record, callback, false);
    },
    /*
     *  @function Forcetek.del()
     *  @desc deletes a specific record by it's id
     *
     *  @param {string} sobject - type of object that will be deleted
     *  @param {object} id - the sfid of the record to delete
     *  @callback - function to call back to in the form of function(err, res)
     */
    del: function(sobject, id, callback) {
      'use strict';
      var url = _apiVersion + '/sobjects/' + sobject + '/' + id;
      _sendRequest(url, 'DELETE', null, callback, false);
    },
    /*
     *  @function Forcetek.login()
     *  @desc opens a window for the user to login, once successfully logged in, 
     *    updates the _client and passes it to the callback for storing
     *
     *  @callback - function to call back to in the form of function(client)
     */
    login: function(callback) {
      'use strict';
      var config, 
          url, 
          win;
      url = _loginUrl + 'services/oauth2/authorize?display=popup' +
        '&response_type=token&client_id=' + escape(_consumerKey) + 
        '&redirect_uri=' + escape(_callbackUrl);
      // @todo maybe expose this config option sometime?
      config = 'height=600, width=500';
      win = window.open(url, 'Log In', config);
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
     *  @function Forcetek.query()
     *  @desc sends a SOQL query to the Salesforce REST API
     *
     *  @param {string} soql - the soql query to send
     *  @callback - function to call back to in the form of function(err, res)
     */
    query: function(soql, callback) {
      'use strict';
      var url = _apiVersion + '/query?q=' + encodeURIComponent(soql);
      _sendRequest(url, 'GET', null, callback, false);
    },
    /*
     *  @function Forcetek.query()
     *  @desc sends a SOQL query to the Salesforce REST API
     *
     *  @param {string} soql - the soql query to send
     *  @callback - function to call back to in the form of function(err, res)
     */
    queryAll: function(soql, nextURL, records, callback) {
      'use strict';
      if (nextURL != null) {
        $Force.raw(nextURL, 'GET', null, null, function(err, res) {
          if (err) return console.error(err);
          records = records.concat(res.records);
          if (res.done == false) {
            nextURL = res.nextRecordsUrl.split('/data/')[1];
            $Force.queryAll(soql, nextURL, records, callback);
          } else {
            callback(records);
          }
        });
      } else {
        $Force.query(soql, function(err, res) {
          if (err) return console.error(err);
          records = records.concat(res.records);
          if (res.done == false) {
            nextURL = res.nextRecordsUrl.split('/data/')[1];
            $Force.queryAll(soql, nextURL, records, callback);
          } else {
            callback(records);
          }
        });
      }
    },
    // legacy
    queryBin: function(soql, callback) {
      'use strict';
      var url = _apiVersion + '/queryAll/?q=' + encodeURIComponent(soql);
      _sendRequest(url, 'GET', null, callback, false);
    },
    /*
     *  @function Forcetek.raw()
     *  @desc raw exposure of the _sendRequest to allow custom REST API calls
     *
     *  @param {string} url - REST API path relative to /services/data/
     *  @param {string} method - GET || POST || PUT || PATCH || DELETE || HEAD
     *  type - for blobs
     *  @param {object | null} payload - data to send for a POST || PATCH
     *  @callback - function to call back to in the form of function(err, res)
     */
    raw: function(url, method, payload, type, callback) {
      'use strict';
      _sendRequest(url, method, payload, callback, false, type);
    },
    /*
     *  @function Forcetek.refresh(client, callback)
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
      'use strict';
      _client = client;
      _refreshClient(callback);
    },
    /*
     *  @function Forcetek.session()
     *  @desc creates a client from just a session id (for VF page usage)
     *
     *  @param {string} id - session id from VF i.e. using {!$Api.Session_ID}
     */
    session: function(id) {
      'use strict';
      _client.session_id = id;
      _apiVersion = _apiVersion ? _apiVersion : 'v35.0';
      // @todo does this work for a custom non-sf domain acting as a 301?
      _client.instance_url = window.location.href.split('.com')[0] + '.com';
    },
    /*
     *  @function Forcetek.update()
     *  @desc updates a specific record with the fields given
     *
     *  @param {string} sobject - type of object to create
     *  @param {string} id - sfid of the record to update
     *  @param {object} record - the record values to update on the record
     *  @callback - function to call back to in the form of function(err, res)
     */
    update: function(sobject, id, updates, callback) {
      'use strict';
      var url = _apiVersion + '/sobjects/' + sobject + '/' + id;
      _sendRequest(url, 'PATCH', updates, callback, false);
    },
    /*
     *  @function Forcetek.usage()
     *  @desc returns the current REST API usage and limit
     *
     *  @return {object} - contains a 'used' and a 'limit' key, both will be
     *    null if no REST calls have been made in the module's lifetime
    */
    usage: function() {
      'use strict';
      return {
        used: _apiUsage ? _apiUsage.split('/')[0] : null,
        limit: _apiUsage ? _apiUsage.split('/')[1] : null
      };
    },
    // return client instance url
    url: function() {
      return _client.instance_url;
    },
    // return raw client
    client: function() {
      return _client;
    }
  };
});
