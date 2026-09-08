export interface Preferences {
  read(key: string): string;
  write(key: string, value: string): boolean;
  saved(actor: string): string[];
}
