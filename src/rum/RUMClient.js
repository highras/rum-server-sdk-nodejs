'use strict'

const Emitter = require('events').EventEmitter;
const crypto = require('crypto');
const msgpack = require("msgpack-lite");
const Int64BE = require("int64-buffer").Int64BE;

const FPClient = require('../fpnn/FPClient');

class RUMClient {

    /**
     * 
     * @param {object} options 
     * 
     * options:
     * {number} options.pid 
     * {string} options.secret 
     * {string} options.host 
     * {numer} options.port 
     * {bool} options.reconnect 
     * {number} options.timeout 
     */
    constructor(options) {

        this._pid = options.pid;
        this._secret = options.secret;

        this._baseClient = new FPClient({ 
            host: options.host, 
            port: options.port, 
            autoReconnect: options.reconnect,
            connectionTimeout: options.timeout
        });

        let self = this;

        this._baseClient.on('connect', function() {

            self.emit('connect');
        });

        this._baseClient.on('error', function(err) {

            self.emit('error', err);
        });

        this._baseClient.on('close', function() {

            self.emit('close');
        });

        this._msgOptions = {

            codec: msgpack.createCodec({ int64: true })
        };

        this._mid_seq = 0;
        this._salt_seq = 0;
        this._session = 0;
        this._rumId = null;
    }

    destroy() {

        this._mid_seq = 0;
        this._salt_seq = 0;
        this._session = 0;
        this._rumId = null;

        if (this._baseClient) {

            this._baseClient.destroy();
            this._baseClient = null;
        }

        this.removeAllListeners();
    }

    connect() {

        this._baseClient.connect();
    }

    set rumId(value) {

        this._rumId = value;
    }

    set session(value) {

        this._session = value;
    }

    /**
     * @param {string}          ev 
     * @param {object}          attrs 
     * @param {number}          timeout 
     * @param {function}        callback 
     * 
     * @callback
     * @param {Error}           err
     * @param {object}          data
     */
    customEvent(ev, attrs, timeout, callback) {

        let event = buildEvent.call(this, ev, attrs);
        let options = buildSendData.call(this, [ event ]);

        if (!options) {

            callback && callback(new Error('param error'), null);
            return;
        }

        sendQuest.call(this, this._baseClient, options, callback, timeout);
    }

    /**
     * @param {array<object>}   events
     * @param {number}          timeout 
     * @param {function}        callback 
     * 
     * @callback
     * @param {Error}           err
     * @param {object}          data
     */
    customEvents(events, timeout, callback) {

        let options = buildSendData.call(this, events);

        if (!options) {

            callback && callback(new Error('param error'), null);
            return;
        }

        sendQuest.call(this, this._baseClient, options, callback, timeout);
    }
}

function buildSendData(events) {

    let send_list = [];
    let self = this;

    events.forEach(function(event, index) {

        if (event.hasOwnProperty('ev') && event.hasOwnProperty('attrs')) {

            let ev = buildEvent.call(self, event.ev, event.attrs);

            send_list.push(ev);
        }
    });

    if (send_list.length == 0) {

        return null;
    }

    let salt = genSalt.call(this);

    let payload = {
        pid: this._pid,
        sign: genSign.call(this, salt.toString()),
        salt: salt,
        events: send_list
    };

    return {
        flag: 1,
        method: 'adds',
        payload: msgpack.encode(payload, this._msgOptions)
    };
}

function buildEvent(ev, attrs) {

    if (!this._session) {

        this._session = genMid.call(this);
    }

    if (!this._rumId) {

        this._rumId = uuid.call(this, 0, 16, 's');
    }

    return {
        ev: ev,
        sid: this._session,
        rid: this._rumId,
        ts: Math.floor(Date.now() / 1000),
        eid: genMid.call(this),
        source: 'nodejs',
        attrs: attrs
    };
}

function genMid() {

    if (++this._mid_seq >= 999) {

        this._mid_seq = 0;
    }

    let strFix = this._mid_seq.toString();

    if (this._mid_seq < 100) {

        strFix = '0' + strFix;
    }

    if (this._mid_seq < 10) {

        strFix = '0' + strFix;
    } 

    return new Int64BE(Date.now().toString() + strFix);
}

function genSalt() {

    if (++this._salt_seq >= 999) {

        this._salt_seq = 0;
    }

    return new Int64BE(Date.now().toString() + this._salt_seq);
}

function genSign(salt) {

    return md5.call(this, this._pid + ':' + this._secretKey + ':' + salt).toUpperCase();
}

function md5(data) {

    let hash = crypto.createHash('md5');
    hash.update(data);

    return hash.digest('hex');
}

function isException(isAnswerErr, data) {

    if (!data) {

        return new Error('data is null!');
    }

    if (data instanceof Error) {

        return data;
    }

    if (isAnswerErr) {

        if (data.hasOwnProperty('code') && data.hasOwnProperty('ex')) {

            return new Error('code: ' + data.code + ', ex: ' + data.ex);
        }
    }

    return null;
}

function sendQuest(client, options, callback, timeout) {

    let self = this;

    if (!client) {

        callback && callback(new Error('client has been destroyed!'), null);
        return;
    }

    client.sendQuest(options, function(data) {

        if (!callback) {

            return;
        }

        let err = null;
        let isAnswerErr = false;

        if (data.payload) {

            let payload = msgpack.decode(data.payload, self._msgOptions);

            if (data.mtype == 2) {

                isAnswerErr = data.ss != 0;
            }

            err = isException.call(self, isAnswerErr, payload);

            if (err) {

                callback && callback(err, null);
                return;
            }

            callback && callback(null, payload);
            return;
        }

        err = isException.call(self, isAnswerErr, data);
        
        if (err) {

            callback && callback(err, null);
            return;
        }

        callback && callback(null, data);
    }, timeout);
}

function uuid(len, radix, fourteen) {

    let chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
    let uuid_chars = [];

    radix = radix || chars.length;
 
    if (len) {

        // Compact form
        for (let i = 0; i < len; i++) {

            uuid_chars[i] = chars[ 0 | Math.random() * radix ];
        }
    } else {

        // rfc4122, version 4 form
        let r;
 
        // rfc4122 requires these characters
        uuid_chars[8] = uuid_chars[13] = uuid_chars[18] = uuid_chars[23] = '-';
        uuid_chars[14] = fourteen;
 
        // Fill in random data.  At i==19 set the high bits of clock sequence as
        // per rfc4122, sec. 4.1.5
        for (let i = 0; i < 36; i++) {

            if (!uuid_chars[i]) {

                r = 0 | Math.random() * 16;
                uuid_chars[i] = chars[ (i == 19) ? (r & 0x3) | 0x8 : r ];
            }
        }

        // add timestamp(ms) at prefix
        let ms = Date.now().toString();

        for (let i = 0; i < ms.length; i++) {

            uuid_chars[i] = ms.charAt(i);
        }
    }
 
    return uuid_chars.join('');
}

Object.setPrototypeOf(RUMClient.prototype, Emitter.prototype);
module.exports = RUMClient;