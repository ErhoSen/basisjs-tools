var mime = require('mime');
var fs = require('fs');

var READ_LIMIT = 64;
var readingCount = 0;
var filesToRead = [];
var processingPaths = {};

function checkQueue() {
  if (readingCount < READ_LIMIT && filesToRead.length)
    readFile(filesToRead.shift());
}

function readFile(fn) {
  var contentType = mime.lookup(fn);
  var isTextFile = /^(text\/|application\/)/.test(contentType);

  readingCount++;
  fs.readFile(fn, isTextFile ? 'utf8' : null, function(err, content) {
    var callbacks = processingPaths[fn];

    delete processingPaths[fn];
    readingCount--;

    for (var i = 0, callback; callback = callbacks[i]; i++)
      callback(err, content);

    checkQueue();
  });
}

function addFileToQueue(fn, callback) {
  if (processingPaths[fn]) {
    processingPaths[fn].push(callback);
    return;
  }

  processingPaths[fn] = [callback];

  if (readingCount < READ_LIMIT)
    readFile(fn);
  else
    filesToRead.push(fn);
}

module.exports = {
  readFile: addFileToQueue
};