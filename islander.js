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
    // TODO What is the structure, how are objects grouped? It appears that
    // `_seeking` are sent batches, generally zero or one outstanding messages
    // followed by zero or more flush messages. Confirm and document.
    //
    // Our structure somelinke like the one in `Sequester`, but not really.
    this._seeking = []
    // Pending appears to be the next first entry into `_seeking`, one that we
    // biuld while we are waiting for all of the seeking entries to arrive.
    this._pending = []
    // Be cool with is. You need to track the sending message outside of the
    // seeking array because you like to obliterate the seeking array when you
    // you're ready to retry. You won't be able to get the sending state out of
    // seeking. You don't want to manage an ever growing seeking queue.
    //
    // Working on being not cool with this and getting all state into a queue.
    this._sending = null
    this.log = new Procession
    this.log.push({ promise: '0/0' })
    // Only pull one message from the outbox at a time.
    this.outbox = new Procession
}

Islander.prototype.publish = function (body) {
    var cookie = this._nextCookie()
    this._pending.push({ id: this.id, cookie: cookie, body: body })
    this._nudge()
    return cookie
}

Islander.prototype._nudge = function () {
    if (this._seeking.length == 0 && this._pending.length != 0 && this._sending == null) {
        this._send()
    }
}

Islander.prototype._nextCookie = function () {
    return this._cookie = Monotonic.increment(this._cookie, 0)
}

Islander.prototype._send = function () {
    this._sending = { completed: false, lost: false, messages: this._pending.slice() }
    this._seeking.push(this._sending)
    this._pending = []
    this.outbox.push(JSON.parse(JSON.stringify(this._sending.messages)))
}

// TODO Ensure that `_retry` is not called when we're waiting on a send. Come
// back and read through the code, add assertions.

//
Islander.prototype._flush = function () {
    this._sending = {
        completed: false,
        lost: false,
        messages: [{ id: this.id, cookie: this._nextCookie(), body: null }]
    }
    this._seeking.push(this._sending)
    this.outbox.push(this._sending.messages)
}

// TODO Need to timeout flushes, make sure we're not hammering a broken
// government.

// Called from the envelope with receipts from a submission to the consensus
// algorithm. Using the `receipts` we assign a promise to each of messages we
// sent based on their cookie. If `receipts` is `null`, than the submission
// failed for whatever reason. We also mark the submission completed.

//
Islander.prototype.sent = function (receipts) {
    if (!(this._sending.failed = receipts == null)) {
        this._sending.messages.forEach(function (message) {
            message.promise = receipts[message.cookie]
        })
    }
    this._sending.completed = true
    this._sending = null
    this._remapIf()
    this._nudge()
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
        this._governments.push(entry)
    }

    // If this entry does pertains to us, look closer.
    if (this.id == entry.body.id) {
        // Get the next queued message to resolve, if any.
        var next = this._seeking.length ? this._seeking[0].messages[0] : { cookie: null }

        // Shift a message from our list of awaiting messages if we see it.
        if (next.cookie == entry.body.cookie) {
            this._seeking[0].messages.shift()
            // If we've consumed all the messages, maybe sent out another batch.
            if (this._seeking[0].messages.length == 0) {
                this._complete()
            }
        } else {
            // If we see any boundary markers, then our sent messages are lost.
            for (var i = 1, I = this._seeking.length; i < I; i++) {
                if (entry.body.cookie == this._seeking[i].messages[0].cookie) {
                    this._retry()
                    break
                }
            }
        }
    }

    // Remap promises if we're not waiting on a send.
    this._remapIf()
}

Islander.prototype._complete = function () {
    this._seeking.length = 0
    this._nudge()
}

// If we have governments queued and we're scanning the atomic log for messages,
// then we need to possibly map promises if they've been reassigned to the new
// promises of a new government.

//
Islander.prototype._remapIf = function () {
    // No oustanding messages means governments don't matter.
    if (this._seeking.length == 0) {
        this._governments.length = 0
    } else if (this._seeking[this._seeking.length - 1].failed) {
        this._flush()
        this._governments.length = 0
    }
    // No governments means nothing to do.
    if (this._governments.length == 0) {
        return
    }
    // If we are not waiting on a post, work through the government changes.
    if (this._seeking.reduce(function (completed, sent) {
       return completed && sent.completed
    }, true)) {
        this._remap()
    }
}

// For each accumulated government, look for

//
Islander.prototype._remap = function () {
    var last = this._seeking[this._seeking.length - 1]
    while (this._governments.length) {
        var government = this._governments.shift()
        var map = government.body.map
        // TODO Assert invariant, all message promises are always in same government.
        for (var i = 0, I = this._seeking.length; i < I; i++) {
            var seeking = this._seeking[i]
            if (!seeking.completed) {
                assert(i == I, 'should be at end')
                break
            }
            if (seeking.failed) {
                continue
            }
            if (Monotonic.compare(government.promise, seeking.messages[0].promise) < 0) {
                continue
            }
            if (map == null) {
                seeking.lost = true
            } else {
                seeking.messages.forEach(function (message) {
                    message.promise = map[message.promise]
                })
                assert(seeking.messages.reduce(function (remapped, message) {
                    return remapped && message.promise != null
                }, true), 'remap did not remap all posted entries')
            }
        }
        if (this._seeking.length == 1 && this._seeking[0].lost) {
            this._retry()
            this._governments.length = 0
        } else if (last.lost) {
            this._flush()
            this._governments.length = 0
        }
    }
}

// TODO Ensure that `_retry` is not called when we're waiting on a send.

//
Islander.prototype._retry = function () {
    Array.prototype.unshift.apply(this._pending, this._seeking[0].messages)
    this._seeking.length = 0
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
