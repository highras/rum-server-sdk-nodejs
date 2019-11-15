'use strict'

const Emitter = require('events').EventEmitter;
const crypto = require('crypto');
const msgpack = require("msgpack-lite");
const Int64BE = require("int64-buffer").Int64BE;

const FPConfig = require('../fpnn/FPConfig');
const FPClient = require('../fpnn/FPClient');
const FPManager = require('../fpnn/FPManager');
const ErrorRecorder = require('../fpnn/ErrorRecorder');
const RUMConfig = require('./RUMConfig');

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
     * {bool} options.debug
     */
    constructor(options) {
        if (options.pid === undefined || options.pid <= 0) {
            console.log('[RUM] The \'pid\' Is Zero Or Negative!');
            return;
        }
        if (options.secret === undefined || !options.secret) {
            console.log('[RUM] The \'secret\' Is Null Or Empty!');
            return;
        }
        if (options.host === undefined || !options.host) {
            console.log('[RUM] The \'host\' Is Null Or Empty!');
            return;
        }
        if (options.port === undefined || options.port <= 0) {
            console.log('[RUM] The \'port\' Is Zero Or Negative!');
            return;
        }

        console.log('[RUM] rum_sdk@' + RUMConfig.VERSION + ', fpnn_sdk@' + FPConfig.VERSION);

        this._pid = options.pid;
        this._secret = options.secret;
        this._host = options.host;
        this._port = options.port;
        this._timeout = options.timeout;
        this._reconnect = options.reconnect === undefined ? true : options.reconnect;
        this._debug = options.debug === undefined ? false : options.debug;
        this._msgOptions = {
            codec: msgpack.createCodec({
                int64: true
            })
        };
        this._isClose = false;
        this._secondListener = null;
        this._encryptInfo = null;
        this._delayCount = 0;
        this._delayTimestamp = 0;
        this._midGenerator = new RUMClient.IDGenerator();
        this._eidGenerator = new RUMClient.IDGenerator();
        this._initSession = this._eidGenerator.gen();
        init.call(this);
    }

    set rumId(value) {
        this._rumId = value;
    }

    set session(value) {
        this._session = value;
    }

    destroy() {
        this._isClose = true;
        this._delayCount = 0;
        this._delayTimestamp = 0;
        this._session = 0;
        this._rumId = null;
        if (this._secondListener) {
            FPManager.instance.removeSecond(this._secondListener);
            this._secondListener = null;
        }
        this.emit('close', !this._isClose && this._reconnect);
        let self = this;
        FPManager.instance.asyncTask(function(state){
            self.removeAllListeners();
        }, null);

        if (this._baseClient) {
            this._baseClient.close();
            this._baseClient = null;
        }
    }

    /**
     *
     * @param {Buffer/string}   peerPubData
     * @param {object}          options
     *
     * options:
     * {string}     options.curve
     * {number}     options.strength
     * {bool}       options.streamMode
     */
    connect(peerPubData, options) {
        if (!options) {
            options = {};
        }
        if (typeof(peerPubData) == 'string') {
            let self = this;
            fs.readFile(peerPubData, function (err, data) {
                if (err) {
                    self.connect(null, options);
                } else {
                    self.connect(data, options);
                }
            });
            return;
        }
        createBaseClient.call(this);
        if (this._baseClient) {
            let succ = this._baseClient.encryptor(options.curve, peerPubData, options.streamMode, options.strength);
            if (succ) {
                this._encryptInfo = new RUMClient.EncryptInfo(peerPubData, options);
                this._baseClient.connect(function (fpEncryptor) {
                    return msgpack.encode({
                        publicKey: fpEncryptor.pubKey,
                        streamMode: fpEncryptor.streamMode,
                        bits: fpEncryptor.strength
                    })
                });
            } else {
                this._encryptInfo = null;
                this._baseClient.connect();
            }
        }
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
        let payload = buildSendData.call(this, [ event ]);
        if (!payload) {
            callback && callback(new Error('param error'), null);
            return;
        }
        sendQuest.call(this, this._baseClient, 'adds', payload, callback, timeout);
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
        let payload = buildSendData.call(this, events);
        if (!payload) {
            callback && callback(new Error('param error'), null);
            return;
        }
        sendQuest.call(this, this._baseClient, 'adds', payload, callback, timeout);
    }
}

