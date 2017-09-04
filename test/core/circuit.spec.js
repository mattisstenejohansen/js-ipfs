/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
const waterfall = require('async/waterfall')
const parallel = require('async/parallel')

const PeerId = require('peer-id')
const IPFS = require('../../src/core')
const createTempRepo = require('../utils/create-repo-nodejs.js')
const Factory = require('../utils/ipfs-factory-daemon')
const relayConfig = require('../utils/ipfs-factory-daemon/default-config.json')

chai.use(dirtyChai)

describe('circuit', function () {
  this.timeout(20 * 1000)

  let ipfsDst
  let ipfsSrc
  let relayPeer
  let relayAddrs
  let factory = new Factory()

  before((done) => {
    ipfsDst = new IPFS({
      repo: createTempRepo(),
      start: false,
      config: {
        Addresses: {
          Swarm: [
            '/ip4/0.0.0.0/tcp/9002'
          ]
        },
        Bootstrap: [],
        EXPERIMENTAL: {
          Relay: {
            Enabled: true
          }
        }
      }
    })

    ipfsSrc = new IPFS({
      repo: createTempRepo(),
      start: false,
      config: {
        Addresses: {
          Swarm: [
            '/ip4/0.0.0.0/tcp/9003/ws'
          ]
        },
        Bootstrap: [],
        EXPERIMENTAL: {
          Relay: {
            Enabled: true
          }
        }
      }
    })

    waterfall([
      (pCb) => {
        PeerId.create({ bits: 1024 }, (err, id) => {
          if (err) {
            return pCb(err)
          }

          const peerId = id.toJSON()
          relayConfig.Identity.PeerID = peerId.id
          relayConfig.Identity.PrivKey = peerId.privKey
          relayConfig.Addresses.Swarm = [
            '/ip4/127.0.0.1/tcp/61452/ws',
            '/ip4/127.0.0.1/tcp/61453'
          ]
          pCb()
        })
      },
      (pCb) => {
        factory.spawnNode(createTempRepo(), Object.assign(relayConfig, {
          EXPERIMENTAL: {
            Relay: {
              Enabled: true,
              HOP: {
                Enabled: true,
                Active: false
              }
            }
          }
        }), (err, node) => {
          expect(err).to.not.exist()
          relayPeer = node
          pCb()
        })
      },
      (pCb) => {
        relayPeer.swarm.localAddrs((err, addrs) => {
          expect(err).to.not.exist()
          relayAddrs = addrs
          pCb()
        })
      },
      (pCb) => ipfsSrc.start(pCb),
      (pCb) => ipfsDst.start(pCb)
    ], (err) => {
      expect(err).to.not.exist()
      let addr = relayAddrs.filter((a) => !a.toString().includes('/p2p-circuit'))
      parallel([
        (cb) => ipfsSrc.swarm.connect(addr[0], cb),
        (cb) => ipfsDst.swarm.connect(addr[1], cb)
      ], (err) => setTimeout(done, 2000, err))
    })
  })

  after((done) => {
    waterfall([
      (cb) => ipfsSrc.stop(() => cb()),
      (cb) => ipfsDst.stop(() => cb()),
      (cb) => factory.dismantle((err) => done(err))
    ], done)
  })

  it('should be able to connect over circuit', (done) => {
    ipfsSrc.swarm.connect(ipfsDst._peerInfo, (err, conn) => {
      expect(err).to.not.exist()
      done()
    })
  })

  it('should be able to transfer data over circuit', (done) => {
    waterfall([
      (cb) => ipfsDst.swarm.connect(ipfsSrc._peerInfo, cb),
      (conn, cb) => ipfsDst.files.add(new ipfsDst.types.Buffer('Hello world over circuit!'),
        (err, res) => {
          expect(err).to.be.null()
          expect(res[0]).to.not.be.null()
          cb(null, res[0].hash)
        }),
      (hash, cb) => ipfsSrc.files.cat(hash, function (err, stream) {
        expect(err).to.be.null()

        var res = ''

        stream.on('data', function (chunk) {
          res += chunk.toString()
        })

        stream.on('error', function (err) {
          cb(err)
        })

        stream.on('end', function () {
          expect(res).to.be.equal('Hello world over circuit!')
          cb(null, res)
        })
      })
    ], done)
  })
})
