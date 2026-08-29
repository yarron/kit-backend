import "reflect-metadata";

/**
 * Unit tests must not touch the network or a database. Fifteen seconds is not a
 * budget, it is a tripwire: a unit test that needs longer is an e2e test that
 * has wandered into the wrong folder.
 */
process.env.NODE_ENV = "test";
process.env.TZ = "UTC";

jest.setTimeout(15_000);
