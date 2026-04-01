import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (!uri) {
  clientPromise = Promise.reject(new Error('Missing MONGODB_URI'));
} else if (process.env.NODE_ENV === 'development') {
  const g = globalThis as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };
  if (!g._mongoClientPromise) {
    client = new MongoClient(uri, options);
    g._mongoClientPromise = client.connect();
  }
  clientPromise = g._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export async function getMongoDb() {
  const dbName = process.env.MONGODB_DATABASE?.trim();
  if (!dbName) {
    throw new Error('Missing MONGODB_DATABASE');
  }
  const mongoClient = await clientPromise;
  return mongoClient.db(dbName);
}
