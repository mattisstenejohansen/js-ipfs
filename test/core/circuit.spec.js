/* eslint max-nested-callbacks: ["error", 8] */
/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
const waterfall = require('async/waterfall')
const parallel = require('async/parallel')
const isNode = require('detect-node')

const IPFS = require('../../src/core')
const createTempRepo = require('../utils/create-repo-node.js')

chai.use(dirtyChai)

describe('circuit', () => {
  if (!isNode) {
    return
  }

  describe('transfer over circuit', function () {
    this.timeout(50000)

    let ipfsRelay
    let ipfsDst
    let ipfsSrc

    before((done) => {
      ipfsRelay = new IPFS({
        repo: createTempRepo(),
        config: {
          Addresses: {
            Swarm: [
              '/ip4/0.0.0.0/tcp/9000',
              '/ip4/0.0.0.0/tcp/9001/ws'
            ]
          },
          Bootstrap: [],
          Experimental: {
            Relay: {
              Circuit: {
                Enabled: true,
                Active: false
              }
            }
          },
          Identity: {
            PeerID: 'QmUGuDXBhWKJwoNNMhnsLGSzzDfjdSt81SoTHcMu1dXBrV',
            PrivKey: 'CAASpgkwggSiAgEAAoIBAQC3ty1UbNy/0jjuJY24/1FvwnGLF6CML++iBQ6LTQdDv6u7mOFX9kzkHxI8JxQrOTLByWkXkJQ+zGKJDaLFpzmwZdWPglpWHS5LeiH7pggUPxPhZ7DkS4p9nWJbQh6h8gZ39zdpEBXWjbsqCYmgjGL0EG5pzN+dLgKnBBBTiEqv8hK9aN5uRvsFxUyhN6J9LJzgh2aGblUG/0rir2Nge1xeFj9sLeHpgPI6wCyqys+nRFJXvGNZ8Auu2K6cjHVkkPK3BPtf7CxziJCaJYE5GXQ3AT5Wl/AJ55I1mA9M/UM9qFL4ih4iNVWGbktOz/lDmrI12CRaCdemTPWIy+7mZj33AgMBAAECggEASiMaoNo5jxM3tCrlcUVfSLlv9pB3Uns5uelOgDp6dwWPOOot7cBQMTK0uh+PDQ5NBFTSGxdWK61xChu9lwOvzRabQwl4iQ3Hk9/afOH4mqsFy817XfV6Es0DVw5srC+uGpVh//zkwyt43zLwHiDpAdLrq7hoeNaLbXi/WeZDNZLMfleIo/TO6RCh7waai4reAgGgJnF46yhoIjrpturqjyVo9sS17hx/3WXlffOqfepx9grKK8u/8GzdlgtwwtygMf6pw/9VUHY9T2kXtls0w1VoNhNK52MGCN8uX4yJlofQXNB4/F9XuuqugCcpYUUnvHOVWFcRyS+ZceynKL3/kQKBgQDhywvRnW1rvYOnrr4UvQegi3T3Na6JWOFYv/7KdJNHTKUr0FSPaD+DVN62zxYVU9jw6fRVVHsyDO/Fbw+cb8ezd+r94l32er4hK6FrPpuwr2Af/HifoLB6rKT1lvJJKT4itnPFNxLzVYON5oMZp+u3UeTcb8ob6UZKtgAgrDBHPwKBgQDQSw8DHyUXi43rsKNCF6K4Wk14U5u+qhs+DColdpd79BVXNdjU35Ifq5nwGGzo2cjUd8EGdK1pURh3oCTXWK/bRyCdC3qWRJFsgIugC8BDLlKNc45IZjcWfZVg/FGR4usdLF4YcXnoIIjsDkDCSzD6laDjk1wQkbIgxo9a1NfTSQKBgH6Q0o8tL6i1Epdr3CDD1QKpKWdpL+zNZYPaG3hg4C2XSP7GSKAaT3/OkwjmC/rohTKF8e/i6yujFMQW/Skzfz2aep7VxNXk966gRltXPO5NYBSN8Q+Jg2NAYzdG5YkdFTdgDoT92iGMTbG9BL/c4MRho2ftQd1jZYN7gZbO7kEBAoGARh5eaWCcrfZuyj7mVqN6RbEwjycmMOM21IZn0cDAchvS607XNaIloL+1zJuMXj6iWtQNiMzSa7e/EtY4UL4sRRcGpZdtpxRiGDKVzkTmbjcz1yZlaX3vYYTZOpL2KrRHDcUX0AazUS9SqJSLvFxvmouwY6wBvBov6tStAZjRJvECgYA5XjWN7tHRwEr+NoAGsSmtsqGCrHrCPdj8SOyKTXRARQKRdvJ0KBJkMmzLdmLVErYjuy9OmwdigWcTZjZ2HhrhXNR95Xepg3I5ylzuouMPZepAacjtGl4oi91rdv6z9hD4/cSB+wIfXG9o0ghgJ/vexzvxFzDnvY+8MqEa2PP6NA=='
          }
        }
      })

      ipfsDst = new IPFS({
        repo: createTempRepo(),
        config: {
          Addresses: {
            Swarm: [
              '/ip4/0.0.0.0/tcp/9002'
            ]
          },
          Bootstrap: []
        }
      })

      ipfsSrc = new IPFS({
        repo: createTempRepo(),
        config: {
          Addresses: {
            Swarm: [
              '/ip4/0.0.0.0/tcp/9003/ws'
            ]
          },
          Bootstrap: []
        }
      })

      parallel([
        (pCb) => ipfsRelay.once('start', pCb),
        (pCb) => ipfsSrc.once('start', pCb),
        (pCb) => ipfsDst.once('start', pCb)
      ], () => {
        waterfall([
          (cb) => ipfsSrc
            .swarm
            .connect(`/ip4/0.0.0.0/tcp/9001/ws/ipfs/QmUGuDXBhWKJwoNNMhnsLGSzzDfjdSt81SoTHcMu1dXBrV`, () => cb()),
          (cb) => setTimeout(cb, 1000),
          (cb) => ipfsDst
            .swarm
            .connect(`/ip4/0.0.0.0/tcp/9000/ipfs/QmUGuDXBhWKJwoNNMhnsLGSzzDfjdSt81SoTHcMu1dXBrV`, () => cb()),
          (cb) => setTimeout(cb, 1000),
          (cb) => ipfsSrc.id(cb),
          (id, cb) => ipfsRelay.swarm.connect(`/ip4/0.0.0.0/tcp/9002/ipfs/${id.id}`, () => cb()),
          (cb) => setTimeout(cb, 1000),
          (cb) => ipfsDst.id(cb),
          (id, cb) => ipfsRelay.swarm.connect(`/ip4/0.0.0.0/tcp/9003/ws/ipfs/${id.id}`, () => cb())
        ], done)
      })
    })

    after((done) => {
      waterfall([
        (cb) => ipfsRelay.stop(() => cb()),
        (cb) => ipfsSrc.stop(() => cb()),
        (cb) => ipfsDst.stop(() => cb())
      ], done)
    })

    it('should be able to connect over circuit', (done) => {
      ipfsSrc.swarm.connect(ipfsDst._peerInfo, (err, conn) => {
        expect(err).to.be.null()
        expect(conn).to.not.be.null()
        done()
      })
    })

    it('should be able to transfer data over circuit', (done) => {
      waterfall([
        // dial destination over WS /ip4/0.0.0.0/tcp/9002/ws
        (cb) => ipfsSrc.swarm.connect(ipfsDst._peerInfo, cb),
        (conn, cb) => ipfsDst.files.add(new ipfsDst.types.Buffer('Hello world over circuit!'),
          (err, res) => {
            expect(err).to.be.null()
            expect(res[0]).to.not.be.null()
            cb(null, res[0].hash)
          }),
        (fileHash, cb) => ipfsSrc.files.cat(fileHash, function (err, stream) {
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
})
