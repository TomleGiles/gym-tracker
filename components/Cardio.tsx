import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from './Text';
import { formatFr, parseFr } from './NumPad';
import { Badge, Button, Field, Icon, IconButton, Input } from './ui';
import type { IconName } from './ui';
import { useQuery } from '../db/client';
import {
  addCardio,
  deleteCardio,
  getCardioActivityStats,
  getLastCardio,
  getSessionCardio,
  listCardioActivities,
  updateCardio,
} from '../db/queries/cardio';
import type { CardioEntry, CardioInput } from '../db/queries/cardio';
import type { CardioActivity, CardioLog } from '../db/schema';
import {
  CARDIO_RECORD_LABEL,
  cardioDistance,
  cardioDuration,
  cardioPace,
  cardioSummary,
  distanceInMeters,
  speedOf,
} from '../lib/cardio';
import { confirmDialog } from '../lib/confirm';
import { relativeDay } from '../lib/format';
import { c, font, radius, space, type } from '../lib/theme';

/* ------------------------------------------------------------------ *
 * Mode séance : la deuxième partie, après la muscu
 * ------------------------------------------------------------------ */

type Editing = { mode: 'add' } | { mode: 'edit'; entry: CardioEntry };

export function CardioSection({ sessionId }: { sessionId: string }) {
  const entries = useQuery(() => getSessionCardio(sessionId), [sessionId]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const total = entries.reduce((sum, e) => sum + e.durationSec, 0);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>DEUXIÈME PARTIE</Text>
          <Text style={styles.sectionTitle}>Cardio</Text>
        </View>
        {total > 0 ? <Badge label={cardioDuration(total)} tone="accent" icon="heart-outline" /> : null}
      </View>

      {entries.length ? (
        <CardioList entries={entries} onPress={(entry) => setEditing({ mode: 'edit', entry })} />
      ) : (
        <Text style={styles.sectionHint}>Tapis, vélo, rameur… Ajoute ton cardio une fois la muscu terminée.</Text>
      )}

      <Button label="Ajouter du cardio" icon="heart-outline" variant="secondary" onPress={() => setEditing({ mode: 'add' })} />

      <CardioSheet sessionId={sessionId} editing={editing} onClose={() => setEditing(null)} />
    </View>
  );
}

