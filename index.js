const cloneable = require('cloneable-readable')
const RtpServer = require('./lib/RTPServer');
const config = require('config');
const mqtt = require('async-mqtt');
const { WebSocket } = require('ws');
const Pino = require('pino');
const AzureSpeechConnector = require('./lib/AzureSpeechConnector');
const FileConnector = require('./lib/FileConnector');
const WebSocketConnector = require('./lib/WebSocketConnector');
const log = new Pino({
    name: 'Dana-AudioServer-CT',
});

let rtpServer = new RtpServer(config.get('rtpServer'), log);
const mqttTopicPrefix = config.get('mqtt.prefix');

let connectorsMap = new Map();
let mqttClient;

log.info('started');

/**
 * FOR LOCAL TESTING ONLY
 * @param {*} payload 
 */
async function createNewSTTStreamFromFile(payload) {
    var fs = require('fs');
    var wav = require('wav');

    var file = fs.createReadStream('../recordings/1646390966.24-in.wav');
    var reader = new wav.Reader();

    // the "format" event gets emitted at the end of the WAVE header
    reader.on('format', function (format) {
        // the WAVE header is stripped from the output of the reader
    
        let audioDataStream = cloneable(reader);
        // let audioDataStream = cloneable(rtpServer.createStream(payload.port));
        connectorsMap.set(payload.streamId, new Map());
        let targetStreams = 0;
        if (config.get('azure.enabled')) targetStreams++;
        if (config.get('file.enabled')) targetStreams++;
        if (config.get('wss.enabled')) targetStreams++;
        const streams = [
            audioDataStream
        ];

        for (let i = 0; i < (targetStreams - 1); i++) {
            streams.push(audioDataStream.clone());
        }
        
        if (config.get('azure.enabled')) {
            createNewAzureStream(payload, streams.pop());
        }
        if (config.get('file.enabled')) {
            createNewFileStream(payload, streams.pop());
        }
        if (config.get('wss.enabled')) {
            createNewWebSocketStream(payload, streams.pop());
        }
    });

    // pipe the WAVE file to the Reader instance
    file.pipe(reader);
}

async function jsonToWav() {
    let fileName = 'audio_transcript-6'
    var inpJson = require(`../python-test/${fileName}.json`);
    const Readable = require('stream').Readable;
    const path = require('path');
    const wav = require('wav');
    const s = new Readable();
    s._read = () => {};
    const wavWriter = new wav.FileWriter(path.join('../python-test/', `${fileName}.wav`), {
        sampleRate: config.get('file.sampleRate'),
        channels: config.get('file.channels'),
        signed: true,
        // endianness: 'LE',
        format: 1,
    });
    s.pipe(wavWriter).on('finish', function () {  // finished
        console.log('done');
    });
    for(let k in inpJson) {
        s.push(new Buffer.from(inpJson[k], 'base64'))
    }
    s.push(null);
}

async function createNewSTTStream(payload) {

    let audioDataStream = cloneable(rtpServer.createStream(payload.port));
    connectorsMap.set(payload.streamId, new Map());
    let targetStreams = 0;
    if (config.get('azure.enabled')) targetStreams++;
    if (config.get('file.enabled')) targetStreams++;
    if (config.get('wss.enabled')) targetStreams++;
    const streams = [
        audioDataStream
    ];

    // when the stream closes, stop all connectors as well
    audioDataStream.on('close', () => {
        try {
            stopSTTStream(payload);
        } catch (error) {
            log.error({ payload, error }, 'Failed to stopSTTStream');
            throw error;
        }
    });

    for (let i = 0; i < (targetStreams - 1); i++) {
        streams.push(audioDataStream.clone());
    }
    
    if (config.get('azure.enabled')) {
        createNewAzureStream(payload, streams.pop());
    }
    if (config.get('file.enabled')) {
        createNewFileStream(payload, streams.pop());
    }
    if (config.get('wss.enabled')) {
        createNewWebSocketStream(payload, streams.pop());
    }
}

