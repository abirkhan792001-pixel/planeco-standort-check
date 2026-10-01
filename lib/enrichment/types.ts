export type OpenPlzLocality = {
  postalCode: string;
  name: string;
  municipality?: { key: string; name: string; type?: string };
  district?: { key: string; name: string; type?: string };
  federalState: { key: string; name: string };
};

export type NominatimHit = {
  lat: string;
  lon: string;
  addresstype?: string;
  display_name?: string;
  address: Record<string, string | undefined>;
};
