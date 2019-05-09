'use strict'

const RUMClient = require('../src/rum/RUMClient');

baseTest.call(this);

function baseTest() {

    let client = new RUMClient({
        pid: 41000015,
        secret: 'affc562c-8796-4714-b8ae-4b061ca48a6b',
        host: '52.83.220.166',
        port: 13609,
        reconnect: true,
        timeout: 5000
    });

    client.on('connect', function() {
        
        console.log('base test connect');            
    });

    client.on('error', function(err) {

        console.error('base test error: ', err);            
    });

    client.on('close', function() {

        console.log('base test closed');            
    });

    client.connect();

    let attrs = { test: 123, xxx: 'yyy' };
    let events = [ { ev: 'error', attrs: attrs }, { ev: 'info', attrs: attrs } ];

    // test customEvent
    client.customEvent("error", attrs, 5000, function(err, data){

        if (err) {

            console.error('customEvent sent err: ', err);
        }

        if (data) {

            console.error('customEvent sent ok');
        }
    });

    // test customEvents
    client.customEvents(events, 5000, function(err, data){

        if (err) {

            console.error('customEvents sent err: ', err);
        }

        if (data) {

            console.error('customEvents sent ok');
        }
    });
}
