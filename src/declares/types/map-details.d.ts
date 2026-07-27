declare global {
  interface TripDetails {
    destination_addresses: string[];
    origin_addresses: string[];
    rows: Row[];
    status: string;
  }

  interface MapRoute {
    distance: Distance;
    duration: Distance;
    duration_in_traffic: Distance;
    status: string;
  }
}
export {};

interface Row {
  elements: MapRoute[];
}

interface Distance {
  text: string;
  value: number;
}
