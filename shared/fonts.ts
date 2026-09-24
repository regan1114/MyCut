import { z } from 'zod';
import type { FontInfo } from './model';

export const FontPreferencesSchema=z.object({favoriteFontIds:z.array(z.string().min(1).max(100)).max(200).default([])});
export type FontPreferences=z.infer<typeof FontPreferencesSchema>;

// Use library order, independent of the order in which favorites were checked.
export function defaultFontId(fonts:FontInfo[],favorites:string[]){
  return (fonts.find(f=>favorites.includes(f.id))??fonts[0])?.id??'notosanstc';
}
