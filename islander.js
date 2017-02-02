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
    this._sent = []
    this._pending = []
    this.log = new Procession
    this.log.push({ promise: '0/0' })
    this.outbox = new Procession
}

Islander.prototype._trace = function (method, vargs) {
    logger.trace(method, { $vargs: vargs })
}

Islander.prototype.publish = function (value) {
    this._trace('publish', [ value ])
    var cookie = this._nextCookie()
    var request = { cookie: cookie, value: value }
    this._pending.push({ id: this.id, cookie: cookie, value: value })
    this._nudge()
    return cookie
}

Islander.prototype._nudge = function () {
    if (this._sent.length == 0 && this._pending.length != 0) {
        this._send()
    }
}

Islander.prototype._nextCookie = function () {
    return this._cookie = Monotonic.increment(this._cookie, 0)
}

Islander.prototype._send = function () {
    var cookie = this._pending[0].cookie
    var envelope = {
        cookie: cookie,
        messages: this._pending.slice()
    }
    this._sent.push({ cookie: cookie, messages: this._pending })
    this._pending = []
    this.outbox.push(envelope)
}

Islander.prototype._flush = function () {
    var cookie = this._nextCookie()
    var messages = [{ id: this.id, cookie: cookie, value: null }]
    var envelope = { cookie: cookie, messages: messages }
    this._sent.push({ cookie: cookie, messages: messages })
    this.outbox.push(envelope)
}

// TODO Need to timeout flushes, make sure we're not hammering a broken
// government.

// Called from the envelope with receipts from a submission to the consensus
// algorithm. Using the `receipts` we assign a promise to each of messages we
// sent based on their cookie. If `receipts` is `null`, than the submission
// failed for whatever reason. We also mark the submission completed.

//
Islander.prototype.receipts = function (cookie, receipts) {
    this._trace('receipts', [ receipts ])
    var last = this._sent[this._sent.length - 1]
    if (last == null || last.cookie != cookie) {
        return
    }
    if (!(last.failed = receipts == null)) {
        last.messages.forEach(function (message) {
            message.promise = receipts[message.cookie]
        })
    }
    last.completed = true
    this._remapIf()
}

// Possible race condition? I think so. The race is that we have two network
// channels. Our object here does not control those channels. We have an outbox.
// That outbox has a batch of messages to publish to the consensus algorithm. We
// wait for those messages to obtain receipts that will match out cookies with
// promises. We cannot process the atomic log without knowing the promises.
//
// It really ought not matter, since we could simply see our cookies coming
// through the atomic log, so we could process the log while we're waiting.
// However, we have this concept of remapping, where promises that are made by
// one government are mapped to promises made by a new government, instead of
// simply invalidating the promises of the previous government. We remap
// promises on government changes when we can.
//
// Still doesn't quite matter since we're only ever looking for those cookies in
// the atomic log. Remapping shouldn't matter. The only thing that matters is
// that we detect when our messages have not made it into the consensus queue,
// or have been lost to to a consensus collapse.
//
// Thus, we can imagine a way to process the atomic log looking for cookies when
// we might not yet know their promises, shifting those entries, then mapping
// promises to the cookies when they arrive. Upon mapping the promises to the
// cookies we check to see if the promises are never going to be kept, then go
// into our failure state, posting a boundary. Instead of promise based, the
// boundary is cookie based. When we see the boundary we know to repost all of
// our sent messages not yet seen in the atomic log.
//
// This leaves remapping. We need to gather up maps while promises are unknown.
// We need to remap once they are. When we see maps, we can push them somewhere,
// which will remap them if the first message has promise, or else wait. The
// `sent` method can push an empty map, er, yeah, sure.
//
// We won't know if a change in government invalidates a promise until we have
// all the maps, so we're going to trust the reamp method to invalidate.
//
// I suppose remapping tells us not to give up. If we see a government without a
// remap, we're not going to know to give up until we get our promises. We know
// something bad happened, but without the promises, we don't know if it
// happened before or after our submission. Could just do the bounary anyway.
//
// Thus, bounaries need promises, otherwise we'll never know. The promises make
// this definiative. During a health network round trip, we
//
// <hr>

