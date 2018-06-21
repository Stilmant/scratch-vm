const JSONRPCWebSocket = require('../util/jsonrpc-web-socket');
const ScratchLinkWebSocket = 'ws://localhost:20110/scratch/ble';

class BLESession extends JSONRPCWebSocket {

    /**
     * A BLE device session object.  It handles connecting, over web sockets, to
     * BLE devices, and reading and writing data to them.
     * @param {Runtime} runtime - the Runtime for sending/receiving GUI update events.
     * @param {string} extensionId - the id of the extension.
     * @param {object} deviceOptions - the list of options for device discovery.
     * @param {object} connectCallback - a callback for connection.
     */
    constructor (runtime, extensionId, deviceOptions, connectCallback) {
        const ws = new WebSocket(ScratchLinkWebSocket);
        super(ws);

        this._socketPromise = new Promise((resolve, reject) => {
            this._ws.onopen = resolve;
            this._ws.onerror = this._sendError; // TODO: socket error?
            // TODO: generally handle socket disconnects as errors
        });

        this._availablePeripherals = {};
        this._connectCallback = connectCallback;
        this._characteristicDidChangeCallback = null;
        this._deviceOptions = deviceOptions;
        this._runtime = runtime;
        this._ws = ws;
        this._ws.onclose = this._sendError();

        this._runtime.registerExtensionDevice(extensionId, this);
    }

    /**
     * Request connection to the device.
     * If the web socket is not yet open, request when the socket promise resolves.
     */
    requestDevice () {
        // TODO: add timeout for 'no devices yet found' ?
        if (this._ws.readyState === 1) {
            // TODO: what if discover doesn't initiate?
            this.sendRemoteRequest('discover', this._deviceOptions)
                .catch(e => this._sendError(e));
        } else {
            // Try again to connect to the websocket
            // TODO: what if discover doesn't initiate?
            this._socketPromise(this.sendRemoteRequest('discover', this._deviceOptions))
                .catch(e => this._sendError(e));
        }
    }

    /**
     * Try connecting to the input peripheral id, and then call the connect
     * callback if connection is successful.
     * @param {number} id - the id of the peripheral to connect to
     */
    connectDevice (id) {
        this.sendRemoteRequest('connect', {peripheralId: id})
            .then(() => {
                this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTED);
                this._connectCallback();
            })
            .catch(e => {
                // TODO: what if the peripheral loses power? (web socket closes?)
                // TODO: what if tries to connect to an unknown peripheral id?
                this._sendError(e);
            });
    }

    /**
     * Handle a received call from the socket.
     * @param {string} method - a received method label.
     * @param {object} params - a received list of parameters.
     * @return {object} - optional return value.
     */
    didReceiveCall (method, params) {
        // TODO: Add peripheral 'undiscover' handling with timeout?
        switch (method) {
        case 'didDiscoverPeripheral':
            this._availablePeripherals[params.peripheralId] = params;
            this._runtime.emit(
                this._runtime.constructor.PERIPHERAL_LIST_UPDATE,
                this._availablePeripherals
            );
            break;
        case 'characteristicDidChange':
            this._characteristicDidChangeCallback(params.message);
            break;
        case 'ping':
            return 42;
        }
    }

    /**
     * Start reading from the specified ble service.
     * @param {number} serviceId - the ble service to read.
     * @param {number} characteristicId - the ble characteristic to read.
     * @param {boolean} optStartNotifications - whether to start receiving characteristic change notifications.
     * @param {object} onCharacteristicChanged - callback for characteristic change notifications.
     * @return {Promise} - a promise from the remote read request.
     */
    read (serviceId, characteristicId, optStartNotifications = false, onCharacteristicChanged) {
        const params = {
            serviceId,
            characteristicId
        };
        if (optStartNotifications) {
            params.startNotifications = true;
        }
        this._characteristicDidChangeCallback = onCharacteristicChanged;
        return this.sendRemoteRequest('read', params);
        // TODO: handle error here
    }

    /**
     * Write data to the specified ble service.
     * @param {number} serviceId - the ble service to write.
     * @param {number} characteristicId - the ble characteristic to write.
     * @param {string} message - the message to send.
     * @param {string} encoding - the message encoding type.
     * @return {Promise} - a promise from the remote send request.
     */
    write (serviceId, characteristicId, message, encoding = null) {
        const params = {serviceId, characteristicId, message};
        if (encoding) {
            params.encoding = encoding;
        }
        return this.sendRemoteRequest('write', params);
    }

    _sendError (e) {
        console.log(`BLESession error ${e}`);
        this._runtime.emit(this._runtime.constructor.PERIPHERAL_ERROR);
    }
}

module.exports = BLESession;
