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
}

async function createNewWebSocketStream(payload,audioDataStream) {
    log.info({ payload }, 'New Stream of audio from Asterisk to send to WebSocket');

    let websocketConnector = new WebSocketConnector(payload.streamId, log, getOptsFromPayload(payload));

    let map = connectorsMap.get(payload.streamId);
    map.set('wss', websocketConnector);
    connectorsMap.set(payload.streamId, map);

    websocketConnector.start(audioDataStream);
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
    log.info({ payload }, 'Ending stream of audio from Asterisk to send to Google');

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
    log.info(`AudioServer listening on UDP port ${config.get('rtpServer.port')}`);
}

run();
