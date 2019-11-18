# rum-server-sdk-nodejs

## Usage

### Create

```
let client = new RUMClient({
    pid: 41000015,
    secret: 'affc562c-8796-4714-b8ae-4b061ca48a6b',
    host: '52.83.220.166',
    port: 13609,
    reconnect: true,
    timeout: 5000,
    debug: false 
});
client.connect();
```

### Set Rum ID And Session ID . (Optional, If not specified, a random one will be generated)
```
client.rumId = rid;     //string
client.session = sid;   //number
```

### Send Custom Event
```
let attrs = { test: 123, xxx: 'yyy' };
client.customEvent("error", attrs, 5000, function(err, data){
    if (err) {
        console.error(err.message);
        return;
    }
    if (data) {
        console.log('customEvent sent ok');
    }
});
```

### Send Custom Events
```
let events = [ { ev: 'error', attrs: attrs }, { ev: 'info', attrs: attrs } ];
client.customEvents(events, 5000, function(err, data){
    if (err) {
        console.error(err.message);
        return;
    }
    if (data) {
        console.log('customEvents sent ok');
    }
});
```

### Set Connected、Closed、Error Callback
```
client.on('connect', function() {
    console.log('test connect');            
});

client.on('error', function(err) {
    console.error(err.message);            
});

client.on('close', function() {
    console.log('test closed');            
});
```
