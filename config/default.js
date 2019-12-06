module.exports = {
    rtpServer: {
        port: 7777,
        host: '127.0.0.1',
        swap16: true
    },
    mqtt: {
        url: 'mqtt://test.mosquitto.org',
        prefix: 'danatsg'
    },
    google: {
        keyFilename: 'foo.json'
    }
}