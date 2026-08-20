import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Input, Screen } from '../../components/ui';
import { createRoutine } from '../../db/queries/routines';
import { c, radius, space } from '../../lib/theme';

export default function NewRoutineScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(c.routineColors[0]);
  const [notes, setNotes] = useState('');

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = createRoutine({ name: trimmed, color, notes });
    // On remplace la modale par l'écran d'édition : la suite logique est
    // toujours « maintenant, ajoute des exercices ».
    router.replace(`/routines/${id}`);
  }

  return (
    <Screen scroll edges={[]}>
      <Field label="Nom" hint="Push 1, Pull 1, Legs A… ce que tu écris sur ton carnet.">
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Push 1"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      </Field>

      <Field label="Couleur">
        <View style={styles.colors}>
          {c.routineColors.map((col) => (
            <Pressable
              key={col}
              onPress={() => setColor(col)}
              accessibilityRole="button"
              accessibilityLabel={`Couleur ${col}`}
              style={[styles.swatch, { backgroundColor: col }, color === col && styles.swatchActive]}
            />
          ))}
        </View>
      </Field>

      <Field label="Notes" hint="Optionnel — une consigne que tu veux relire avant de commencer.">
        <Input
          value={notes}
          onChangeText={setNotes}
          placeholder="Échauffement épaules avant le développé."
          multiline
          style={styles.notes}
        />
      </Field>

      <Button label="Créer la séance" size="lg" onPress={submit} disabled={!name.trim()} />
      <Text style={styles.hint}>Tu ajouteras les exercices juste après.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  colors: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  swatch: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 3, borderColor: 'transparent' },
  swatchActive: { borderColor: c.text },
  notes: { minHeight: 88, paddingTop: space.md, textAlignVertical: 'top' },
  hint: { color: c.textFaint, fontSize: 12, textAlign: 'center' },
});
