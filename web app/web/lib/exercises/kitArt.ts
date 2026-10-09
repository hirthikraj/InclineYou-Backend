/**
 * WHICH KIT HAS A DRAWING OF ITS OWN.
 *
 * Read by two things that must agree: the tile art (`components/exercises/TileArt.tsx`, which draws it) and
 * `wantsList` in `tabs.ts` (which decides, on the server, whether a category opens onto tiles or straight onto a list
 * with a filter). A kit kept in one place only would be a category that draws tiles for some kinds and not others.
 *
 * Kept free of React so the server can import it.
 */

export type ArtKey =
  | 'bodyweight_family' | 'traditional_family' | 'tools_family' | 'cable_family' | 'bands_family' | 'free_weights' | 'cardio_machines' | 'barbell' | 'dumbbell' | 'kettlebell' | 'ez_bar' | 'trap_bar' | 'weight_plate' | 'body_weight'
  | 'cable' | 'smith' | 'machine' | 'treadmill' | 'bike'
  | 'band' | 'mini_band' | 'suspension' | 'stability_ball' | 'medicine_ball' | 'battle_rope'
  | 'skipping_rope' | 'sled' | 'ab_wheel' | 'roller' | 'sandbag' | 'gada' | 'club' | 'tire'
  | 'elliptical' | 'rower' | 'stairs' | 'airbike';

/** The library's own `equipment.key` → the picture that draws it. Anything absent falls to its category. */
export const KEY_ART: Record<string, ArtKey> = {
  barbell: 'barbell', dumbbell: 'dumbbell', kettlebell: 'kettlebell', ez_bar: 'ez_bar', trap_bar: 'trap_bar',
  weight_plate: 'weight_plate', body_weight: 'body_weight', cable: 'cable', smith_machine: 'smith',
  treadmill: 'treadmill', stationary_bike: 'bike', air_bike: 'airbike',
  elliptical_machine: 'elliptical', rowing_machine: 'rower', stair_climber_machine: 'stairs',
  resistance_band: 'band', mini_band: 'mini_band', suspension_trainer: 'suspension', stability_ball: 'stability_ball',
  medicine_ball: 'medicine_ball', battle_rope: 'battle_rope', skipping_rope: 'skipping_rope', sled: 'sled',
  ab_wheel: 'ab_wheel', roller: 'roller', sandbag: 'sandbag', gada_mace: 'gada', indian_club: 'club', tire: 'tire',
};

/** Does this kit have a drawing of its own, rather than its family's? A picture repeated on twenty tiles says nothing. */
export const hasOwnArt = (equipmentKey: string): boolean => equipmentKey in KEY_ART;
