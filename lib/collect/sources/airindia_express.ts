import { defineHtmlSource } from "../html-source";
import { PoliteHttp } from "../http";

export const airindiaExpress = (http: PoliteHttp) => defineHtmlSource({
  id: "airindia_express",
  carrier: "IX",
  origin: "https://www.airindiaexpress.com",
  path: "/book/search",
  sourceRank: 14,
}, http);
