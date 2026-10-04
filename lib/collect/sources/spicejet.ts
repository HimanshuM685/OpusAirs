import { defineHtmlSource } from "../html-source";
import { PoliteHttp } from "../http";

export const spicejet = (http: PoliteHttp) => defineHtmlSource({
  id: "spicejet",
  carrier: "SG",
  origin: "https://www.spicejet.com",
  path: "/search",
  sourceRank: 18,
}, http);