//
Islander.prototype.push = function (entry) {
    this._trace('push', [ entry ])

    // User must provide items in order.
    assert(this._previous == entry.previous || this._previous == null, 'out of order')

    // Make note of the previous promise.
    this._previous = entry.promise

    // Whatever it is, we can forward it. This is not a filter nor a transform.
    this.log.push(entry)

    // Take note of whether or not we're a government.
    var isGovernment = Monotonic.isBoundary(entry.promise, 0)

    // Take note of a new government.
    if (isGovernment) {
        this._governments.push(entry)
    }

    // If this entry does pertains to us, look closer.
    if (this.id == entry.value.id) {
        // Get the next queued message to resolve, if any.
        var next = this._sent.length ? this._sent[0].messages[0] : { cookie: null }

        // Shift a message from our list of awaiting messages if we see it.
        if (next.cookie == entry.value.cookie) {
            this._sent[0].messages.shift()
            // If we've consumed all the messages, maybe sent out another batch.
            if (this._sent[0].messages.length == 0) {
                this._complete()
            }
        } else {
            // If we see any boundary markers, then our sent messages are lost.
            for (var i = 1, I = this._sent.length; i < I; i++) {
                if (entry.value.cookie == this._sent[i].messages[0].cookie) {
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
    this._sent.length = 0
    this._nudge()
}

// If we have governments queued and we're scanning the atomic log for messages,
// then we need to possibly map promises if they've been reassigned to the new
// promises of a new government.
// <hr>

//
Islander.prototype._remapIf = function () {
    // No oustanding messages means governments don't matter.
    if (this._sent.length == 0) {
        this._governments.length = 0
    } else if (this._sent[this._sent.length - 1].failed) {
        this._flush()
        this._governments.length = 0
    }
    // No governments means nothing to do.
    if (this._governments.length == 0) {
        return
    }
    // If we are not waiting on a post, work through the government changes.
    if (this._sent.reduce(function (completed, sent) {
       return completed && sent.completed
    }, true)) {
        this._remap()
    }
}

// For each accumulated government, look for
Islander.prototype._remap = function () {
    var last = this._sent[this._sent.length - 1]
    while (this._governments.length) {
        var government = this._governments.shift()
        var map = government.value.map
        // TODO Assert invariant, all message promises are always in same government.
        for (var i = 0, I = this._sent.length; i < I; i++) {
            var sent = this._sent[i]
            if (sent.failed) {
                continue
            }
            if (sent.messages[0].promise == null) {
                continue
            }
            if (Monotonic.compare(government.promise, sent.messages[0].promise) < 0) {
                continue
            }
            if (map == null) {
                sent.lost = true
            } else {
                sent.messages.forEach(function (message) {
                    message.promise = map[message.promise]
                })
                assert(sent.messages.reduce(function (remapped, message) {
                    return remapped && message.promise != null
                }, true), 'remap did not remap all posted entries')
            }
        }
        if (this._sent.length == 1 && this._sent[0].lost) {
            this._retry()
            this._governments.length = 0
        } else if (last.lost) {
            this._flush()
            this._governments.length = 0
        }
    }
}

Islander.prototype._retry = function () {
    Array.prototype.unshift.apply(this._pending, this._sent[0].messages)
    this._sent.length = 0
    this._nudge()
}

Islander.prototype.enqueue = cadence(function (async, entry) {
    this.push(entry)
})

Islander.prototype.health = function () {
    return {
        waiting: this._sent.length && this._sent[0].messages.length,
        pending: this._pending.length,
        boundaries: Math.max(this._sent.length - 1, 0)
    }
}

module.exports = Islander
