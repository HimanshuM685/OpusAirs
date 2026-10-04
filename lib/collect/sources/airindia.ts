import { defineHtmlSource } from "../html-source";
import { PoliteHttp } from "../http";

export const airindia = (http: PoliteHttp) => defineHtmlSource({
  id: "airindia",
  carrier: "AI",
  origin: "https://www.airindia.com",
  path: "/in/en/book/search-flights.html",
  sourceRank: 12,
}, http);
