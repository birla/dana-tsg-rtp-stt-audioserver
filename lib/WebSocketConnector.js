const { Transform } = require('stream');
const { EventEmitter } = require('events');
const { WebSocket } = require('ws');
const config = require('config');
const cuid =  require('cuid');
const { WavHeader } = require('./WavHeader');

class WebSocketConnector extends EventEmitter {
    constructor(id, log, opts) {
        super();
        this.log = log.child({ id, platform: 'wss' });

        this.recognizeStream = null;
        this.id = id;
        this.opts = opts;
        this.counter = 0;
        if (!config.get('file.sampleRate')) {
            throw new Error('file.sampleRate not set for WebSocketConnector');
        }
        if (!config.get('file.channels')) {
            throw new Error('file.sampleRate not set for WebSocketConnector');
        }
        this.wavHeader = new WavHeader({
            channels: config.get('file.channels'),
            sampleRate: config.get('file.sampleRate')
        });
    }

    _newId() {
        this.currentId = cuid();
        return this.currentId;
    }

    _audioInputStreamTransform () {
        return new Transform({
            transform: (chunk, encoding, callback) => {
                if (this.client && this.client.readyState == this.client.OPEN) {
                    this.client.send(JSON.stringify({
                        event: 'voice',
                        data: chunk.toString('base64'),
                        //data: this.wavHeader.base64ArrayBuffer(this.wavHeader.transformAddWavHeader(chunk).buffer),
                        // data: this.wavHeader.transformAddWavHeader(chunk).buffer.toString('base64'),
                        // data: this.wavHeader.toBuffer(this.wavHeader.transformAddWavHeader(chunk)).toString('base64'),
                        name: this.opts.name,
                        userID: this.opts.userId,
                        userType: this.opts.userType,
                        chunks: this.counter++,
                        sessionId: this.opts.sessionId,
                        callerId: this.opts.sessionId,
                        time: Date.now()
                    }));
                }

                callback();
            }
        });
    }

    _startRecognizeStream(stream) {
        this.log.info('starting a new stream to WebSocket');

        this.client = new WebSocket(config.get('wss.url'));
        this.client.on('open', () => this.log.info('websocket connection established'));
        this.client.on('error', (error) => {
            this.log.info({ error }, 'error while connecting to websocket server from websocket connector');
            this.end(); // end this connector
        });
    }

    end () {
        if (this.client) {
            this.client.close()
        }
        this.emit('end');
        if (this.globalTimeout) {
            clearTimeout(this.globalTimeout);
        }
    }

    start(stream) {
        this.log.info('starting streaming to websocket')
        let transformedStream = this._audioInputStreamTransform();
        this._startRecognizeStream();
        return stream.pipe(transformedStream);
    }
}

module.exports = WebSocketConnector;