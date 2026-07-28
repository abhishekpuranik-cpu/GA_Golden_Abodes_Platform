/**
 * Smoke tests for V3 DD resolve-link / geocode helpers (no network to Google required).
 */
import assert from 'assert';
import { extractCoordsFromText, extractCoordsFromMapsHtml, isPrivateOrLocalIp } from '../server/lib/v3DdResolveLink.js';
import { geocodeCacheKey, parseGoogleGeocodeResult, roundCoord5 } from '../server/lib/v3DdGeocode.js';

assert.deepStrictEqual(extractCoordsFromText('18.7482, 73.4021'), { lat: 18.7482, lng: 73.4021 });
assert.ok(extractCoordsFromText('https://www.google.com/maps/@18.5204,73.8567,15z'));
assert.equal(extractCoordsFromText('https://www.google.com/maps/@18.5204,73.8567,15z').lat, 18.5204);
assert.ok(extractCoordsFromText('https://maps.google.com/?q=18.5,73.8'));
assert.ok(extractCoordsFromText(`18°44'53.5"N 73°24'07.6"E`));
assert.deepStrictEqual(
  extractCoordsFromMapsHtml('<html>…/@18.74820,73.40210,17z… and !3d18.1!4d73.2</html>'),
  { lat: 18.7482, lng: 73.4021 }
);

assert.equal(isPrivateOrLocalIp('127.0.0.1'), true);
assert.equal(isPrivateOrLocalIp('10.0.0.5'), true);
assert.equal(isPrivateOrLocalIp('192.168.1.1'), true);
assert.equal(isPrivateOrLocalIp('8.8.8.8'), false);
assert.equal(isPrivateOrLocalIp('::1'), true);

assert.equal(roundCoord5(18.74821), 18.74821);
assert.equal(geocodeCacheKey(18.7482199, 73.4021499), geocodeCacheKey(18.74822, 73.40215));

const parsed = parseGoogleGeocodeResult({
  status: 'OK',
  results: [
    {
      formatted_address: 'Test',
      address_components: [
        { long_name: 'Mulshi', types: ['locality'] },
        { long_name: 'Mulshi', types: ['administrative_area_level_3'] },
        { long_name: 'Pune', types: ['administrative_area_level_2'] },
        { long_name: 'Maharashtra', types: ['administrative_area_level_1'] }
      ]
    }
  ]
});
assert.equal(parsed.village, 'Mulshi');
assert.equal(parsed.district, 'Pune');
assert.equal(parsed.state, 'Maharashtra');

console.log('v3-dd geocode/resolve smoke tests OK');
