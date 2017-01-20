// Sketch of a what an outbox should look like. Maybe without the received
// method, just call the parent object. These are apendenages, like Vestibule,
// stick them on. They're not supposed to be entire objects in themselves.

var Vestibule = require('vestibule')
var Envelope = require('envelope')

function Outbox (options) {
    this._outbound = new Vestibule
    this._received = options.received || unshift
    this._procession = options.procession
    this._limit = options.limit || Infinity
}

Outbox.prototype.push = function (value) {
    this._messages.push(value)
    this._outbound.notify()
}

Outbox.prototype.enqueue = cadence(function (async, value) {
    this.push(value)
})

Outbox.prototype.shift = function () {
    if (this._bundles.length != 0) {
        return this._bundles.shift()
    }
    if (this._messages.length == 0) {
        return null
    }
    return new Envelope(this, this._messages.splice(0, this._limit))
}

Outbox.prototype.dequeue = cadence(function (async) {
    var loop = async(function () {
        var envelope = this.shift()
        if (envelope != null) {
            return [ loop, envelope ]
        }
        this._outbound.enter(async())
    })()
})

module.exports = Outbox
