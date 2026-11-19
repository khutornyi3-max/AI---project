import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMapsGroundingPlaces,
  sanitizeLatLng,
} from './mapsGrounding';

test('extractMapsGroundingPlaces deduplicates URIs and collects review snippets', () => {
  const metadata = {
    groundingChunks: [
      {
        maps: {
          title: 'UNIT.City',
          uri: 'https://maps.google.com/?cid=12345',
          placeId: 'places/abc123',
          placeAnswerSources: {
            reviewSnippets: [
              {
                uri: 'https://maps.google.com/review/1',
                title: 'Відгук про інфраструктуру',
                text: 'Зручний кампус і сучасні коворкінги.',
              },
              {
                uri: 'https://maps.google.com/review/1',
                title: 'Duplicate snippet',
              },
              {
                uri: 'javascript:alert(1)',
                title: 'Blocked scheme',
              },
            ],
          },
        },
      },
      {
        maps: {
          title: 'UNIT.City Duplicate',
          uri: 'https://maps.google.com/?cid=12345',
        },
      },
      {
        maps: {
          title: 'Поділ Коворкінг',
          uri: 'https://maps.google.com/?cid=67890',
        },
      },
    ],
  };

  const places = extractMapsGroundingPlaces(metadata);
  assert.equal(places.length, 2);
  assert.equal(places[0].title, 'UNIT.City');
  assert.equal(places[0].placeId, 'places/abc123');
  assert.equal(places[0].reviewSnippets.length, 1);
  assert.equal(
    places[0].reviewSnippets[0].uri,
    'https://maps.google.com/review/1',
  );
  assert.equal(places[1].title, 'Поділ Коворкінг');
});

test('sanitizeLatLng validates geographic coordinate bounds strictly', () => {
  assert.deepEqual(sanitizeLatLng({ latitude: 50.4501, longitude: 30.5234 }), {
    latitude: 50.4501,
    longitude: 30.5234,
  });
  assert.equal(sanitizeLatLng({ latitude: 95, longitude: 30 }), null);
  assert.equal(sanitizeLatLng({ latitude: 50, longitude: -181 }), null);
  assert.equal(sanitizeLatLng({ latitude: 'abc', longitude: 30 }), null);
  assert.equal(sanitizeLatLng(null), null);
});
