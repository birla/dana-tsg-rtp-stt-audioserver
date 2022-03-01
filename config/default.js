module.exports = {
    rtpServer: {
        port: 7777,
        host: '127.0.0.1',
        swap16: false
    },
    mqtt: {
        url: 'ws://broker.hivemq.com:8000/mqtt',
        prefix: 'danatsg-ct'
    },
    google: {
        enabled: false,
        keyFilename: 'foo.json'
    },
    azure: {
        enabled: false,
        region: 'uksouth',
        subscriptionKey: 'key'
    },
    amazon: {
        enabled: false,
        credentials: {
            accessKeyId: 'key',
            secretAccessKey: 'key',
        },
        region: 'eu-west-1'
    },
    file: {
        enabled: true,
        basePath: 'd:/Code/voice/asterisk/recordings',
        sampleRate: 8000,
        channels: 1
    },
    wss: {
        enabled: false,
        url: 'wss://127.0.0.1:8081/'
    },
}