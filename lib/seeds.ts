export type RouteSeed = {
  origin: string;
  destination: string;
  raw_passengers: number;
  note: string;
};

export const DEFAULT_BASKET_ROUTES: RouteSeed[] = [
  { origin: "DEL", destination: "BOM", raw_passengers: 6466940, note: "DGCA-style 2023-24 city-pair passengers" },
  { origin: "DEL", destination: "BLR", raw_passengers: 4779347, note: "DGCA-style 2023-24 city-pair passengers" },
  { origin: "BOM", destination: "BLR", raw_passengers: 4433746, note: "DGCA-style 2023-24 city-pair passengers" },
  { origin: "DEL", destination: "HYD", raw_passengers: 2916911, note: "DGCA-style 2023-24 city-pair passengers" },
  { origin: "DEL", destination: "CCU", raw_passengers: 2821077, note: "DGCA-style 2023-24 city-pair passengers" },
  { origin: "DEL", destination: "PNQ", raw_passengers: 2805587, note: "DGCA-style 2023-24 city-pair passengers" },
  { origin: "BOM", destination: "MAA", raw_passengers: 2486921, note: "DGCA-style 2023-24 city-pair passengers" },
  { origin: "DEL", destination: "AMD", raw_passengers: 2402170, note: "DGCA-style 2023-24 city-pair passengers" },
  { origin: "MAA", destination: "DEL", raw_passengers: 2317258, note: "Delhi-Chennai reverse direction" },
  { origin: "BOM", destination: "HYD", raw_passengers: 2248905, note: "DGCA-style 2023-24 city-pair passengers" },
  { origin: "BLR", destination: "HYD", raw_passengers: 2140533, note: "DGCA-style 2023-24 city-pair passengers" },
  { origin: "DEL", destination: "GOI", raw_passengers: 1800000, note: "Leisure mix estimated volume" },
];

export type DgcaSeed = {
  month: string;
  origin: string | null;
  destination: string | null;
  metric: string;
  value: number;
  note: string;
};

export const DEFAULT_DGCA_BENCHMARK: DgcaSeed[] = [
  {
    month: "2025-03-01",
    origin: null,
    destination: null,
    metric: "tmu_72_route_index",
    value: 100.0,
    note: "DGCA TMU composite rebasing; Mar 2025 = 100",
  },
  {
    month: "2026-06-01",
    origin: null,
    destination: null,
    metric: "tmu_72_route_index",
    value: 120.5,
    note: "Approx +20.5% vs Mar 2025 on 72 domestic sectors",
  },
];

export const DEFAULT_SCRAPE_SOURCES = [
  {
    id: "indigo",
    name: "IndiGo",
    carrier: "6E",
    enabled: true,
    start_url: "https://www.goindigo.in/",
    search_url_template: "https://www.goindigo.in/?from={origin}&to={destination}&date={date}",
  },
  {
    id: "airindia",
    name: "Air India",
    carrier: "AI",
    enabled: true,
    start_url: "https://www.airindia.com/",
    search_url_template: "https://www.airindia.com/?from={origin}&to={destination}&date={date}",
  },
  {
    id: "airindia_express",
    name: "Air India Express",
    carrier: "IX",
    enabled: true,
    start_url: "https://www.airindiaexpress.com/",
    search_url_template: "https://www.airindiaexpress.com/?from={origin}&to={destination}&date={date}",
  },
  {
    id: "akasa",
    name: "Akasa Air",
    carrier: "QP",
    enabled: true,
    start_url: "https://www.akasaair.com/",
    search_url_template: "https://www.akasaair.com/?from={origin}&to={destination}&date={date}",
  },
  {
    id: "spicejet",
    name: "SpiceJet",
    carrier: "SG",
    enabled: true,
    start_url: "https://www.spicejet.com/",
    search_url_template: "https://www.spicejet.com/?from={origin}&to={destination}&date={date}",
  },
];

export const DEFAULT_CSV_TEMPLATE = `source,origin,destination,carrier,flight_no,dep_date,fare_class,lead_time_days,collected_on,base_fare,taxes,udf,convenience,total_fare,status
manual,DEL,BOM,6E,6E201,2026-09-17,ECONOMY,7,2026-09-10,4200,504,350,0,5054,ok
manual,DEL,BOM,AI,AI801,2026-09-17,ECONOMY,7,2026-09-10,4550,546,350,99,5545,ok
manual,DEL,BLR,6E,6E512,2026-09-11,ECONOMY,1,2026-09-10,,,,,8900,ok
manual,BOM,BLR,QP,QP1122,2026-10-01,ECONOMY,21,2026-09-10,3100,372,350,0,3822,ok
`;
