var test = require('tape').test;
var copy = require('../lib/copy').serialtiles;
var util = require('util');
var path = require('path');
var request = require('request');
var AWS = require('aws-sdk');
var url = require('url');
var sinon = require('sinon');
var tilelive = require('tilelive');

var bucket = process.env.TestBucket || 'tilestream-tilesets-development';

var s3url = [
  'http://' + bucket + '.s3.amazonaws.com/_pending/test',
  +new Date() % 10000,
  'mapbox-tile-copy-serialtiles/%s/%s/{z}/{x}/{y}'
].join('-');

test('serialtiles-copy: deflated vector tiles', function(t) {
  var uri = [
    'serialtiles:',
    path.resolve(__dirname, 'fixtures', 'valid.serialtiles.deflate.vector.gz')
  ].join('//');

  var urlTemplate = util.format(s3url, 'test.valid-deflate', '0');

  copy(uri, urlTemplate, function(err) {
    t.ifError(err, 'copied');
    request.head(urlTemplate.replace('{z}/{x}/{y}', '0/0/0'), function (err, res) {
      t.ifError(err, 'found expected file on s3');
      t.equal(res.statusCode, 200, 'expected status code');
      t.equal(res.headers['content-type'], 'application/x-protobuf', 'expected content-type');
      t.equal(res.headers['content-length'], '54263', 'expected content-length');
      t.equal(res.headers['content-encoding'], 'deflate', 'expected content-encoding');
      request.head(urlTemplate.replace('{z}/{x}/{y}', '2/2/3'), function(err, res) {
        t.ifError(err, 'found expected file on s3');
        t.equal(200, res.statusCode, 'expected status code');
        t.equal(res.headers['content-type'], 'application/x-protobuf', 'expected content-type');
        t.equal(res.headers['content-length'], '2065', 'expected content-length');
        t.equal(res.headers['content-encoding'], 'deflate', 'expected content-encoding');
        t.end();
      });
    });
  });
});

test('serialtiles-copy: gzipped vector tiles', function(t) {
  var uri = [
    'serialtiles:',
    path.resolve(__dirname, 'fixtures', 'valid.serialtiles.gzip.vector.gz')
  ].join('//');

  var urlTemplate = util.format(s3url, 'test.valid-gzip', '0');

  sinon.spy(tilelive, 'createWriteStream');

  copy(uri, urlTemplate, function(err) {
    t.ifError(err, 'copied');
    request.head(urlTemplate.replace('{z}/{x}/{y}', '0/0/0'), function (err, res) {
      t.ifError(err, 'found expected file on s3');
      t.equal(res.statusCode, 200, 'expected status code');
      t.equal(res.headers['content-type'], 'application/x-protobuf', 'expected content-type');
      t.equal(res.headers['content-length'], '55556', 'expected content-length');
      t.equal(res.headers['content-encoding'], 'gzip', 'expected content-encoding');
      t.equal(tilelive.createWriteStream.getCall(0).args[1].retry, undefined, 'passes options.retry to tilelive.createWriteStream');
      tilelive.createWriteStream.restore();
      t.end();
    });
  });
});

test('serialtiles-copy: retry', function(t) {
  var uri = [
    'serialtiles:',
    path.resolve(__dirname, 'fixtures', 'valid.serialtiles.gzip.vector.gz')
  ].join('//');

  var urlTemplate = util.format(s3url, 'test.retry', '0');

  sinon.spy(tilelive, 'createWriteStream');

  copy(uri, urlTemplate, {retry:5}, function(err) {
    t.ifError(err, 'copied');
    request.head(urlTemplate.replace('{z}/{x}/{y}', '0/0/0'), function (err, res) {
      t.ifError(err, 'found expected file on s3');
      t.equal(res.statusCode, 200, 'expected status code');
      t.equal(res.headers['content-type'], 'application/x-protobuf', 'expected content-type');
      t.equal(res.headers['content-length'], '55556', 'expected content-length');
      t.equal(res.headers['content-encoding'], 'gzip', 'expected content-encoding');
      t.equal(tilelive.createWriteStream.getCall(0).args[1].retry, 5, 'passes options.retry to tilelive.createWriteStream');
      tilelive.createWriteStream.restore();
      t.end();
    });
  });
});

test('serialtiles-copy: parallel processing', function(t) {
  var uri = [
    'serialtiles:',
    path.resolve(__dirname, 'fixtures', 'valid.serialtiles.deflate.vector.gz')
  ].join('//');

  var urlTemplate = util.format(s3url, 'test.valid-parallel', '0');

  copy(uri, urlTemplate, { job: { num: 0, total: 10 } }, function(err) {
    t.ifError(err, 'copied');
    var s3 = new AWS.S3();
    s3.listObjects({
      Bucket: bucket,
      Prefix: url.parse(urlTemplate).pathname.slice(1).replace('{z}/{x}/{y}', '')
    }, function(err, data) {
      if (err) throw err;
      t.ok(data.Contents.length < 21, 'should not render the entire dataset');
      t.end();
    });
  });
});

test('serialtiles-copy: tiles too big', function(t) {
  var uri = [
    'serialtiles:',
    path.resolve(__dirname, 'fixtures', 'valid.serialtiles.gzip.vector.gz')
  ].join('//');

  var urlTemplate = util.format(s3url, 'test.invalid-tilesize', '0');
  copy(uri, urlTemplate, { limits: { max_tilesize: 10 } }, function(err) {
    t.ok(err, 'expected error');
    t.equal(err.code, 'EINVALID', 'expected error code');
    t.equal(err.message, 'Tile exceeds maximum size of 0k at z 0. Reduce the detail of data at this zoom level or omit it by adjusting your minzoom.', 'expected error message');
    t.end();
  });
});
