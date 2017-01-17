function Envelope (outbox, messages) {
    this._outbox = outbox
    this.messages = messages
}

Envelope.prototype.received = function (success) {
    this._outbox._received.call(this._outbox, success, messages)
}

module.exports = Envelope
