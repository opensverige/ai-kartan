// Typer som delas mellan serverfunktionen och webbläsaren.

import type { Etiketter } from '../sokindex.ts';

export interface Kunskap {
  id: string;
  fragor: string[];
  svar: string;
  kalla_url: string;
  kontrollerad: string;
}

export interface Fragedata {
  etiketter: Etiketter;
  faq: Kunskap[];
  kommuner: { kod: string; namn: string }[];
  lan: { kod: string; namn: string }[];
}
