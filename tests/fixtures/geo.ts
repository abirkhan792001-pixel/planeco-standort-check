import type { NominatimHit, OpenPlzLocality } from '@/lib/enrichment/types';

export const PLZ_01067: OpenPlzLocality[] = [{
  postalCode: '01067', name: 'Dresden',
  municipality: { key: '14612000', name: 'Dresden, Stadt', type: 'Kreisfreie Stadt' },
  district: { key: '14612', name: 'Dresden, Stadt', type: 'Kreisfreie Stadt' },
  federalState: { key: '14', name: 'Sachsen' },
}];

export const PLZ_22765: OpenPlzLocality[] = [{
  postalCode: '22765', name: 'Hamburg',
  municipality: { key: '02000000', name: 'Hamburg, Freie und Hansestadt', type: 'Kreisfreie Stadt' },
  federalState: { key: '02', name: 'Hamburg' },
}];

export const PLZ_23627: OpenPlzLocality[] = [
  { postalCode: '23627', name: 'Groß Grönau', municipality: { key: '01053041', name: 'Groß Grönau', type: 'Kreisangehörige Gemeinde' },
    district: { key: '01053', name: 'Herzogtum Lauenburg', type: 'Kreis' }, federalState: { key: '01', name: 'Schleswig-Holstein' } },
  { postalCode: '23627', name: 'Groß Sarau', municipality: { key: '01053043', name: 'Groß Sarau', type: 'Kreisangehörige Gemeinde' },
    district: { key: '01053', name: 'Herzogtum Lauenburg', type: 'Kreis' }, federalState: { key: '01', name: 'Schleswig-Holstein' } },
];

/** #1 Hauptstraße 14, 01067 Dresden → found, but at 01097. */
export const HITS_1: NominatimHit[] = [{
  lat: '51.0589555', lon: '13.7430758', addresstype: 'place',
  address: { house_number: '14', road: 'Hauptstraße', suburb: 'Innere Neustadt', city: 'Dresden', state: 'Sachsen', 'ISO3166-2-lvl4': 'DE-SN', postcode: '01097' },
}];

/** #2 free text "Lindenweg 3, Neustadt" → three towns in three states. */
export const HITS_2: NominatimHit[] = [
  { lat: '47.9221659', lon: '8.2016393', addresstype: 'building',
    address: { house_number: '3', road: 'Lindenweg', town: 'Titisee-Neustadt', 'ISO3166-2-lvl4': 'DE-BW', postcode: '79822' } },
  { lat: '54.0940503', lon: '10.8164464', addresstype: 'building',
    address: { house_number: '3', road: 'Lindenweg', town: 'Neustadt in Holstein', 'ISO3166-2-lvl4': 'DE-SH', postcode: '23730' } },
  { lat: '51.0265220', lon: '14.2491592', addresstype: 'building',
    address: { house_number: '3', road: 'Lindenweg', town: 'Neustadt in Sachsen', 'ISO3166-2-lvl4': 'DE-SN', postcode: '01844' } },
];

/** #3 Osterstraße 88, 22765 Hamburg → street only, at 20255/20259; note: no `state` key for Hamburg. */
export const HITS_3: NominatimHit[] = [
  { lat: '53.5767322', lon: '9.9487538', addresstype: 'road', address: { road: 'Osterstraße', suburb: 'Eimsbüttel', city: 'Hamburg', 'ISO3166-2-lvl4': 'DE-HH', postcode: '20255' } },
  { lat: '53.5774299', lon: '9.9478957', addresstype: 'road', address: { road: 'Osterstraße', suburb: 'Eimsbüttel', city: 'Hamburg', 'ISO3166-2-lvl4': 'DE-HH', postcode: '20255' } },
  { lat: '53.5760613', lon: '9.9520113', addresstype: 'road', address: { road: 'Osterstraße', suburb: 'Eimsbüttel', city: 'Hamburg', 'ISO3166-2-lvl4': 'DE-HH', postcode: '20259' } },
];

/** #5 Am Mühlenteich 7, 23627 Groß Grönau → nothing. */
export const HITS_5: NominatimHit[] = [];

/** What Photon returned for #3 — a confident wrong street. Must be rejected by road verification. */
export const WRONG_STREET_HIT: NominatimHit[] = [{
  lat: '53.5550', lon: '9.9380', addresstype: 'building',
  address: { house_number: '88', road: 'Thadenstraße', city: 'Hamburg', 'ISO3166-2-lvl4': 'DE-HH', postcode: '22767' },
}];

/** A-1 "Flurstück 123/4, Gemarkung Wedel": synthetic (not recorded) - Nominatim resolves only the town, in one municipality. */
export const HITS_WEDEL: NominatimHit[] = [{
  lat: '53.5822', lon: '9.7046', addresstype: 'town', display_name: 'Wedel, Kreis Pinneberg, Schleswig-Holstein, Deutschland',
  address: { town: 'Wedel', county: 'Kreis Pinneberg', 'ISO3166-2-lvl4': 'DE-SH', postcode: '22880' },
}];

/** M4: synthetic - two Osterstraße hits in Hamburg, the first at 20255 (Eimsbüttel), the second at 22765 (Altona). */
export const HITS_OSTERSTRASSE_TWO_PLZ: NominatimHit[] = [
  { lat: '53.5767322', lon: '9.9487538', addresstype: 'road', address: { road: 'Osterstraße', suburb: 'Eimsbüttel', city: 'Hamburg', 'ISO3166-2-lvl4': 'DE-HH', postcode: '20255' } },
  { lat: '53.5530000', lon: '9.9290000', addresstype: 'road', address: { road: 'Osterstraße', suburb: 'Altona-Nord', city: 'Hamburg', 'ISO3166-2-lvl4': 'DE-HH', postcode: '22765' } },
];
