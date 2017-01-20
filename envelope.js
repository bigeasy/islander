function Envelope (islander, cookie, messages) {
    this._islander = islander
    this._cookie = cookie
    this.messages = messages
}

Envelope.prototype.sent = function (response) {
    this._islander._receipts(this._cookie, response)
}

module.exports = Envelope