function init() {
    let self = this;
    this._secondListener = function (timestamp) {
        delayConnect.call(self, timestamp)
    };
    FPManager.instance.addSecond(this._secondListener);
    ErrorRecorder.instance.recorder = new RUMClient.RUMErrorRecorder(function(err){
        self.emit('err', err);
    }, this._debug);
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

    let salt = this._midGenerator.gen();
    let sign = genSign.call(this, salt);
    return {
        pid: this._pid,
        sign: sign,
        salt: salt,
        events: send_list
    };
}

function buildEvent(ev, attrs) {
    let ts = FPManager.instance.timestamp;
    let eid = this._eidGenerator.gen();
    if (!this._session) {
        this._session = this._initSession;
    }

    if (!this._rumId) {
        this._rumId = uuid.call(this, 0, 16, 'S');
    }

    return {
        ev: ev,
        sid: this._session,
        rid: this._rumId,
        ts: ts,
        eid: eid,
        source: 'nodejs',
        attrs: attrs
    };
}

function genSign(salt) {
    let sb = [];
    sb.push(this._pid);
    sb.push(':');
    sb.push(this._secret);
    sb.push(':');
    sb.push(salt.toString());
    return FPManager.instance.md5(sb.join('')).toUpperCase();
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
            let sb = [];
            sb.push('code: ');
            sb.push(data.code);
            sb.push(', ex: ');
            sb.push(data.ex);
            return new Error(sb.join(''));
        }
    }
    return null;
}

function createBaseClient() {
    if (this._baseClient == null) {
        this._isClose = false;
        let options = {
            host: this._host,
            port: this._port,
            connectionTimeout: this._timeout,
        }
        let self = this;
        options.onConnect = function () {
            onConnect.call(self);
        };
        options.onClose = function () {
            onClose.call(self);
        };
        options.onError = function (err) {
            onError.call(self, err);
        };
        this._baseClient = new FPClient(options);
    }
}

function onConnect() {
    this._delayCount = 0;
    this.emit('connect');
}

function onClose() {
    if (this._baseClient) {
        this._baseClient = null;
    }
    this.emit('close', !this._isClose && this._reconnect);
    reconnect.call(this);
}

function onError(err) {
    ErrorRecorder.instance.recordError(err);
}

function connect(info) {
    if (!info) {
        this.connect();
    } else {
        this.connect(info.pubBytes, info.options);
    }
}

function reconnect() {
    if (!this._reconnect) {
        return;
    }
    if (this._isClose) {
        return;
    }
    if (this._processor) {
        this._processor.clearPingTimestamp();
    }
    if (++this._delayCount >= RUMConfig.RECONN_COUNT_ONCE) {
        this.connect(this._encryptInfo);
        return;
    }
    this._delayTimestamp = FPManager.instance.milliTimestamp;
}

function delayConnect(timestamp) {
    if (this._delayTimestamp == 0) {
        return;
    }
    if (timestamp - this._delayTimestamp < RUMConfig.CONNCT_INTERVAL) {
        return;
    }
    this._delayCount = 0;
    this._delayTimestamp = 0;
    this.connect(this._encryptInfo);
}

function sendQuest(client, cmd, payload, callback, timeout) {
    if (!client) {
        callback && callback(new Error('client has been destroyed!'), null);
        return;
    }

    let options = {
        flag: 1,
        method: cmd,
        payload: msgpack.encode(payload, this._msgOptions)
    };

    let self = this;
    client.sendQuest(options, function (data) {
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

RUMClient.IDGenerator = class {
    constructor() {
        this.count = 0;
        this.strBuilder = [];
    }

    gen() {
        let count = this.count;
        let sb = this.strBuilder;

        if (++count > 999) {
            count = 1;
        }

        this.count = count;
        sb.length = 0;
        sb.push(FPManager.instance.milliTimestamp);

        if (count < 100) {
            sb.push('0');
        }
        if (count < 10) {
            sb.push('0');
        }
        sb.push(count);
        return new Int64BE(sb.join(''));
    }
};

RUMClient.RUMRegistration = class {
    static register() {
        FPManager.instance;
    }
};

RUMClient.RUMErrorRecorder = class {
    constructor(errFunc, debug) {
        this._debug = debug;
        this._errFunc = errFunc;
    }

    recordError(err) {
        if (this._debug) {
            console.error(err);
        }
        this._errFunc && this._errFunc(err);
    }
};

Object.setPrototypeOf(RUMClient.prototype, Emitter.prototype);
module.exports = RUMClient;