async function createNewFileStream(payload,audioDataStream) {
    log.info({ payload }, 'New Stream of audio from Asterisk to save to file');

    let fileConnector = new FileConnector(payload.streamId, log);

    let map = connectorsMap.get(payload.streamId);
    map.set('file', fileConnector);
    connectorsMap.set(payload.streamId, map);

    fileConnector.start(audioDataStream);
    fileConnector.on('end', () => {
        let connectors = connectorsMap.get(payload.streamId);
        connectors.delete('file');
    });
}

async function createNewWebSocketStream(payload,audioDataStream) {
    log.info({ payload }, 'New Stream of audio from Asterisk to send to WebSocket');

    let websocketConnector = new WebSocketConnector(payload.streamId, log, getOptsFromPayload(payload));

    let map = connectorsMap.get(payload.streamId);
    map.set('wss', websocketConnector);
    connectorsMap.set(payload.streamId, map);

    websocketConnector.start(audioDataStream);
    websocketConnector.on('end', () => {
        let connectors = connectorsMap.get(payload.streamId);
        connectors.delete('wss');
    });
}

async function createNewAzureStream(payload,audioDataStream) {
    log.info({ payload }, 'New Stream of audio from Asterisk to send to Azure');

    const languageCode = 'en-US';

    const audioConfig = {
        languageCode
    }

    let azureSpeechConnector = new AzureSpeechConnector(audioConfig, payload.streamId, log, getOptsFromPayload(payload));

    let map = connectorsMap.get(payload.streamId);
    map.set('azure', azureSpeechConnector);
    connectorsMap.set(payload.streamId, map);

    azureSpeechConnector.start(audioDataStream);

    azureSpeechConnector.on('message', async (data) => {
        // log.info(`Got a message sending to ${mqttTopicPrefix}/${payload.streamId}/transcription`);
        // await mqttClient.publish(`${mqttTopicPrefix}/${payload.streamId}/transcription`, JSON.stringify({ ...data, callerName: payload.callerName }));

    });
    azureSpeechConnector.on('end', () => {
        let connectors = connectorsMap.get(payload.streamId);
        connectors.delete('azure');
    });
}

function getOptsFromPayload(payload) {
    return {
        name: payload.callerName,
        userId: payload.streamType == 'in' ? '1003' : '1001',
        userType: payload.streamType == 'in' ? 'Patient' : 'Doctor',
        sessionId: payload.roomName,
    };
}

function stopSTTStream(payload) {
    log.info({ payload }, 'Ending stream of audio from Asterisk to send to Azure');

    let connectors = connectorsMap.get(payload.streamId);

    if (connectors) {
        //loop through the providers
        connectors.forEach((connector, key) => {
            connector.end();
            connectors.delete(key);
        })
        connectorsMap.delete(payload.streamId);
    }

    rtpServer.endStream(payload.port);
}

async function run() {

    mqttClient = await mqtt.connectAsync(config.get('mqtt.url'));
    log.info('Connected to MQTT');

    await mqttClient.subscribe(`${mqttTopicPrefix}/newStream`);
    await mqttClient.subscribe(`${mqttTopicPrefix}/streamEnded`);
    log.info('Subscribed to both newStream & streamEnded topic');

    mqttClient.on('message', (topic, message) => {
        let payload = JSON.parse(message.toString());

        switch(topic) {
            case `${mqttTopicPrefix}/newStream`:
                createNewSTTStream(payload);
                break;
            case `${mqttTopicPrefix}/streamEnded`:
                stopSTTStream(payload);
                break;
            default:
                break;
        }
    });

    rtpServer.on('err', (err) => {

        streamsMap.forEach((stream, key) => {
            stream.end();
            streamsMap.delete(key);
        });

        throw err;
    });

    rtpServer.bind();

    // local testing code
    setTimeout(() => {
        // jsonToWav()
        // createNewSTTStreamFromFile({
        //     roomName:'12345',
        //     streamId: '345thrge356',
        //     streamType:'in',
        //     callerName:'test',
        //     channelId: '345thrge356',
        //     port: 55555,
        // });
    }, 500);
    log.info(`AudioServer listening on UDP port ${config.get('rtpServer.port')}`);
}

run();
