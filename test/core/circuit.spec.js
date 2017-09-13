/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const _ = require('lodash')
const series = require('async/series')
const waterfall = require('async/waterfall')
const parallel = require('async/parallel')
const leftPad = require('left-pad')
const bl = require('bl')
const API = require('ipfs-api')
const multiaddr = require('multiaddr')
const isNode = require('detect-node')
const crypto = require('crypto')

// This gets replaced by '../utils/create-repo-browser.js' in the browser
const createTempRepo = require('../utils/create-repo-nodejs.js')

const IPFS = require('../../src/core')

describe('circuit', () => {
  let inProcNode1 // Node spawned inside this process
  let inProcNode2 // Node spawned inside this process

  beforeEach((done) => {
    const repo1 = createTempRepo()
    const repo2 = createTempRepo()

    if (!isNode) {
      inProcNode1 = new IPFS({
        repo: repo1,
        config: {
          Addresses: {
            Swarm: []
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
      inProcNode2 = new IPFS({
        repo: repo2,
        config: {
          Addresses: {
            Swarm: []
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
    } else {
      inProcNode1 = new IPFS({
        repo: repo1,
        config: {
          Addresses: {
            Swarm: ['/ip4/127.0.0.1/tcp/0']
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

      inProcNode2 = new IPFS({
        repo: repo2,
        config: {
          Addresses: {
            Swarm: ['/ip4/127.0.0.1/tcp/0']
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

    parallel([
      (cb) => inProcNode1.on('start', cb),
      (cb) => inProcNode2.on('start', cb)
    ], done)
  })

  afterEach((done) => inProcNode1.stop(() => done()))

  describe('connections', () => {
    function wire (targetNode, dialerNode, done) {
      targetNode.id((err, identity) => {
        expect(err).to.not.exist()
        const addr = identity.addresses
          .map((addr) => multiaddr(addr.toString().split('ipfs')[0]))
          .filter((addr) => _.includes(addr.protoNames(), 'ws'))[0]

        if (!addr) {
          // Note: the browser doesn't have a websockets listening addr
          return done()
        }

        const targetAddr = addr
          .encapsulate(multiaddr(`/ipfs/${identity.id}`)).toString()
          .replace('0.0.0.0', '127.0.0.1')

        dialerNode.swarm.connect(targetAddr, done)
      })
    }

    function connectNodes (remoteNode, ipn, done) {
      series([
        (cb) => wire(remoteNode, ipn, cb),
        (cb) => setTimeout(() => {
          // need timeout so we wait for identify to happen.
          // This call is just to ensure identify happened
          wire(ipn, remoteNode, cb)
        }, 300)
      ], done)
    }

    function addNode (num, done) {
      num = leftPad(num, 3, 0)

      const apiUrl = `/ip4/127.0.0.1/tcp/31${num}`
      const remoteNode = new API(apiUrl)
      done(null, remoteNode)
    }

    it('fetch data over circuit', (done) => {
      let remoteNode
      const data = crypto.randomBytes(128)
      waterfall([
        (cb) => addNode(13, cb),
        (node, cb) => {
          remoteNode = node
          cb()
        },
        (cb) => connectNodes(remoteNode, inProcNode1, cb),
        (res, cb) => connectNodes(remoteNode, inProcNode2, cb),
        (res, cb) => inProcNode1.swarm.connect(inProcNode2._peerInfo, cb),
        (conn, cb) => inProcNode1.files.add(data, cb),
        (res, cb) => inProcNode2.files.cat(res[0].hash, cb),
        (stream, cb) => stream.pipe(bl(cb)),
        (res, cb) => {
          expect(res).to.be.eql(data)
          cb()
        }], done)
    })
  })
})
