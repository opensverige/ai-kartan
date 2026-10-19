// Typer som delas mellan serverfunktionen och webbläsaren.

import type { Filter } from '../filter.ts';
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

// Samma gränser i servern och webbläsaren, så ett avvisat anrop och reservvägen räknar likadant.
export const MAX_TECKEN = 300;
export const MAX_FRAGOR = 6;
export const URVAL = 5;
export const TIDSGRANS_MS = 6000;

export type Avsikt = 'hitta' | 'opensverige' | 'manniska' | 'ranking' | 'kontakt' | 'utanfor';

export interface Modellsvar {
  avsikt: Avsikt;
  omrade: string[];
  erbjuder: string[];
  typ: string[];
  plats: string;
  sokord: string[];
  faq: string[];
  manniska: boolean;
  tolkning: string;
}

export interface Tidigare {
  fraga: string;
  filter: Filter;
}

/**
 * Varför modellen inte svarade. saknas, slut, nyckel och modell gör att AI-tolkningen visas som
 * pausad, och övriga att AI:n inte svarade den här gången. modell betyder att leverantören inte
 * känner igen modellen, till exempel när den har tagits bort. Besökaren ser aldrig själva namnet.
 */
export type Modellfelsort = 'saknas' | 'slut' | 'nyckel' | 'modell' | 'begransad' | 'nere' | 'tidsgrans' | 'ogiltig';

export type Svarssort = 'traffar' | 'bred' | 'tomt' | 'manniska' | 'ranking' | 'kontakt' | 'opensverige' | 'utanfor';

export interface Svar {
  sort: Svarssort;
  tolkning: string;
  filter: Filter;
  borttaget: string[];
  okandPlats: string | null;
  kartlank: string;
  totalt: number;
  ids: string[];
  visade: string[];
  regel: 'alla' | 'dagligt';
  skal: Record<string, string[]>;
  faq: string[];
  manniska: boolean;
  utanModell: boolean;
  /** null när modellen svarade eller inte behövdes. */
  modellfel: Modellfelsort | null;
}