/** Les activités d'une séance. Touchables en séance, en lecture seule ailleurs. */
export function CardioList({ entries, onPress }: { entries: CardioEntry[]; onPress?: (entry: CardioEntry) => void }) {
  return (
    <View style={styles.list}>
      {entries.map((entry) => {
        const body = (
          <>
            <View style={styles.rowIcon}><Icon name={entry.activity.icon as IconName} size={20} color={c.accent} /></View>
            <View style={styles.flex}>
              <Text style={styles.rowTitle} numberOfLines={1}>{entry.activity.labelFr}</Text>
              <Text style={[styles.rowMeta, font.tabular]}>{cardioSummary(entry.activity, entry)}</Text>
              {entry.records.length ? (
                <View style={styles.badges}>
                  {entry.records.map((r) => <Badge key={r} label={CARDIO_RECORD_LABEL[r]} tone="pr" icon="trophy" />)}
                </View>
              ) : null}
            </View>
            {entry.level !== null && entry.activity.levelLabel ? (
              <Text style={styles.rowLevel}>{entry.activity.levelLabel.replace(/ \(.*\)/, '')} {formatFr(entry.level)}</Text>
            ) : null}
            {onPress ? <Icon name="create-outline" size={17} color={c.textFaint} /> : null}
          </>
        );
        return onPress ? (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={`Modifier ${entry.activity.labelFr}`}
            onPress={() => onPress(entry)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceAlt }]}
          >
            {body}
          </Pressable>
        ) : (
          <View key={entry.id} style={styles.row}>{body}</View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Bibliothèque : les activités et leurs records
 * ------------------------------------------------------------------ */

export function CardioLibrary({ columns }: { columns: number }) {
  const stats = useQuery(() => getCardioActivityStats(), []);
  return (
    <View style={styles.libraryGroups}>
      {(['gym', 'outdoor'] as const).map((setting) => (
        <View key={setting} style={styles.group}>
          <Text style={type.overline}>{setting === 'gym' ? 'EN SALLE' : 'EN EXTÉRIEUR'}</Text>
          <View style={styles.libraryGrid}>
            {stats.filter((s) => s.activity.setting === setting).map((s) => {
              const pace = cardioPace(s.activity.pace, s.bestSpeed);
              return (
                <View key={s.activity.id} style={[styles.libraryCard, { width: columns > 1 ? `${100 / columns - 1.5}%` : '100%' }]}>
                  <View style={styles.libraryHead}>
                    <View style={styles.rowIcon}><Icon name={s.activity.icon as IconName} size={22} color={c.accent} /></View>
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{s.activity.labelFr}</Text>
                      <Text style={styles.rowMeta}>
                        {s.count ? `${s.count} fois · ${relativeDay(s.lastAt ?? '')}` : 'Pas encore pratiquée'}
                      </Text>
                    </View>
                  </View>
                  {s.count ? (
                    <View style={styles.libraryRecords}>
                      <LibraryRecord label="PLUS LONG" value={cardioDuration(s.bestDurationSec)} />
                      {s.bestDistanceM ? <LibraryRecord label="PLUS LOIN" value={cardioDistance(s.bestDistanceM)} /> : null}
                      {pace ? <LibraryRecord label="PLUS RAPIDE" value={pace} /> : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function LibraryRecord({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.flex}>
      <Text style={[type.overline, { fontSize: 9 }]}>{label}</Text>
      <Text style={[styles.libraryValue, font.tabular]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Feuille de saisie : choix de l'activité, puis le formulaire
 * ------------------------------------------------------------------ */

type Draft = { min: string; sec: string; distance: string; calories: string; level: string };

const EMPTY: Draft = { min: '', sec: '', distance: '', calories: '', level: '' };

function draftFrom(log: CardioLog | null, activity: CardioActivity): Draft {
  if (!log) return EMPTY;
  const meters = distanceInMeters(activity.pace);
  return {
    min: String(Math.floor(log.durationSec / 60)),
    sec: log.durationSec % 60 ? String(log.durationSec % 60) : '',
    distance: log.distanceM ? (meters ? String(Math.round(log.distanceM)) : formatFr(log.distanceM / 1000)) : '',
    calories: log.calories ? String(log.calories) : '',
    level: log.level !== null ? formatFr(log.level) : '',
  };
}

function inputFrom(draft: Draft, activity: CardioActivity): CardioInput {
  const durationSec = Math.round(parseFr(draft.min) * 60 + parseFr(draft.sec));
  const distance = parseFr(draft.distance);
  return {
    durationSec,
    distanceM: activity.pace && distance > 0 ? (distanceInMeters(activity.pace) ? distance : distance * 1000) : null,
    calories: parseFr(draft.calories) > 0 ? Math.round(parseFr(draft.calories)) : null,
    level: activity.levelLabel && draft.level.trim() ? parseFr(draft.level) : null,
  };
}

function CardioSheet({ sessionId, editing, onClose }: { sessionId: string; editing: Editing | null; onClose: () => void }) {
  const activities = useQuery(() => listCardioActivities(), []);
  const [activity, setActivity] = useState<CardioActivity | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const last = useMemo(
    () => (activity && editing?.mode === 'add' ? getLastCardio(activity.id, sessionId) : null),
    [activity, editing, sessionId],
  );

  // Chaque ouverture repart de zéro ; une modification arrive pré-remplie.
  useEffect(() => {
    setError(null);
    if (editing?.mode === 'edit') {
      setActivity(editing.entry.activity);
      setDraft(draftFrom(editing.entry, editing.entry.activity));
    } else {
      setActivity(null);
      setDraft(EMPTY);
    }
  }, [editing]);

  function pick(a: CardioActivity) {
    setActivity(a);
    // Comme pour la muscu : la dernière fois est déjà saisie, on ajuste.
    setDraft(draftFrom(getLastCardio(a.id, sessionId), a));
  }

  function save() {
    if (!activity || !editing) return;
    const input = inputFrom(draft, activity);
    if (input.durationSec <= 0) {
      setError('Indique au moins une durée.');
      return;
    }
    if (editing.mode === 'edit') updateCardio(editing.entry.id, input);
    else addCardio(sessionId, activity.id, input);
    onClose();
  }

  function remove() {
    if (editing?.mode !== 'edit') return;
    const { entry } = editing;
    confirmDialog('Supprimer ce cardio ?', `${entry.activity.labelFr} · ${cardioDuration(entry.durationSec)}`, 'Supprimer', () => {
      deleteCardio(entry.id);
      onClose();
    });
  }

  const patch = (p: Partial<Draft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...p }));
  };

  const preview = activity ? inputFrom(draft, activity) : null;
  const pace = activity && preview ? cardioPace(activity.pace, speedOf(preview)) : null;
  const meters = distanceInMeters(activity?.pace ?? null);

  return (
    <Modal visible={!!editing} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.sheetHead}>
            {activity && editing?.mode === 'add' ? (
              <IconButton name="chevron-back" accessibilityLabel="Changer d'activité" color={c.text} onPress={() => setActivity(null)} />
            ) : null}
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>{editing?.mode === 'edit' ? 'MODIFIER' : 'AJOUTER DU CARDIO'}</Text>
              <Text style={styles.sheetTitle} numberOfLines={1}>{activity?.labelFr ?? 'Quelle activité ?'}</Text>
            </View>
            <IconButton name="close" accessibilityLabel="Fermer" color={c.text} onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {!activity ? (
              (['gym', 'outdoor'] as const).map((setting) => (
                <View key={setting} style={styles.group}>
                  <Text style={type.overline}>{setting === 'gym' ? 'EN SALLE' : 'EN EXTÉRIEUR'}</Text>
                  <View style={styles.grid}>
                    {activities.filter((a) => a.setting === setting).map((a) => (
                      <Pressable
                        key={a.id}
                        accessibilityRole="button"
                        onPress={() => pick(a)}
                        style={({ pressed }) => [styles.tile, pressed && { backgroundColor: c.surfaceHigh }]}
                      >
                        <Icon name={a.icon as IconName} size={22} color={c.accent} />
                        <Text style={styles.tileLabel} numberOfLines={2}>{a.labelFr}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.form}>
                {last ? (
                  <View style={styles.lastTime}>
                    <Icon name="time-outline" size={15} color={c.textFaint} />
                    <Text style={styles.lastTimeText}>
                      Dernière fois, {relativeDay(last.loggedAt)} : {cardioSummary(activity, last)}
                    </Text>
                  </View>
                ) : null}

                <Field label="Durée">
                  <View style={styles.inline}>
                    <Input value={draft.min} onChangeText={(min) => patch({ min })} keyboardType="number-pad" placeholder="25" style={styles.flex} accessibilityLabel="Minutes" />
                    <Text style={styles.unit}>min</Text>
                    <Input value={draft.sec} onChangeText={(sec) => patch({ sec })} keyboardType="number-pad" placeholder="00" style={styles.flex} accessibilityLabel="Secondes" />
                    <Text style={styles.unit}>s</Text>
                  </View>
                </Field>

                {activity.pace ? (
                  <Field label="Distance" hint={pace ? `Allure : ${pace}` : undefined}>
                    <View style={styles.inline}>
                      <Input value={draft.distance} onChangeText={(distance) => patch({ distance })} keyboardType="decimal-pad" placeholder={meters ? '2000' : '4,5'} style={styles.flex} accessibilityLabel="Distance" />
                      <Text style={styles.unit}>{meters ? 'm' : 'km'}</Text>
                    </View>
                  </Field>
                ) : null}

                <View style={styles.inline}>
                  <View style={styles.flex}>
                    <Field label="Calories">
                      <Input value={draft.calories} onChangeText={(calories) => patch({ calories })} keyboardType="number-pad" placeholder="Facultatif" accessibilityLabel="Calories" />
                    </Field>
                  </View>
                  {activity.levelLabel ? (
                    <View style={styles.flex}>
                      <Field label={activity.levelLabel}>
                        <Input value={draft.level} onChangeText={(level) => patch({ level })} keyboardType="decimal-pad" placeholder="Facultatif" accessibilityLabel={activity.levelLabel} />
                      </Field>
                    </View>
                  ) : null}
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Button label={editing?.mode === 'edit' ? 'Enregistrer' : 'Ajouter'} icon="checkmark" size="lg" onPress={save} />
                {editing?.mode === 'edit' ? (
                  <Button label="Supprimer" icon="trash-outline" variant="danger" onPress={remove} />
                ) : null}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: space.md, marginTop: space.lg, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: c.border },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  eyebrow: { ...type.overline, color: c.accent, fontSize: 10, letterSpacing: 1.8 },
  sectionTitle: { ...font.display, fontSize: 32, lineHeight: 36, color: c.text },
  sectionHint: { color: c.textDim, fontSize: 13, lineHeight: 19 },

  list: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border },
  rowIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: c.accentDim, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
  rowMeta: { color: c.textDim, fontSize: 12, marginTop: 3 },
  rowLevel: { color: c.textFaint, fontSize: 11 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },

  libraryGroups: { gap: space.xl },
  libraryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  libraryCard: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 20, gap: 18 },
  libraryHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  libraryRecords: { flexDirection: 'row', gap: space.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 14 },
  libraryValue: { ...font.display, fontSize: 22, color: c.text, marginTop: 4 },

  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.78)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '92%', alignSelf: 'center', backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: c.border },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg, paddingBottom: space.sm },
  sheetTitle: { ...font.display, fontSize: 28, lineHeight: 32, color: c.text },
  sheetBody: { padding: space.lg, paddingTop: space.sm, gap: space.xl },

  group: { gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '31.5%', minHeight: 88, padding: space.md, gap: space.sm, borderRadius: radius.lg, backgroundColor: c.surfaceAlt, justifyContent: 'space-between' },
  tileLabel: { color: c.text, fontSize: 13, fontWeight: '600', lineHeight: 17 },

  form: { gap: space.lg },
  lastTime: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceAlt },
  lastTimeText: { color: c.textDim, fontSize: 12, flex: 1, lineHeight: 17 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  unit: { color: c.textDim, fontSize: 13, minWidth: 22 },
  error: { color: c.danger, fontSize: 13 },
});
