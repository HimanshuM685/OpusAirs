import { defineHtmlSource } from "../html-source";
import { PoliteHttp } from "../http";

export const akasa = (http: PoliteHttp) => defineHtmlSource({
  id: "akasa",
  carrier: "QP",
  origin: "https://www.akasaair.com",
  path: "/book/flight-select",
  sourceRank: 16,
}, http);
