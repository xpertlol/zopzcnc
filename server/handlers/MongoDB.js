// Leaked by Dstat.ST & Elitestress.st :)
const { MongoClient } = require('mongodb');

// Deobfuscated MongoDB class for managing MongoDB connections and operations
class MongoDB {
  /**
   * @param {string} uri - MongoDB connection URI
   * @param {string} dbName - Database name
   */
  constructor(uri, dbName) {
    this._uri = uri;
    this._dbName = dbName;
    this.cachedMongoClient = new MongoClient(uri);
    this._connected = false;
  }

  // Connect to the MongoDB database
  async connectToDatabase() {
    if (this._connected) throw new Error('MongoDB client is already connected.');
    console.log('Connecting to MongoDB!');
    await this.cachedMongoClient.connect();
    console.log('Connected to MongoDB!');
    this._connected = true;
  }

  // Reconnect to the MongoDB database
  async reconnectToDatabase() {
    console.log('Reconnecting to MongoDB!');
    await this.disconnectFromDatabase();
    this.cachedMongoClient = new MongoClient(this._uri);
    await this.cachedMongoClient.connect();
    console.log('Reconnected to MongoDB!');
    this._connected = true;
  }

  // Disconnect from the MongoDB database
  async disconnectFromDatabase() {
    if (!this.cachedMongoClient) return;
    await this.cachedMongoClient.close();
    this.cachedMongoClient = null;
    this._connected = false;
  }

  // Get a collection by name
  getCollection(collectionName) {
    if (!this.cachedMongoClient || !this._connected) {
      throw new Error('MongoDB client is not connected. Call connectToDatabase() first.');
    }
    return this.cachedMongoClient.db(this._dbName).collection(collectionName);
  }

  // Find a document by key
  async findDocumentByKey(key, value, collectionName) {
    const collection = this.getCollection(collectionName);
    return await collection.findOne({ [key]: value });
  }

  // Update a document by key
  async updateDocumentByKey(key, value, updateObj, collectionName) {
    const collection = this.getCollection(collectionName);
    return await collection.updateOne({ [key]: value }, { $set: updateObj });
  }

  // Push to an array field in a document by key
  async updateDocumentArrayByKey(key, value, pushObj, collectionName) {
    const collection = this.getCollection(collectionName);
    return await collection.updateOne({ [key]: value }, { $push: pushObj });
  }

  // Update and then retrieve a document by key
  async updateAndRetrieveDocumentByKey(key, value, updateObj, collectionName) {
    await this.updateDocumentByKey(key, value, updateObj, collectionName);
    return await this.findDocumentByKey(key, value, collectionName);
  }

  // Add a new document
  async addDocument(document, collectionName) {
    const collection = this.getCollection(collectionName);
    return await collection.insertOne(document);
  }

  // Check if a document with a key exists
  async hasKey(key, value, collectionName) {
    const doc = await this.findDocumentByKey(key, value, collectionName);
    return !!doc;
  }

  // Count documents in a collection
  async collectionsCount(collectionName) {
    const collection = this.getCollection(collectionName);
    return await collection.countDocuments({});
  }
}

globalThis.MongoDB = MongoDB;