const { Transform } = require('stream');
const { EventEmitter } = require('events');
const config = require('config');
const fs = require('fs');
const path = require('path');
const wav = require('wav');

class FileConnector extends EventEmitter {
    constructor(id, log) {
        super();
        this.log = log.child({ id, platform: 'file' });

        if (!config.get('file.basePath')) {
            throw new Error('file.basePath not set for FileConnector');
        }
        if (!config.get('file.sampleRate')) {
            throw new Error('file.sampleRate not set for FileConnector');
        }
        if (!config.get('file.channels')) {
            throw new Error('file.sampleRate not set for FileConnector');
        }

        this.client = null;
        this.filePath = null;
        this.id = id;
    }

    _audioInputStreamTransform () {
        return this.client;
    }

    _startRecognizeStream() {
        this.log.info('starting a new stream to file');
        this.filePath = path.join(config.get('file.basePath'), `${this.id}.wav`);
        this.client = new wav.FileWriter(this.filePath, {
            sampleRate: config.get('file.sampleRate'),
            channels: config.get('file.channels'),
            signed: true,
            // endianness: 'LE',
            format: 1,
        });
    }

    end () {
        this.log.info('ending logging to file');
        if (this.client) {
            this.client = null;
        }
        if (this.globalTimeout) {
            clearTimeout(this.globalTimeout);
        }
    }

    start(stream) {
        this.log.info('starting logging to file');
        this._startRecognizeStream();
        let transformedStream = this._audioInputStreamTransform();
        stream.pipe(transformedStream);
    }
}

module.exports = FileConnector;