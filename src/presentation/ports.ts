/** How tightly the desktop timeline is set; phones always read comfortably. */
export type Density = 'comfortable' | 'compact';
export const isDensity = (value: unknown): value is Density =>
  value === 'comfortable' || value === 'compact';

/** Browser persistence as the view model sees it: IDs only, never drafts, tokens or content. */
export interface Preferences {
  read(key: string): string;
  write(key: string, value: string): boolean;
  /** Saved note IRIs for one actor; storage key and format belong to the adapter. */
  readSaved(actor: string): string[];
  /** Replaces the saved list; false when the browser store is unavailable. */
  writeSaved(actor: string, ids: string[]): boolean;
  /** The reading density this browser last chose; comfortable when nothing is stored. */
  readDensity(): Density;
  writeDensity(density: Density): boolean;
  /** Whether every content-warned note opens by itself in this browser; off when unset. */
  readRevealWarned(): boolean;
  writeRevealWarned(on: boolean): boolean;
}
