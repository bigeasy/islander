// TODO Optionally surrender retries on collapse.
var assert = require('assert')
var Monotonic = require('monotonic').asString
var cadence = require('cadence')
var unshift = [].unshift
var logger = require('prolific.logger').createLogger('islander')
var Procession = require('procession')

function Islander (id) {
    this.id = id
    this._cookie = '0'
    this._governments = []
    this._transmission = '0'
    this._transmissions = {}
    // TODO What is the structure, how are objects grouped? It appears that
    // `_seeking` are sent batches, generally zero or one outstanding messages
    // followed by zero or more flush messages. Confirm and document.
    //
    // Our structure somelinke like the one in `Sequester`, but not really.
    this._seeking = []
    // Pending appears to be the next first entry into `_seeking`, one that we
    // biuld while we are waiting for all of the seeking entries to arrive.
    this._pending = []
    this.log = new Procession
    this.log.push({ promise: '0/0' })
    // Only pull one message from the outbox at a time.
    this.outbox = new Procession
}

Islander.prototype._nextCookie = function () {
    return this._cookie = Monotonic.increment(this._cookie, 0)
}

Islander.prototype.publish = function (body) {
    var cookie = this._nextCookie()
    this._pending.push({ id: this.id, cookie: cookie, body: body })
    this._nudge()
    return cookie
}

Islander.prototype._nextTransmission = function () {
    return this._transmissions = Monotonic.increment(this._transmissions, 0)
}

Islander.prototype._nudge = function () {
    if (
        this._seeking.length == 0 &&
        this._pending.length != 0
    ) {
        var transmission = this._nextTransmission()
        this._terminator = null
        this._seeking = {
            transmissions: {},
            messages: this._pending.splice(0, this._pending.length)
        }
        this._seeking.transmissions[transmission] = {
            type: 'send'
        }
        this.outbox.push({
            cookie: transmission,
            messages: JONS.parse(JSON.stringify(this._seeking.messages))
        })
    }
}

// TODO Ensure that `_retry` is not called when we're waiting on a send. Come
// back and read through the code, add assertions.

//
Islander.prototype._flush = function () {
    var transmission = this._nextTransmission()
    this._seeking.transmissions[transmission] = {
        type: 'flush'
    }
    this._sending = {
        completed: false,
        lost: false,
        messages: [{ id: this.id, cookie: this._nextCookie(), body: null }]
    }
    this._seeking.push(this._sending)
    this.outbox.push({
        this._sending.messages
    })
}

// TODO Need to timeout flushes, make sure we're not hammering a broken
// government.

// Called from the envelope with receipts from a submission to the consensus
// algorithm. Using the `receipts` we assign a promise to each of messages we
// sent based on their cookie. If `receipts` is `null`, than the submission
// failed for whatever reason. We also mark the submission completed.

//
Islander.prototype.sent = function (cookiej, receipts) {
    var transmission = this._transmissions[cookie]
    if (transmission != null) {
        if (receipts == null) }{
            this._flush()
        } else {
            switch (transmission.type) {
            case 'send':
                break
            case 'flush':
                break
            }
        }
    }
}

// Long diatribe. Initially about race conditions possibly introduced by the
// process bounardy between the Compassion Colleague and the Conference based
// application that it is running. Doesn't seem likely to me.

// Then a wondering why we don't just track the cookies alone. This trails off
// into a realization that the current system with the remapping is definitive.

// Possibly there is some confusion about using an outbox when there is only
// ever one message outbound at a time. It is a single message with an array of
// accumulated messages to send. A structure like Turnstile.Check seems more
// appropriate, but it isn't really, because the callback is assigned at
// construction. Procession indicates you can connect later.

//
Islander.prototype.push = function (entry) {
    // User must provide items in order.
    assert(this._previous == entry.previous || this._previous == null, 'out of order')

    // Make note of the previous promise.
    this._previous = entry.promise

    // Whatever it is, we can forward it. This is not a filter nor a transform.
    this.log.push(entry)

    // Take note of a new government.
    if (Monotonic.isBoundary(entry.promise, 0)) {
        var map = government.body.map
        if (map == null || this._seeking[0].promise == null) {
            // Flush.
        } else {
            // Remap.
        }
    // If this entry does pertains to us, look closer.
    } else if (this.id == entry.body.id) {
        // Get the next queued message to resolve, if any.
        var next = this._seeking.length ? this._seeking[0] : { cookie: null }

        // Shift a message from our list of awaiting messages if we see it.
        if (next.cookie == entry.body.cookie) {
            this._seeking.shift()
            // If we've consumed all the messages, maybe sent out another batch.
            if (this._seeking.length == 0) {
                this._nudge()
            }
        } else {
            // If promise is terminator then we retry.
        }
    }
}

// TODO Ensure that `_retry` is not called when we're waiting on a send.

//
Islander.prototype._retry = function () {
    Array.prototype.unshift.apply(this._pending, this._seeking.messages.splice(0, this._seeking.messages.length))
    this._nudge()
}

Islander.prototype.enqueue = cadence(function (async, entry) {
    this.push(entry)
})

Islander.prototype.health = function () {
    return {
        waiting: this._seeking.length && this._seeking[0].messages.length,
        pending: this._pending.length,
        boundaries: Math.max(this._seeking.length - 1, 0)
    }
}

module.exports = Islander
