/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
const parallel = require('async/parallel')
const series = require('async/series')
const waterfall = require('async/waterfall')
const API = require('ipfs-api')
const IPFS = require('../../src')
const bl = require('bl')
const PeerInfo = require('peer-info')
const PeerId = require('peer-id')
const multiaddr = require('multiaddr')
const isNode = require('detect-node')

const crypto = require('crypto')

const createTempRepo = require('../utils/create-repo-nodejs.js')

chai.use(dirtyChai)

function addAndCat (data, ipfsSrc, ipfsDst, callback) {
  waterfall([
    (cb) => ipfsDst.files.add(data, cb),
    (res, cb) => ipfsSrc.files.cat(res[0].hash, cb),
    (stream, cb) => stream.pipe(bl(cb))
  ], callback)
}

function peerInfoFromObj (obj, callback) {
  PeerInfo.create(PeerId.createFromB58String(obj.id), (err, peer) => {
    if (err) {
      return callback(err)
    }

    expect(err).to.not.exist()
    obj.addresses.forEach((a) => peer.multiaddrs.add(multiaddr(a)))
    callback(null, peer)
  })
}

function createJsNode (addr) {
  return new IPFS({
    repo: createTempRepo(),
    config: {
      Addresses: {
        Swarm: addr
      },
      Discovery: {
        MDNS: {
          Enabled: false
        }
      },
      Bootstrap: [],
      EXPERIMENTAL: {
        Relay: {
          Enabled: true,
          HOP: {
            Enabled: true,
            Active: false
          }
        }
      }
    }
  })
}

describe('circuit', function () {
  let jsRelay = new API(`/ip4/127.0.0.1/tcp/31007`)
  let goRelay = new API(`/ip4/127.0.0.1/tcp/33027`)
  let node1
  let node2

  let jsRelayId
  let goRelayId

  let nodeId1
  let nodeId2

  before(function (done) {
    this.timeout(20 * 1000)

    node1 = createJsNode([isNode ? `/ip4/127.0.0.1/tcp/0/ws` : ''])
    node2 = createJsNode([isNode ? `/ip4/127.0.0.1/tcp/0` : ''])

    node1.on('error', (err) => {
      expect(err).to.not.exist()
    })

    node2.on('error', (err) => {
      expect(err).to.not.exist()
    })

    parallel([
      (cb) => node1.on('start', cb),
      (cb) => node2.on('start', cb)
    ], (err) => {
      expect(err).to.not.exist()
      parallel([
        (cb) => jsRelay.id(cb),
        (cb) => goRelay.id(cb),
        (cb) => node1.id(cb),
        (cb) => node2.id(cb)
      ], (err, res) => {
        expect(err).to.not.exist()
        parallel([
          (cb) => peerInfoFromObj(res[0], cb),
          (cb) => peerInfoFromObj(res[1], cb),
          (cb) => peerInfoFromObj(res[2], cb),
          (cb) => peerInfoFromObj(res[3], cb)
        ], (err, res1) => {
          expect(err).to.not.exist()
          jsRelayId = res1[0]
          goRelayId = res1[1]
          nodeId1 = res1[2]
          nodeId2 = res1[3]
          done()
        })
      })
    })
  })

  after(function (done) {
    parallel([
      (cb) => node1.stop(cb),
      (cb) => node2.stop(cb)
    ], done)
  })

  it('node1 <-> jsRelay <-> node2', function (done) {
    const data = crypto.randomBytes(128)
    series([
      (cb) => node1.swarm.connect(jsRelayId, cb),
      (cb) => node2.swarm.connect(jsRelayId, cb),
      (cb) => setTimeout(cb, 1000),
      (cb) => node1.swarm.connect(nodeId2, cb)
    ], (err) => {
      expect(err).to.not.exist()
      addAndCat(data,
        node1,
        node2,
        (err, data) => {
          expect(err).to.not.exist()
          expect(data).to.be.equal(data)
          done()
        })
    })
  })

  it('node1 <-> goRelay <-> node2', function (done) {
    const data = crypto.randomBytes(128)
    series([
      (cb) => node1.swarm.connect(goRelayId, cb),
      (cb) => node2.swarm.connect(goRelayId, cb),
      (cb) => setTimeout(cb, 1000),
      (cb) => node1.swarm.connect(nodeId2, cb)
    ], (err) => {
      expect(err).to.not.exist()
      addAndCat(data,
        node1,
        node2,
        (err, data) => {
          expect(err).to.not.exist()
          expect(data).to.be.equal(data)
          done()
        })
    })
  })
})
