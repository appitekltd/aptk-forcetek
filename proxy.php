<?PHP
//  @file Minimal PHP Proxy for use with forcetek.js
//  @author Appitek <support@appitek.com>
//  @copyright Appitek Ltd. 2018
//  @license MIT
//  @version 1.0.0
//
//  Send a standard XMLHttpRequest to this proxy to access the REST API from
//  a non-salesforce domain. The request you should have the following headers:
//
//  xhttp.setRequestHeader('CONTENT-TYPE', 'application/json');
//  xhttp.setRequestHeader('SALESFORCEPROXY-ENDPOINT', MY_API_REQUEST_URL);
//  xhttp.setRequestHeader('X-AUTHORIZATION', 'Bearer ' + MY_SESSION_ID);
//
//  The proxy accepts these methods: GET, POST, PUT, PATCH, DELETE, HEAD
//
//  Response format will be JSON

// set empty status
$status = array();
// set the request url
$url = isset($_SERVER['HTTP_SALESFORCEPROXY_ENDPOINT']) ? $_SERVER['HTTP_SALESFORCEPROXY_ENDPOINT'] : null;
// check request url
if (!$url) {
  // if there's no request url, return error
  $contents = 'ERROR: HTTP_SALESFORCEPROXY_ENDPOINT NOT SPECIFIED';
  $status['http_code'] = 400;
  $status['status_text'] = 'Bad Request';
} else {
  // set access headers
  header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, HEAD');
  header('Access-Control-Allow-Headers: authorization, content-type');
  // don't proxy OPTIONS request
  if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') { exit(); }
  // init curl
  $ch = curl_init($url);
  // pass on request method
  curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);
  // pass on content, if any
  if ((isset($_SERVER['CONTENT_LENGTH']) && $_SERVER['CONTENT_LENGTH'] > 0) 
  || (isset($_SERVER['HTTP_CONTENT_LENGTH']) && $_SERVER['HTTP_CONTENT_LENGTH'] > 0)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents("php://input"));
  }
  // create header array
  $headers = array();
  // pass through auth header
  array_push($headers, "Authorization: ".$_SERVER['HTTP_X_AUTHORIZATION']);
  // Pass through the content-type header
  if (isset($_SERVER['CONTENT_TYPE'])) {
	 array_push($headers, "Content-Type: ".$_SERVER['CONTENT_TYPE']);
  } elseif (isset($_SERVER['HTTP_CONTENT_TYPE'])) {
    array_push($headers, "Content-Type: ".$_SERVER['HTTP_CONTENT_TYPE']);
  }
  // pass soap action header if given
  if (isset($_SERVER['HTTP_SOAPACTION'])) {
    array_push($headers, "SOAPAction: ".$_SERVER['HTTP_SOAPACTION']);
  }
  // pass query options header if given
  // e.g. xhttp.setRequestHeader('SFORCE-QUERY-OPTIONS', 'batchSize=1000');
  if (isset($_SERVER['HTTP_SFORCE-QUERY-OPTIONS'])) {
    array_push($headers, "Sforce-Query-Options: ".$_SERVER['HTTP_SFORCE-QUERY-OPTIONS']);
  }
  // pass user agent header if given
  if ( isset($_SERVER['HTTP_X_USER_AGENT'])) {
    array_push($headers, "X-User-Agent: ".$_SERVER['HTTP_X_USER_AGENT'] );
  }
  // pass forwarded for header if given
  if (isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    array_push($headers, $_SERVER['HTTP_X_FORWARDED_FOR'].", ".$_SERVER['HTTP_X_USER_AGENT']);
  } else if (isset($_SERVER['REMOTE_ADDR'])) {
    array_push($headers, "X-Forwarded-For: ".$_SERVER['REMOTE_ADDR'] );
  }
  // set headers as long as there's at least 1
  if (count($headers) > 0) {
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  }
  // set location / header / transfer / user agent
  curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
  curl_setopt($ch, CURLOPT_HEADER, true);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT']);
  list($header, $contents) = preg_split('/([\r\n][\r\n])\\1/', curl_exec($ch), 2);
  // set statis based on current curl
  $status = curl_getinfo($ch);
  // if error, update status
  if (curl_errno($ch)) {
    $status['http_code'] = 500;
    $contents = "cURL error ".curl_errno($ch).": ".curl_error($ch)."\n";
  }
  // finish curl
  curl_close($ch);
}
// Split header text into an array.
$header_text = isset($header) ? preg_split('/[\r\n]+/', $header) : array();
// build the correct header match
if (isset($status['http_code'])) {
  $header = "HTTP/1.1 ".$status['http_code'];
  if (isset($status['status_text'])) {
    $header .= " ".$status['status_text'];
  }
  header($header);
  $header_match = '/^(?:Content-Type|Content-Language|Set-Cookie|Sforce-Limit-Info)/i';
} else {
  $header_match = '/^(?:HTTP|Content-Type|Content-Language|Set-Cookie|Sforce-Limit-Info)/i';
}
// make sure each header matches those given
foreach ($header_text as $header) {
  if (preg_match($header_match, $header) ) {
    header($header);
  }
}
// return contents
print $contents;
?>