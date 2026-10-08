import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from './Text';
import { formatFr, parseFr } from './NumPad';
import { Badge, Button, Field, Icon, IconButton, Input } from './ui';
import type { IconName } from './ui';
import { useQuery } from '../db/client';
import {
  addCardio,
  deleteCardio,
  finishCardioTimer,
  getCardioActivityStats,
  getCardioTimer,
  getLastCardio,
  getSessionCardio,
  listCardioActivities,
  saveCardioTimer,
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
  extendTimer,
  pauseTimer,
  resumeTimer,
  setTimerSpeed,
  speedOf,
  timerDistance,
  timerElapsed,
  timerRemaining,
} from '../lib/cardio';
import type { CardioTimer } from '../lib/cardio';
import { confirmDialog } from '../lib/confirm';
import { mmss, relativeDay } from '../lib/format';
import { cancelRestEnd, scheduleCardioEnd } from '../lib/notifications';
import { useActiveSession } from '../stores/activeSession';
import { c, font, radius, space, type } from '../lib/theme';

/* ------------------------------------------------------------------ *
 * Mode séance : la deuxième partie, après la muscu
 * ------------------------------------------------------------------ */

type Editing = { mode: 'add' } | { mode: 'edit'; entry: CardioEntry };

export function CardioSection({ sessionId }: { sessionId: string }) {
  const entries = useQuery(() => getSessionCardio(sessionId), [sessionId]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const total = entries.reduce((sum, e) => sum + e.durationSec, 0);
  const timer = useCardioTimer(sessionId);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>DEUXIÈME PARTIE</Text>
          <Text style={styles.sectionTitle}>Cardio</Text>
        </View>
        {total > 0 ? <Badge label={cardioDuration(total)} tone="accent" icon="heart-outline" /> : null}
      </View>

      {timer ? <CardioTimerCard state={timer} /> : null}

      {entries.length ? (
        <CardioList entries={entries} onPress={(entry) => setEditing({ mode: 'edit', entry })} />
      ) : timer ? null : (
        <Text style={styles.sectionHint}>Tapis, vélo, rameur… Lance un chrono une fois la muscu terminée.</Text>
      )}

      <Button
        label={timer ? 'Ajouter un cardio déjà fait' : 'Ajouter du cardio'}
        icon="heart-outline"
        variant="secondary"
        onPress={() => setEditing({ mode: 'add' })}
      />

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
 * Chrono : la carte dans la section, la barre en bas de l'écran
 * ------------------------------------------------------------------ */

/** Les machines dont on règle la vitesse : la distance s'en déduit. */
export const takesSpeed = (a: Pick<CardioActivity, 'setting' | 'pace'>) =>
  a.setting === 'gym' && (a.pace === 'per_km' || a.pace === 'speed');

type TimerState = {
  timer: CardioTimer;
  activity: CardioActivity;
  now: number;
  /** Enregistre un nouvel état et reprogramme la notification de fin. */
  update: (next: CardioTimer) => void;
  finish: () => void;
  cancel: () => void;
};

/**
 * Le chrono de cette séance, avec l'horloge qui le fait avancer. Quand il
 * atteint zéro, le cardio est enregistré tout seul : on est sur le tapis,
 * pas devant l'écran.
 */
function useCardioTimer(sessionId: string): TimerState | null {
  const stored = useQuery(() => getCardioTimer(), []);
  const activities = useQuery(() => listCardioActivities(), []);
  const timer = stored?.sessionId === sessionId ? stored : null;
  const activity = timer ? activities.find((a) => a.id === timer.activityId) ?? null : null;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!timer || timer.runningSince === null) return;
    const handle = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(handle);
  }, [timer]);

  // Fin du chrono, y compris quand on rouvre l'app après l'échéance.
  const finished = useRef<string | null>(null);
  useEffect(() => {
    if (!timer || timer.runningSince === null) return;
    if (timerRemaining(timer, Date.now()) > 0) return;
    const key = `${timer.sessionId}:${timer.runningSince}`;
    if (finished.current === key) return;
    finished.current = key;
    finishCardioTimer();
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [timer, now]);

  if (!timer || !activity) return null;

  return {
    timer,
    activity,
    now,
    update: (next) => commitTimer(timer, next, activity.labelFr),
    finish: () => {
      void cancelRestEnd(timer.notificationId);
      finishCardioTimer();
    },
    cancel: () =>
      confirmDialog('Annuler ce cardio ?', "Le chrono s'arrête et rien n'est enregistré.", 'Annuler le cardio', () => {
        void cancelRestEnd(timer.notificationId);
        saveCardioTimer(null);
      }),
  };
}

