import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { db } from '../db/client';
import {
  cardioLog,
  exercise,
  exerciseMuscle,
  routine,
  routineItem,
  session,
  sessionExercise,
  setLog,
} from '../db/schema';
import { SEED_VERSION } from '../db/seed';

/**
 * Sauvegarde JSON (§7 : « V1 = local seul, une sauvegarde par export JSON »).
 *
 * Le référentiel seedé n'est pas exporté — il est livré avec l'app et se
 * régénère. Seuls partent les exercices personnalisés et les données qui
 * n'existent que sur cet appareil.
 */
export function buildBackup(): string {
  const custom = db.select().from(exercise).all().filter((e) => e.isCustom);
  const customIds = new Set(custom.map((e) => e.id));

  return JSON.stringify(
    {
      format: 'muscu-tracker/backup',
      version: 1,
      seedVersion: SEED_VERSION,
      exportedAt: new Date().toISOString(),
      customExercises: custom,
      customExerciseMuscles: db
        .select()
        .from(exerciseMuscle)
        .all()
        .filter((m) => customIds.has(m.exerciseId)),
      routines: db.select().from(routine).all(),
      routineItems: db.select().from(routineItem).all(),
      sessions: db.select().from(session).all(),
      sessionExercises: db.select().from(sessionExercise).all(),
      setLogs: db.select().from(setLog).all(),
      cardioLogs: db.select().from(cardioLog).all(),
    },
    null,
    2,
  );
}

const filename = () => `muscu-tracker-${new Date().toISOString().slice(0, 10)}.json`;

/** Déclenche le partage (natif) ou le téléchargement (web) de la sauvegarde. */
export async function exportBackup(): Promise<void> {
  const json = buildBackup();

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename();
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new FileSystem.File(FileSystem.Paths.cache, filename());
  if (file.exists) file.delete();
  file.create();
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Sauvegarde Muscu Tracker',
      UTI: 'public.json',
    });
  }
}
