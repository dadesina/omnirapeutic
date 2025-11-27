'use strict';

const fs = require('node:fs');
const path = require('node:path');

const fixturePath = path.resolve(__dirname, '..', 'fixtures', 'test-data.json');

let cachedFixture = null;

function loadFixture() {
  if (cachedFixture) {
    return cachedFixture;
  }

  let parsed;
  try {
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load fixture at ${fixturePath}: ${reason}`);
  }

  validateFixture(parsed);
  cachedFixture = freezeFixture(parsed);
  return cachedFixture;
}

function freezeFixture(data) {
  return Object.freeze({
    authorizationIds: Object.freeze([...data.authorizationIds]),
    highContentionAuthIds: Object.freeze([...data.highContentionAuthIds]),
    practitionerTokens: Object.freeze([...data.practitionerTokens]),
  });
}

function validateFixture(data) {
  if (!data || !Array.isArray(data.authorizationIds) || data.authorizationIds.length === 0) {
    throw new Error('Fixture test-data.json must contain a non-empty "authorizationIds" array.');
  }

  if (!Array.isArray(data.highContentionAuthIds)) {
    throw new Error('Fixture test-data.json must contain a "highContentionAuthIds" array.');
  }

  if (!Array.isArray(data.practitionerTokens) || data.practitionerTokens.length === 0) {
    throw new Error('Fixture test-data.json must contain a non-empty "practitionerTokens" array.');
  }
}

function sample(array) {
  if (!array.length) {
    throw new Error('Attempted to sample from an empty array.');
  }
  const index = Math.floor(Math.random() * array.length);
  return array[index];
}

function setAuthorization(userContext, authId, classification) {
  userContext.vars.authorizationId = authId;
  userContext.vars.authorizationClassification = classification;
}

function setRandomAuthorization(userContext, events, done) {
  const fixture = loadFixture();
  setAuthorization(userContext, sample(fixture.authorizationIds), 'random');
  return done();
}

function setHighContentionAuthorization(userContext, events, done) {
  const fixture = loadFixture();
  const pool = fixture.highContentionAuthIds.length ? fixture.highContentionAuthIds : fixture.authorizationIds;
  setAuthorization(userContext, sample(pool), 'high');
  return done();
}

function setMixedAuthorizationContext(userContext, events, done) {
  const fixture = loadFixture();
  const bias = process.env.MIXED_AUTH_BIAS ? Number(process.env.MIXED_AUTH_BIAS) : 0.2;
  const normalizedBias = Number.isFinite(bias) ? Math.min(Math.max(bias, 0), 1) : 0.2;
  const useHighPool = fixture.highContentionAuthIds.length > 0 && Math.random() < normalizedBias;
  const pool = useHighPool ? fixture.highContentionAuthIds : fixture.authorizationIds;
  const classification = useHighPool ? 'high' : 'random';
  setAuthorization(userContext, sample(pool), classification);
  return done();
}

function setRandomPractitionerToken(userContext, events, done) {
  const fixture = loadFixture();
  userContext.vars.practitionerToken = sample(fixture.practitionerTokens);
  return done();
}

module.exports = {
  setRandomAuthorization,
  setHighContentionAuthorization,
  setMixedAuthorizationContext,
  setRandomPractitionerToken,
};
