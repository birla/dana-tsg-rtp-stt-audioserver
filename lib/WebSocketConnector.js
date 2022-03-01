const { Transform } = require('stream');
const { EventEmitter } = require('events');
const { WebSocket } = require('ws');
const config = require('config');
const cuid =  require('cuid');

class WebSocketConnector extends EventEmitter {
    constructor(id, log) {
        super();
        this.log = log.child({ id, platform: 'wss' });

        this.recognizeStream = null;
        this.currentId = cuid();
    }

    _newId() {
        this.currentId = cuid();
        return this.currentId;
    }

    _audioInputStreamTransform () {
        return new Transform({
            transform: (chunk, encoding, callback) => {
                if (this.client) {
                    this.client.send({
                        // todo
                        room: this.currentId,
                        payload: chunk,
                    });
                }

                callback();
            }
        });
    }

    _startRecognizeStream(stream) {
        this.log.info('starting a new stream to WebSocket');

        this.client = new WebSocket(config.get('wss.url'));
        this.client.on('open', () => this.log.info('websocket connection established'));
    }

    end () {
        if (this.client) {
            this.client.close()
        }
        if (this.globalTimeout) {
            clearTimeout(this.globalTimeout);
        }
    }

    start(stream) {
        this.log.info('starting streaming to websocket')
        let transformedStream = this._audioInputStreamTransform();
        this._startRecognizeStream();
        stream.pipe(transformedStream);
    }
}

module.exports = WebSocketConnector;