/** Enregistre l'état du chrono et recale la notification de fin dessus. */
function commitTimer(previous: CardioTimer | null, next: CardioTimer, label: string) {
  if (previous) void cancelRestEnd(previous.notificationId);
  const saved: CardioTimer = { ...next, notificationId: null };
  saveCardioTimer(saved);
  if (saved.runningSince === null) return;
  void scheduleCardioEnd(timerRemaining(saved, Date.now()), label).then((id) => {
    const current = getCardioTimer();
    if (current && current.runningSince === saved.runningSince && current.targetSec === saved.targetSec) {
      saveCardioTimer({ ...current, notificationId: id });
    } else {
      void cancelRestEnd(id);
    }
  });
}

/** Lance un chrono neuf. Le repos de muscu en cours n'a plus de raison d'être. */
export function startCardioTimer(sessionId: string, activity: CardioActivity, targetSec: number, speedKmh: number | null, level: number | null) {
  useActiveSession.getState().stopRest();
  commitTimer(getCardioTimer(), {
    sessionId,
    activityId: activity.id,
    targetSec,
    speedKmh,
    level,
    doneSec: 0,
    doneM: 0,
    runningSince: Date.now(),
    notificationId: null,
  }, activity.labelFr);
}

function CardioTimerCard({ state }: { state: TimerState }) {
  const { timer, activity, now, update, finish, cancel } = state;
  const running = timer.runningSince !== null;
  const remaining = timerRemaining(timer, now);
  const progress = Math.min(1, timerElapsed(timer, now) / timer.targetSec);
  const distance = timerDistance(timer, now);
  const step = (value: number | null, delta: number) => Math.max(0, Math.round(((value ?? 0) + delta) * 2) / 2);

  return (
    <View style={styles.timerCard}>
      <View style={styles.timerHead}>
        <View style={styles.rowIcon}><Icon name={activity.icon as IconName} size={20} color={c.accent} /></View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={1}>{activity.labelFr}</Text>
          <Text style={styles.rowMeta}>{running ? 'En cours' : 'En pause'} · objectif {cardioDuration(timer.targetSec)}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={cancel} hitSlop={8}>
          <Text style={styles.timerCancel}>Annuler</Text>
        </Pressable>
      </View>

      <Text style={[styles.timerClock, font.tabular, !running && { color: c.textDim }]}>{mmss(remaining)}</Text>
      <View style={styles.timerTrack}><View style={[styles.timerFill, { width: `${progress * 100}%` }]} /></View>
      <Text style={[styles.timerMeta, font.tabular]}>
        {[
          `${mmss(timerElapsed(timer, now))} écoulées`,
          distance > 0 ? `≈ ${cardioDistance(distance)}` : null,
        ].filter(Boolean).join(' · ')}
      </Text>

      {takesSpeed(activity) || activity.levelLabel ? (
        <View style={styles.inline}>
          {takesSpeed(activity) ? (
            <Stepper
              label="Vitesse"
              value={timer.speedKmh ? `${formatFr(timer.speedKmh)} km/h` : '—'}
              onMinus={() => update(setTimerSpeed(timer, step(timer.speedKmh, -0.5) || null, Date.now()))}
              onPlus={() => update(setTimerSpeed(timer, step(timer.speedKmh, 0.5), Date.now()))}
            />
          ) : null}
          {activity.levelLabel ? (
            <Stepper
              label={activity.levelLabel.replace(/ \(.*\)/, '')}
              value={timer.level !== null ? formatFr(timer.level) : '—'}
              onMinus={() => update({ ...timer, level: step(timer.level, -0.5) })}
              onPlus={() => update({ ...timer, level: step(timer.level, 0.5) })}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.inline}>
        <View style={styles.flex}>
          <Button
            label={running ? 'Pause' : 'Reprendre'}
            icon={running ? 'pause' : 'play'}
            variant="secondary"
            onPress={() => update(running ? pauseTimer(timer, Date.now()) : resumeTimer(timer, Date.now()))}
          />
        </View>
        <View style={styles.flex}>
          <Button label="+5 min" icon="add" variant="secondary" onPress={() => update(extendTimer(timer, 300))} />
        </View>
      </View>
      <Button label="Terminer et enregistrer" icon="checkmark" onPress={finish} />
    </View>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <IconButton name="remove" accessibilityLabel={`${label} moins`} color={c.text} onPress={onMinus} />
      <View style={styles.stepperText}>
        <Text style={[type.overline, { fontSize: 10 }]}>{label.toUpperCase()}</Text>
        <Text style={[styles.stepperValue, font.tabular]} numberOfLines={1}>{value}</Text>
      </View>
      <IconButton name="add" accessibilityLabel={`${label} plus`} color={c.text} onPress={onPlus} />
    </View>
  );
}

/** Rappel compact en bas de l'écran de séance, à la place du chrono de repos. */
export function CardioTimerBar({ sessionId }: { sessionId: string }) {
  const state = useCardioTimer(sessionId);
  if (!state) return null;
  const { timer, activity, now, update } = state;
  const running = timer.runningSince !== null;
  return (
    <View style={styles.bar}>
      <Icon name={activity.icon as IconName} size={20} color={c.accent} />
      <View style={styles.flex}>
        <Text style={[styles.barClock, font.tabular]}>{mmss(timerRemaining(timer, now))}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{activity.labelFr}{running ? '' : ' · en pause'}</Text>
      </View>
      <IconButton
        name={running ? 'pause' : 'play'}
        accessibilityLabel={running ? 'Mettre le cardio en pause' : 'Reprendre le cardio'}
        color={c.text}
        onPress={() => update(running ? pauseTimer(timer, Date.now()) : resumeTimer(timer, Date.now()))}
      />
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
      <Text style={[type.overline, { fontSize: 10 }]}>{label}</Text>
      <Text style={[styles.libraryValue, font.tabular]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Feuille de saisie : choix de l'activité, puis le formulaire
 * ------------------------------------------------------------------ */

type Draft = { min: string; sec: string; distance: string; calories: string; level: string; speed: string };

const EMPTY: Draft = { min: '', sec: '', distance: '', calories: '', level: '', speed: '' };

function draftFrom(log: CardioLog | null, activity: CardioActivity): Draft {
  if (!log) return EMPTY;
  const meters = distanceInMeters(activity.pace);
  return {
    min: String(Math.floor(log.durationSec / 60)),
    sec: log.durationSec % 60 ? String(log.durationSec % 60) : '',
    distance: log.distanceM ? (meters ? String(Math.round(log.distanceM)) : formatFr(log.distanceM / 1000)) : '',
    calories: log.calories ? String(log.calories) : '',
    level: log.level !== null ? formatFr(log.level) : '',
    // La vitesse n'est pas stockée : elle se retrouve depuis distance et durée.
    speed: takesSpeed(activity) && speedOf(log) ? formatFr(Math.round((speedOf(log) ?? 0) * 3.6 * 2) / 2) : '',
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
  const wide = useWindowDimensions().width >= 700;
  const [activity, setActivity] = useState<CardioActivity | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  /** Saisie à la main d'un cardio déjà fait, plutôt que le chrono. */
  const [manual, setManual] = useState(false);
  const timerRunning = useQuery(() => getCardioTimer() !== null, []);

  const last = useMemo(
    () => (activity && editing?.mode === 'add' ? getLastCardio(activity.id, sessionId) : null),
    [activity, editing, sessionId],
  );

  // Chaque ouverture repart de zéro ; une modification arrive pré-remplie.
  useEffect(() => {
    setError(null);
    setManual(editing?.mode === 'edit' || getCardioTimer() !== null);
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
    const next = draftFrom(getLastCardio(a.id, sessionId), a);
    setDraft(next.min ? next : { ...next, min: '30' });
  }

  function launch() {
    if (!activity) return;
    const minutes = parseFr(draft.min);
    if (minutes <= 0) {
      setError('Indique une durée.');
      return;
    }
    const speed = parseFr(draft.speed);
    startCardioTimer(
      sessionId,
      activity,
      Math.round(minutes * 60),
      takesSpeed(activity) && speed > 0 ? speed : null,
      activity.levelLabel && draft.level.trim() ? parseFr(draft.level) : null,
    );
    onClose();
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.sheetWrap, wide && styles.sheetWrapWide]} pointerEvents="box-none">
        <SafeAreaView edges={wide ? [] : ['bottom']} style={[styles.sheet, wide && styles.sheetWide]}>
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

          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
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
            ) : !manual ? (
              <View style={styles.form}>
                <View style={styles.inline}>
                  <View style={styles.flex}>
                    <Field label="Durée">
                      <View style={styles.inline}>
                        <Input value={draft.min} onChangeText={(min) => patch({ min })} keyboardType="number-pad" placeholder="30" style={styles.flex} accessibilityLabel="Durée en minutes" />
                        <Text style={styles.unit}>min</Text>
                      </View>
                    </Field>
                  </View>
                  {takesSpeed(activity) ? (
                    <View style={styles.flex}>
                      <Field label="Vitesse">
                        <View style={styles.inline}>
                          <Input value={draft.speed} onChangeText={(speed) => patch({ speed })} keyboardType="decimal-pad" placeholder="10" style={styles.flex} accessibilityLabel="Vitesse en km/h" />
                          <Text style={styles.unit}>km/h</Text>
                        </View>
                      </Field>
                    </View>
                  ) : null}
                </View>
                {activity.levelLabel ? (
                  <Field label={activity.levelLabel}>
                    <Input value={draft.level} onChangeText={(level) => patch({ level })} keyboardType="decimal-pad" placeholder="Facultatif" accessibilityLabel={activity.levelLabel} />
                  </Field>
                ) : null}
                <Text style={styles.sectionHint}>
                  Le chrono démarre tout de suite. À la fin, le cardio est enregistré tout seul{takesSpeed(activity) ? ', avec la distance déduite de ta vitesse' : ''}.
                </Text>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Button label={`Lancer · ${draft.min || '0'} min`} icon="play" size="lg" onPress={launch} />
                <Pressable accessibilityRole="button" onPress={() => setManual(true)}>
                  <Text style={styles.modeLink}>Déjà fait ? Saisir à la main</Text>
                </Pressable>
              </View>
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
                ) : !timerRunning ? (
                  <Pressable accessibilityRole="button" onPress={() => setManual(false)}>
                    <Text style={styles.modeLink}>Lancer un chrono plutôt</Text>
                  </Pressable>
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

  timerCard: { gap: space.md, padding: space.lg, borderRadius: radius.xl, backgroundColor: c.surface, borderWidth: 1, borderColor: c.accent },
  timerHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  timerCancel: { color: c.textFaint, fontSize: 12, textDecorationLine: 'underline' },
  timerClock: { ...font.display, fontSize: 72, lineHeight: 76, color: c.text, textAlign: 'center' },
  timerTrack: { height: 6, borderRadius: radius.pill, backgroundColor: c.surfaceHigh, overflow: 'hidden' },
  timerFill: { height: 6, borderRadius: radius.pill, backgroundColor: c.accent },
  timerMeta: { color: c.textDim, fontSize: 12, textAlign: 'center' },
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: radius.lg, paddingHorizontal: 4 },
  stepperText: { flex: 1, alignItems: 'center', minWidth: 0 },
  stepperValue: { ...font.display, fontSize: 22, color: c.text },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.accent },
  barClock: { ...font.display, fontSize: 26, lineHeight: 28, color: c.text },
  modeLink: { color: c.textDim, fontSize: 13, textAlign: 'center', textDecorationLine: 'underline', paddingVertical: space.sm },

  libraryGroups: { gap: space.xl },
  libraryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  libraryCard: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: 20, gap: 18 },
  libraryHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  libraryRecords: { flexDirection: 'row', gap: space.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 14 },
  libraryValue: { ...font.display, fontSize: 22, color: c.text, marginTop: 4 },

  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.78)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  // Sur grand écran, une feuille collée en bas d'une fenêtre large se lit mal : boîte centrée.
  sheetWrapWide: { justifyContent: 'center', padding: space.xl },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '92%', alignSelf: 'center', backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
  sheetWide: { maxHeight: '100%', borderRadius: radius.xl },
  // Sans ça, sur un écran peu haut, le contenu dépasse la feuille au lieu d'y défiler.
  sheetScroll: { flexShrink: 1 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg, paddingBottom: space.sm },
  sheetTitle: { ...font.display, fontSize: 28, lineHeight: 32, color: c.text },
  sheetBody: { padding: space.lg, paddingTop: space.sm, gap: space.xl },

  group: { gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '31.5%', minHeight: 88, padding: space.md, gap: space.sm, borderRadius: radius.lg, backgroundColor: c.surfaceAlt, justifyContent: 'space-between' },
  // 12 px : « d'appartement » doit tenir sur une ligne d'une tuile au tiers d'un téléphone.
  tileLabel: { color: c.text, fontSize: 12, fontWeight: '600', lineHeight: 16 },

  form: { gap: space.lg },
  lastTime: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceAlt },
  lastTimeText: { color: c.textDim, fontSize: 12, flex: 1, lineHeight: 17 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  unit: { color: c.textDim, fontSize: 13, minWidth: 22 },
  error: { color: c.danger, fontSize: 13 },
});
