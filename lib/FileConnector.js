const { Transform } = require('stream');
const { EventEmitter } = require('events');
const config = require('config');
const cuid =  require('cuid');
const fs = require('fs');
const path = require('path');

class FileConnector extends EventEmitter {
    constructor(id, log) {
        super();
        this.log = log.child({ id, platform: 'file' });

        this.clientConfig = {
            basePath: config.get('file.basePath')
        }

        this.recognizeStream = null;
        this.currentId = cuid();
    }

    _audioInputStreamTransform () {
        return new Transform({
            transform: (chunk, encoding, callback) => {
                if (this.client) {
                    this.client.write(chunk);
                }

                callback();
            }
        });
    }

    _startRecognizeStream(stream) {
        this.log.info('starting a new stream to file');
        this.client = fs.createWriteStream(path.join(this.clientConfig.basePath, `${this.currentId}.wav`), {
            autoClose: true
        });
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
        this.log.info('starting logging to file')
        let transformedStream = this._audioInputStreamTransform();
        this._startRecognizeStream();
        stream.pipe(transformedStream);
    }
}

module.exports = FileConnector;