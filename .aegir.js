'use strict'

const parallel = require('async/parallel')
const series = require('async/series')
const createTempRepo = require('./test/utils/create-repo-nodejs.js')
const HTTPAPI = require('./src/http')
const leftPad = require('left-pad')
const GoDaemon = require('./test/interop/daemons/go')

let nodes = []

/*
 * spawns a daemon with ports numbers starting in 10 and ending in `num`
 */
function spawnDaemon (num, callback) {
  num = leftPad(num, 3, 0)

  const config = {
    Addresses: {
      Swarm: [
        `/ip4/127.0.0.1/tcp/10${num}`,
        `/ip4/127.0.0.1/tcp/20${num}/ws`
      ],
      API: `/ip4/127.0.0.1/tcp/31${num}`,
      Gateway: `/ip4/127.0.0.1/tcp/32${num}`
    },
    Bootstrap: [],
    Discovery: {
      MDNS: {
        Enabled: false
      },
      webRTCStar: {
        Enabled: false
      }
    },
    API: {
      HTTPHeaders: {
        'Access-Control-Allow-Headers': [
          'X-Requested-With',
          'Range'
        ],
        'Access-Control-Allow-Methods': [
          'GET'
        ],
        'Access-Control-Allow-Origin': [
          '*'
        ]
      }
    },
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

  const daemon = new HTTPAPI(createTempRepo(), config)
  nodes.push(daemon)
  daemon.start(true, callback)
}

function spawnGoNode (num, cb) {
  num = leftPad(num, 3, 0)

  const daemon = new GoDaemon({
    disposable: true,
    init: true,
    config: {
      Addresses: {
        Swarm: [
          `/ip4/127.0.0.1/tcp/10${num}`,
          `/ip4/127.0.0.1/tcp/20${num}/ws`
        ],
        API: `/ip4/127.0.0.1/tcp/33${num}`,
        Gateway: `/ip4/0.0.0.0/tcp/44${num}`
      },
      API: {
        HTTPHeaders: {
          'Access-Control-Allow-Headers': [
            'X-Requested-With',
            'Range'
          ],
          'Access-Control-Allow-Methods': [
            'GET'
          ],
          'Access-Control-Allow-Origin': [
            '*'
          ]
        }
      },
      Swarm: {
        AddrFilters: null,
        DisableBandwidthMetrics: false,
        DisableNatPortMap: false,
        DisableRelay: false,
        EnableRelayHop: true
      }
    }
  })

  daemon.start((err) => {
    if (err) throw err
    nodes.push(daemon)
    cb()
  })
}

let before = (done) => {
  nodes = []
  parallel([
    (cb) => spawnDaemon(7, cb),
    (cb) => spawnDaemon(8, cb),
    (cb) => spawnDaemon(12, cb),
    (cb) => spawnDaemon(13, cb),
    (cb) => spawnGoNode(27, cb),
    (cb) => spawnGoNode(28, cb),
    (cb) => spawnGoNode(31, cb),
    (cb) => spawnGoNode(32, cb)
  ], done)
}

let after = (done) => {
  series(nodes.map((node) => (cb) => {
    setTimeout(() => node.stop(cb), 100)
  }), done)
}

module.exports = {
  karma: {
    files: [{
      pattern: 'node_modules/interface-ipfs-core/test/fixtures/**/*',
      watched: false,
      served: true,
      included: false,
      singleRun: false
    }]
  },
  hooks: {
    pre: before,
    post: after
  }
}
