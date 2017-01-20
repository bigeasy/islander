function Envelope (islander, messages) {
    this._islander = islander
    this.messages = messages
}

Envelope.prototype.sent = function (response) {
    this._islander._receipts(response)
}

module.exports = Envelope
