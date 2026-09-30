const CITY: Record<string, string> = {
  DEL: "Delhi",
  BOM: "Mumbai",
  BLR: "Bengaluru",
  HYD: "Hyderabad",
  CCU: "Kolkata",
  MAA: "Chennai",
  PNQ: "Pune",
  AMD: "Ahmedabad",
  GOI: "Goa",
};

export function cityLabel(code: string): string {
  return CITY[code] || code;
}
