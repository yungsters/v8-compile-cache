'use strict';

const fs = require('fs');
const path = require('path');
const mkdirpSync = require('./mkdirpSync');

module.exports = class FileSystemBlobStore {
  constructor(directory) {
    this._blobFilename = path.join(directory, 'BLOB');
    this._blobMapFilename = path.join(directory, 'MAP');
    this._invalidationKeysFilename = path.join(directory, 'INVKEYS');
    this._lockFilename = path.join(directory, 'LOCK');
    mkdirpSync(directory);
    this._reset();
    this._load();
  }

  has(key, invalidationKey) {
    const containsKey = this._inMemoryBlobs[key] || this._storedBlobMap[key];
    const isValid = this._invalidationKeys[key] === invalidationKey;
    return containsKey && isValid;
  }

  get(key, invalidationKey) {
    if (this.has(key, invalidationKey)) {
      return this._getFromMemory(key) || this._getFromStorage(key);
    }
  }

  set(key, invalidationKey, buffer) {
    this._invalidationKeys[key] = invalidationKey;
    this._inMemoryBlobs[key] = buffer;
  }

  delete(key) {
    delete this._inMemoryBlobs[key];
    delete this._invalidationKeys[key];
    delete this._storedBlobMap[key];
  }

  save() {
    const dump = this._getDump();
    const blobToStore = Buffer.concat(dump[0]);
    const mapToStore = JSON.stringify(dump[1]);
    const invalidationKeysToStore = JSON.stringify(this._invalidationKeys);

    let acquiredLock = false;
    try {
      fs.writeFileSync(this._lockFilename, 'LOCK', {flag: 'wx'});
      acquiredLock = true;

      fs.writeFileSync(this._blobFilename, blobToStore);
      fs.writeFileSync(this._blobMapFilename, mapToStore);
      fs.writeFileSync(this._invalidationKeysFilename, invalidationKeysToStore);
    } catch (error) {
      // Swallow the exception silently only if we fail to acquire the lock.
      if (error.code !== 'EEXIST') {
        throw error;
      }
    } finally {
      if (acquiredLock) {
        fs.unlinkSync(this._lockFilename);
      }
    }
  }

  _reset() {
    this._inMemoryBlobs = Object.create(null);
    this._invalidationKeys = Object.create(null);
    this._storedBlob = new Buffer(0);
    this._storedBlobMap = Object.create(null);
  }

  _load() {
    if (!fs.existsSync(this._blobMapFilename)) {
      return;
    }
    if (!fs.existsSync(this._blobFilename)) {
      return;
    }
    if (!fs.existsSync(this._invalidationKeysFilename)) {
      return;
    }

    try {
      this._storedBlob =
        fs.readFileSync(this._blobFilename);
      this._storedBlobMap =
        JSON.parse(fs.readFileSync(this._blobMapFilename));
      this._invalidationKeys =
        JSON.parse(fs.readFileSync(this._invalidationKeysFilename));
    } catch (e) {
      this._reset();
    }
  }

  _getFromMemory(key) {
    return this._inMemoryBlobs[key];
  }

  _getFromStorage(key) {
    const blobMap = this._storedBlobMap[key];
    if (blobMap) {
      return this._storedBlob.slice(blobMap[0], blobMap[1]);
    }
  }

  _getDump() {
    const buffers = [];
    const blobMap = Object.create(null);
    let currentBufferStart = 0;

    function dump(key, getBufferByKey) {
      const buffer = getBufferByKey(key);
      buffers.push(buffer);
      blobMap[key] = [currentBufferStart, currentBufferStart + buffer.length];
      currentBufferStart += buffer.length;
    }

    for (const key of Object.keys(this._inMemoryBlobs)) {
      dump(key, this._getFromMemory.bind(this));
    }

    for (const key of Object.keys(this._storedBlobMap)) {
      if (!blobMap[key]) {
        dump(key, this._getFromStorage.bind(this));
      }
    }

    return [buffers, blobMap];
  }
};