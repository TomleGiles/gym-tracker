import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../components/Text';
import { Badge, Button, Card, Field, Icon, Input, PageHeader, Screen } from '../../components/ui';
import { createRoutine } from '../../db/queries/routines';
import { c, font, radius, space } from '../../lib/theme';

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
      <PageHeader eyebrow="TON PROGRAMME, TES RÈGLES" title="Crée ta prochaine séance." subtitle="Commence par un nom. Compose ensuite les exercices, les séries et les temps de repos qui te correspondent." />
      <View style={styles.layout}>
      <Card style={styles.form}>
      <View style={styles.step}><Badge label="01" tone="accent" /><Text style={styles.stepLabel}>L'identité de ta séance</Text></View>
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

      <Button label="Continuer vers les exercices" icon="arrow-forward" size="lg" onPress={submit} disabled={!name.trim()} />
      <Text style={styles.hint}>Tu ajouteras les exercices juste après.</Text>
      </Card>
      <View style={styles.preview}>
        <Text style={styles.previewLabel}>APERÇU</Text>
        <View style={[styles.previewMark, { backgroundColor: color }]}><Icon name="barbell-outline" size={32} color={c.bg} /></View>
        <Text style={styles.previewName}>{name.trim() || 'Ta prochaine séance'}</Text>
        <Text style={styles.previewBody}>{notes.trim() || 'Un objectif clair. Des exercices choisis. Une progression qui se construit séance après séance.'}</Text>
        <View style={styles.previewFoot}><Icon name="layers-outline" size={16} color={c.textDim} /><Text style={styles.hint}>Tes exercices arrivent à l'étape suivante</Text></View>
      </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xl },
  form: { flexGrow: 2, flexShrink: 1, flexBasis: 420, minWidth: 0, maxWidth: '100%', gap: space.xl },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepLabel: { color: c.text, fontSize: 14, fontWeight: '600' },
  preview: { flexGrow: 1, flexShrink: 1, flexBasis: 280, minWidth: 0, maxWidth: '100%', backgroundColor: c.surfaceAlt, borderRadius: radius.xl, padding: space.xl, gap: space.lg, alignSelf: 'flex-start' },
  previewLabel: { color: c.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  previewMark: { width: 64, height: 64, borderRadius: radius.lg, justifyContent: 'center', alignItems: 'center', marginTop: space.sm },
  previewName: { ...font.display, fontSize: 38, lineHeight: 42, color: c.text },
  previewBody: { color: c.textDim, fontSize: 13, lineHeight: 21 },
  previewFoot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.lg },
  colors: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  swatch: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 3, borderColor: 'transparent' },
  swatchActive: { borderColor: c.text },
  notes: { minHeight: 88, paddingTop: space.md, textAlignVertical: 'top' },
  hint: { color: c.textFaint, fontSize: 12, textAlign: 'center' },
});
