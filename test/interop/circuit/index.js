/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
const parallel = require('async/parallel')
const series = require('async/series')
const Factory = require('../../utils/ipfs-factory-daemon')

const crypto = require('crypto')
const utils = require('./utils')

const multiaddr = require('multiaddr')

chai.use(dirtyChai)

describe('circuit interop', function () {
  this.timeout(20 * 1000)

  let jsTCP
  let jsTCPAddrs
  let jsWS
  let jsWSAddrs
  let jsRelayAddrs
  let factory = new Factory()

  let goRelayAddrs
  let goRelayDaemon

  let goTCPAddrs
  let goTCPDaemon
  let goTCP

  let goWSAddrs
  let goWSDaemon
  let goWS

  beforeEach((done) => {
    parallel([
      (pCb) => utils.setupJsNode([
        '/ip4/127.0.0.1/tcp/61454/ws',
        '/ip4/127.0.0.1/tcp/61453'
      ], factory, true, pCb),
      (pCb) => utils.setupJsNode([
        '/ip4/127.0.0.1/tcp/9002'
      ], factory, pCb),
      (pCb) => utils.setupJsNode([
        '/ip4/127.0.0.1/tcp/9003/ws'
      ], factory, pCb),
      (pCb) => utils.setupGoNode([
        '/ip4/0.0.0.0/tcp/0/ws',
        '/ip4/0.0.0.0/tcp/0'
      ], true, pCb),
      (pCb) => utils.setupGoNode([
        '/ip4/0.0.0.0/tcp/0'
      ], pCb),
      (pCb) => utils.setupGoNode([
        '/ip4/0.0.0.0/tcp/0/ws'
      ], pCb)
    ], (err, res) => {
      expect(err).to.not.exist()

      jsRelayAddrs = res[0][1].map((a) => a.toString()).filter((a) => !a.includes('/p2p-circuit'))
      jsTCP = res[1][0]
      jsTCPAddrs = res[1][1].map((a) => a.toString()).filter((a) => a.includes('/p2p-circuit'))
      jsWS = res[2][0]
      jsWSAddrs = res[2][1].map((a) => a.toString()).filter((a) => a.includes('/p2p-circuit'))

      goRelayDaemon = res[3][0]
      goRelayAddrs = res[3][1]
      goTCP = res[4][0].api
      goTCPDaemon = res[4][0]
      goTCPAddrs = res[4][1]
      goWS = res[5][0].api
      goWSDaemon = res[5][0]
      goWSAddrs = res[5][1]
      done()
    })
  })

  afterEach((done) => {
    parallel([
      (cb) => factory.dismantle(cb),
      (cb) => goRelayDaemon.stop(cb),
      (cb) => goTCPDaemon.stop(cb),
      (cb) => goWSDaemon.stop(cb)
    ], done)
  })

  it('jsWS <-> jsRelay <-> jsTCP', function (done) {
    const data = crypto.randomBytes(128)
    series([
      (cb) => jsWS.swarm.connect(jsRelayAddrs[0], cb),
      (cb) => jsTCP.swarm.connect(jsRelayAddrs[1], cb),
      (cb) => setTimeout(cb, 1000),
      (cb) => jsTCP.swarm.connect(jsWSAddrs[0], cb)
    ], (err) => {
      expect(err).to.not.exist()
      utils.addAndCat(data,
        jsWS,
        jsTCP,
        (err, data) => {
          expect(err).to.not.exist()
          expect(data).to.be.equal(data)
          done()
        })
    })
  })

  it('goWS <-> jsRelay <-> goTCP', function (done) {
    const data = crypto.randomBytes(128)
    series([
      (cb) => goWS.swarm.connect(jsRelayAddrs[0], cb),
      (cb) => goTCP.swarm.connect(jsRelayAddrs[1], cb),
      (cb) => setTimeout(cb, 1000),
      (cb) => goTCP.swarm.connect(`/p2p-circuit/ipfs/${multiaddr(goWSAddrs[0]).getPeerId()}`, cb)
    ], (err) => {
      expect(err).to.not.exist()
      utils.addAndCat(data,
        goWS,
        goTCP,
        (err, data) => {
          expect(err).to.not.exist()
          expect(data).to.be.equal(data)
          done()
        })
    })
  })

  it('jsWS <-> jsRelay <-> goTCP', function (done) {
    const data = crypto.randomBytes(128)
    series([
      (cb) => jsWS.swarm.connect(jsRelayAddrs[0], cb),
      (cb) => goTCP.swarm.connect(jsRelayAddrs[1], cb),
      (cb) => setTimeout(cb, 1000),
      (cb) => goTCP.swarm.connect(jsWSAddrs[0], cb)
    ], (err) => {
      expect(err).to.not.exist()
      utils.addAndCat(data,
        jsWS,
        goTCP,
        (err, data) => {
          expect(err).to.not.exist()
          expect(data).to.be.equal(data)
          done()
        })
    })
  })

  it('jsTCP <-> goRelay <-> jsWS', function (done) {
    const data = crypto.randomBytes(128)
    series([
      (cb) => jsTCP.swarm.connect(goRelayAddrs[2], cb),
      (cb) => jsWS.swarm.connect(goRelayAddrs[0], cb),
      (cb) => setTimeout(cb, 1000),
      (cb) => jsWS.swarm.connect(jsTCPAddrs[0], cb)
    ], (err) => {
      expect(err).to.not.exist()
      utils.addAndCat(data,
        jsWS,
        jsTCP,
        (err, data) => {
          expect(err).to.not.exist()
          expect(data).to.be.equal(data)
          done()
        })
    })
  })

  it('goTCP <-> goRelay <-> goWS', function (done) {
    const data = crypto.randomBytes(128)
    series([
      (cb) => goWS.swarm.connect(goRelayAddrs[0], cb),
      (cb) => goTCP.swarm.connect(goRelayAddrs[2], cb),
      (cb) => setTimeout(cb, 1000),
      (cb) => goWS.swarm.connect(`/p2p-circuit/ipfs/${multiaddr(goTCPAddrs[0]).getPeerId()}`, cb)
    ], (err) => {
      expect(err).to.not.exist()
      utils.addAndCat(data,
        goWS,
        goTCP,
        (err, data) => {
          expect(err).to.not.exist()
          expect(data).to.be.equal(data)
          done()
        })
    })
  })

  it('jsWS <-> goRelay <-> goTCP', function (done) {
    const data = crypto.randomBytes(128)
    series([
      (cb) => jsWS.swarm.connect(goRelayAddrs[0], cb),
      (cb) => goTCP.swarm.connect(goRelayAddrs[2], cb),
      (cb) => setTimeout(cb, 1000),
      (cb) => goTCP.swarm.connect(`/p2p-circuit/ipfs/${multiaddr(jsWSAddrs[0]).getPeerId()}`, cb)
    ], (err) => {
      expect(err).to.not.exist()
      utils.addAndCat(data,
        jsWS,
        goTCP,
        (err, data) => {
          expect(err).to.not.exist()
          expect(data).to.be.equal(data)
          done()
        })
    })
  })
})
